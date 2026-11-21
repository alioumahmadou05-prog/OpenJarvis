"""Website integrations: health checks, page snapshots, and the browser bridge.

A registered site is checked over HTTP (status, latency, page title). Sites can
also include ``bridge.js``, which reports JavaScript errors, failed requests and
custom events back to JARVIS so it can explain what is happening inside them.
Secrets (API tokens) live in a 0600 file next to the database and are never
returned by the API.
"""

from __future__ import annotations

import json
import re
import threading
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx

try:
    from openjarvis.security.file_utils import secure_write_text
except Exception:  # pragma: no cover - fallback outside the full package

    def secure_write_text(
        path: Path, text: str, mode: int = 0o600, encoding: str = "utf-8"
    ) -> None:  # type: ignore[misc]
        Path(path).write_text(text, encoding=encoding)
        Path(path).chmod(mode)


USER_AGENT = "NxxR-JARVIS/1.0 (+site monitor)"


class SecretStore:
    """Tiny key→secret map in a 0600 JSON file."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()

    def _load(self) -> Dict[str, str]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def get(self, key: str) -> str:
        return self._load().get(key, "")

    def set(self, key: str, value: str) -> None:
        with self._lock:
            data = self._load()
            if value:
                data[key] = value
            else:
                data.pop(key, None)
            secure_write_text(self.path, json.dumps(data), mode=0o600, encoding="utf-8")

    def has(self, key: str) -> bool:
        return bool(self.get(key))


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.headings: List[str] = []
        self.links: List[str] = []
        self.forms = 0
        self.scripts = 0
        self.images_without_alt = 0
        self._in = ""
        self._buf = ""
        self._skip = 0
        self.text: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        a = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self._skip += 1
            if tag == "script":
                self.scripts += 1
        if tag in ("title", "h1", "h2", "h3"):
            self._in, self._buf = tag, ""
        elif tag == "meta" and (a.get("name") or "").lower() == "description":
            self.description = (a.get("content") or "")[:300]
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "form":
            self.forms += 1
        elif tag == "img" and not (a.get("alt") or "").strip():
            self.images_without_alt += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = max(0, self._skip - 1)
        if tag == self._in:
            t = " ".join(self._buf.split())
            if tag == "title":
                self.title = t[:200]
            elif t:
                self.headings.append(f"{tag}: {t[:120]}")
            self._in = ""

    def handle_data(self, data: str) -> None:
        if self._in:
            self._buf += data
        if not self._skip and data.strip():
            self.text.append(data.strip())


def _headers(site: Dict[str, Any], secrets: Optional[SecretStore]) -> Dict[str, str]:
    h = {"User-Agent": USER_AGENT}
    token = secrets.get(f"site:{site['id']}") if secrets else ""
    if token and site.get("auth_method") == "bearer":
        h["Authorization"] = f"Bearer {token}"
    elif token and site.get("auth_method") == "header":
        h[site.get("auth_header") or "Authorization"] = token
    return h


def check_site(
    site: Dict[str, Any], secrets: Optional[SecretStore] = None, timeout: float = 10.0
) -> Dict[str, Any]:
    """GET the site (or its health path). Returns status fields for the store."""
    url = (
        urljoin(site["url"], site.get("health_path") or "")
        if site.get("health_path")
        else site["url"]
    )
    if urlparse(url).scheme not in ("http", "https"):
        return {
            "status": "unsupported",
            "status_code": None,
            "latency_ms": None,
            "last_error": "Only http(s) URLs can be checked. For a local HTML file, serve it (or use the bridge).",
            "last_check": time.time(),
        }
    t0 = time.perf_counter()
    try:
        r = httpx.get(
            url, headers=_headers(site, secrets), timeout=timeout, follow_redirects=True
        )
        ms = int((time.perf_counter() - t0) * 1000)
        title = ""
        if "html" in r.headers.get("content-type", ""):
            p = _PageParser()
            try:
                p.feed(r.text[:400_000])
            except Exception:
                pass
            title = p.title
        status = "up" if r.status_code < 400 else "down"
        if status == "up" and ms > 4000:
            status = "slow"
        return {
            "status": status,
            "status_code": r.status_code,
            "latency_ms": ms,
            "page_title": title,
            "last_error": "" if r.status_code < 400 else f"HTTP {r.status_code}",
            "last_check": time.time(),
        }
    except httpx.HTTPError as exc:
        return {
            "status": "down",
            "status_code": None,
            "latency_ms": None,
            "last_error": f"{type(exc).__name__}: {str(exc)[:200]}",
            "last_check": time.time(),
        }


def snapshot(
    site: Dict[str, Any], secrets: Optional[SecretStore] = None, timeout: float = 15.0
) -> Dict[str, Any]:
    """Read the page (read permission) and describe its structure."""
    r = httpx.get(
        site["url"],
        headers=_headers(site, secrets),
        timeout=timeout,
        follow_redirects=True,
    )
    p = _PageParser()
    p.feed(r.text[:800_000])
    base = str(r.url)
    host = urlparse(base).netloc
    internal = sorted(
        {
            urljoin(base, link).split("#")[0]
            for link in p.links
            if urlparse(urljoin(base, link)).netloc == host
        }
    )
    external = sorted(
        {
            urljoin(base, link)
            for link in p.links
            if urlparse(urljoin(base, link)).scheme in ("http", "https")
            and urlparse(urljoin(base, link)).netloc != host
        }
    )
    text = re.sub(r"\s+", " ", " ".join(p.text))[:4000]
    issues = []
    if not p.title:
        issues.append("The page has no <title>.")
    if not p.description:
        issues.append("No meta description (hurts search previews).")
    if p.images_without_alt:
        issues.append(
            f"{p.images_without_alt} image(s) without alt text (accessibility)."
        )
    if not any(h.startswith("h1") for h in p.headings):
        issues.append("No <h1> heading.")
    return {
        "url": base,
        "status_code": r.status_code,
        "title": p.title,
        "description": p.description,
        "headings": p.headings[:40],
        "internal_links": internal[:80],
        "external_links": external[:40],
        "forms": p.forms,
        "scripts": p.scripts,
        "text_excerpt": text,
        "issues": issues,
        "fetched_at": time.time(),
    }


BRIDGE_JS = r"""/* NxxR JARVIS bridge: add to any page you own.
   <script src="http://localhost:8000/v1/nxxr/bridge.js" data-key="SITE_KEY"></script>
   Reports JS errors, failed fetches and NxxR.event(...) calls to your local JARVIS.
   Uses sendBeacon (no cookies, no page data beyond what you send). */
(function () {
  var s = document.currentScript; if (!s) return;
  var key = s.getAttribute("data-key"); if (!key) return;
  var endpoint = s.src.replace(/\/bridge\.js.*$/, "/sites/ingest?key=" + encodeURIComponent(key));
  function send(level, kind, message, data) {
    try {
      var body = JSON.stringify({ level: level, kind: kind, message: String(message).slice(0, 2000), page: location.pathname + location.search, data: data || {} });
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
      else fetch(endpoint, { method: "POST", body: body, mode: "no-cors", keepalive: true });
    } catch (e) {}
  }
  window.addEventListener("error", function (e) { send("error", "js_error", e.message || "Script error", { source: e.filename, line: e.lineno, col: e.colno }); });
  window.addEventListener("unhandledrejection", function (e) { send("error", "promise_rejection", (e.reason && (e.reason.message || e.reason)) || "Unhandled rejection"); });
  if (window.fetch) {
    var f = window.fetch;
    window.fetch = function (input, init) {
      return f.apply(this, arguments).then(function (r) { if (r.status >= 500) send("error", "http_error", r.status + " " + (r.url || input)); else if (r.status >= 400) send("warn", "http_error", r.status + " " + (r.url || input)); return r; },
        function (err) { if (String(input).indexOf("/sites/ingest") < 0) send("error", "network_error", (err && err.message) + " " + input); throw err; });
    };
  }
  send("info", "page_view", document.title || location.pathname);
  window.NxxR = { event: function (name, data) { send("info", "event", name, data); }, warn: function (m, d) { send("warn", "event", m, d); }, error: function (m, d) { send("error", "event", m, d); } };
})();
"""
