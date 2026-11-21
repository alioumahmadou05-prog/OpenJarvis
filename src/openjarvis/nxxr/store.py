"""SQLite persistence for NxxR JARVIS (local-first, one file)."""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New conversation',
    mode TEXT NOT NULL DEFAULT 'companion',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'text',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    source TEXT NOT NULL DEFAULT 'user',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    due_at REAL NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'user',
    created_at REAL NOT NULL,
    fired_at REAL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    health_path TEXT NOT NULL DEFAULT '',
    auth_method TEXT NOT NULL DEFAULT 'none',
    auth_header TEXT NOT NULL DEFAULT 'Authorization',
    perm_read INTEGER NOT NULL DEFAULT 1,
    perm_prepare INTEGER NOT NULL DEFAULT 0,
    perm_execute INTEGER NOT NULL DEFAULT 0,
    monitor_minutes INTEGER NOT NULL DEFAULT 15,
    bridge_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    status_code INTEGER,
    latency_ms INTEGER,
    page_title TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    last_check REAL,
    last_event REAL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS site_events (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info',
    kind TEXT NOT NULL DEFAULT 'event',
    message TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_events ON site_events(site_id, created_at);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    input TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress TEXT NOT NULL DEFAULT '',
    report_id TEXT,
    error TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    finished_at REAL
);
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    sources TEXT NOT NULL DEFAULT '[]',
    kind TEXT NOT NULL DEFAULT 'research',
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at REAL NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

RECURRENCES = ("none", "daily", "weekdays", "weekly", "monthly")
REMINDER_STATUSES = ("pending", "done", "cancelled")
SITE_AUTH = ("none", "bearer", "header")


def _now() -> float:
    return time.time()


def _id() -> str:
    return uuid.uuid4().hex[:16]


class NxxrStore:
    """Thread-safe SQLite store. One connection per call keeps it simple and safe."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._conn() as c:
            c.executescript(SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        return c

    def _rows(self, sql: str, args: tuple = ()) -> List[Dict[str, Any]]:
        with self._lock, self._conn() as c:
            return [dict(r) for r in c.execute(sql, args).fetchall()]

    def _one(self, sql: str, args: tuple = ()) -> Optional[Dict[str, Any]]:
        rows = self._rows(sql, args)
        return rows[0] if rows else None

    def _exec(self, sql: str, args: tuple = ()) -> int:
        with self._lock, self._conn() as c:
            return c.execute(sql, args).rowcount

    # -- audit ---------------------------------------------------------------

    def audit(self, actor: str, action: str, detail: str = "") -> None:
        self._exec(
            "INSERT INTO audit(at, actor, action, detail) VALUES (?,?,?,?)",
            (_now(), actor, action, detail[:500]),
        )

    def audit_log(self, limit: int = 200) -> List[Dict[str, Any]]:
        return self._rows("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))

    # -- settings ------------------------------------------------------------

    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self._one("SELECT value FROM settings WHERE key=?", (key,))
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value: Any) -> None:
        self._exec(
            "INSERT INTO settings(key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )

    # -- conversations -------------------------------------------------------

    def create_conversation(
        self, title: str = "", mode: str = "companion"
    ) -> Dict[str, Any]:
        cid, t = _id(), _now()
        self._exec(
            "INSERT INTO conversations(id, title, mode, created_at, updated_at) "
            "VALUES (?,?,?,?,?)",
            (cid, title.strip()[:120] or "New conversation", mode, t, t),
        )
        return self.get_conversation(cid)  # type: ignore[return-value]

    def get_conversation(
        self, cid: str, with_messages: bool = False
    ) -> Optional[Dict[str, Any]]:
        conv = self._one("SELECT * FROM conversations WHERE id=?", (cid,))
        if conv and with_messages:
            conv["messages"] = [
                {**m, "meta": json.loads(m["meta"] or "{}")}
                for m in self._rows(
                    "SELECT * FROM messages WHERE conversation_id=? ORDER BY "
                    "created_at",
                    (cid,),
                )
            ]
        return conv

    def list_conversations(
        self, q: str = "", archived: bool = False, limit: int = 200
    ) -> List[Dict[str, Any]]:
        if q:
            like = f"%{q}%"
            return self._rows(
                "SELECT DISTINCT c.* FROM conversations c LEFT JOIN messages m ON "
                "m.conversation_id=c.id "
                "WHERE c.archived=? AND (c.title LIKE ? OR m.content LIKE ?) "
                "ORDER BY c.updated_at DESC LIMIT ?",
                (int(archived), like, like, limit),
            )
        return self._rows(
            "SELECT * FROM conversations WHERE archived=? ORDER BY updated_at DESC "
            "LIMIT ?",
            (int(archived), limit),
        )

    def update_conversation(self, cid: str, **fields: Any) -> Optional[Dict[str, Any]]:
        allowed = {
            k: v
            for k, v in fields.items()
            if k in ("title", "mode", "archived") and v is not None
        }
        if "archived" in allowed:
            allowed["archived"] = int(bool(allowed["archived"]))
        if "title" in allowed:
            allowed["title"] = str(allowed["title"]).strip()[:120] or "Untitled"
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._exec(
                f"UPDATE conversations SET {sets}, updated_at=? WHERE id=?",
                (*allowed.values(), _now(), cid),
            )
        return self.get_conversation(cid)

    def delete_conversation(self, cid: str) -> bool:
        return self._exec("DELETE FROM conversations WHERE id=?", (cid,)) > 0

    def add_message(
        self,
        cid: str,
        role: str,
        content: str,
        source: str = "text",
        meta: Optional[dict] = None,
    ) -> Dict[str, Any]:
        mid, t = _id(), _now()
        self._exec(
            "INSERT INTO messages(id, conversation_id, role, content, source, meta, "
            "created_at) VALUES (?,?,?,?,?,?,?)",
            (mid, cid, role, content, source, json.dumps(meta or {}), t),
        )
        conv = self.get_conversation(cid)
        if conv and role == "user" and conv["title"] == "New conversation":
            title = " ".join(content.split())[:60]
            self._exec(
                "UPDATE conversations SET title=? WHERE id=?",
                (title or "New conversation", cid),
            )
        self._exec("UPDATE conversations SET updated_at=? WHERE id=?", (t, cid))
        return {
            "id": mid,
            "conversation_id": cid,
            "role": role,
            "content": content,
            "source": source,
            "meta": meta or {},
            "created_at": t,
        }

    def recent_messages(self, cid: str, limit: int = 20) -> List[Dict[str, Any]]:
        rows = self._rows(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY "
            "created_at DESC LIMIT ?",
            (cid, limit),
        )
        return list(reversed(rows))

    def search_messages(self, q: str, limit: int = 50) -> List[Dict[str, Any]]:
        return self._rows(
            "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, "
            "c.title FROM messages m "
            "JOIN conversations c ON c.id=m.conversation_id WHERE m.content LIKE ? "
            "ORDER BY m.created_at DESC LIMIT ?",
            (f"%{q}%", limit),
        )

    # -- memories ------------------------------------------------------------

    def add_memory(
        self, text: str, category: str = "general", source: str = "user"
    ) -> Optional[Dict[str, Any]]:
        text = " ".join(text.split())[:300]
        if not text:
            return None
        dup = self._one("SELECT * FROM memories WHERE lower(text)=lower(?)", (text,))
        if dup:
            return None
        mid, t = _id(), _now()
        self._exec(
            "INSERT INTO memories(id, text, category, source, created_at, "
            "updated_at) VALUES (?,?,?,?,?,?)",
            (mid, text, category[:40] or "general", source, t, t),
        )
        return self._one("SELECT * FROM memories WHERE id=?", (mid,))

    def list_memories(self, q: str = "") -> List[Dict[str, Any]]:
        if q:
            return self._rows(
                "SELECT * FROM memories WHERE text LIKE ? OR category LIKE ? ORDER "
                "BY updated_at DESC",
                (f"%{q}%", f"%{q}%"),
            )
        return self._rows("SELECT * FROM memories ORDER BY updated_at DESC")

    def update_memory(
        self, mid: str, text: Optional[str] = None, category: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        row = self._one("SELECT * FROM memories WHERE id=?", (mid,))
        if not row:
            return None
        self._exec(
            "UPDATE memories SET text=?, category=?, updated_at=? WHERE id=?",
            (
                " ".join((text or row["text"]).split())[:300],
                (category or row["category"])[:40],
                _now(),
                mid,
            ),
        )
        return self._one("SELECT * FROM memories WHERE id=?", (mid,))

    def delete_memory(self, mid: str) -> bool:
        return self._exec("DELETE FROM memories WHERE id=?", (mid,)) > 0

    def forget_matching(self, keyword: str) -> int:
        keyword = keyword.strip()
        if len(keyword) < 2:
            return 0
        return self._exec("DELETE FROM memories WHERE text LIKE ?", (f"%{keyword}%",))

    def clear_memories(self) -> int:
        return self._exec("DELETE FROM memories")

    # -- reminders -----------------------------------------------------------

    def add_reminder(
        self, text: str, due_at: float, recurrence: str = "none", source: str = "user"
    ) -> Dict[str, Any]:
        if recurrence not in RECURRENCES:
            raise ValueError(f"recurrence must be one of {RECURRENCES}")
        text = " ".join(text.split())[:300]
        if not text:
            raise ValueError("reminder text is empty")
        rid = _id()
        self._exec(
            "INSERT INTO reminders(id, text, due_at, recurrence, source, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (rid, text, float(due_at), recurrence, source, _now()),
        )
        return self.get_reminder(rid)  # type: ignore[return-value]

    def get_reminder(self, rid: str) -> Optional[Dict[str, Any]]:
        return self._one("SELECT * FROM reminders WHERE id=?", (rid,))

    def list_reminders(self, status: str = "") -> List[Dict[str, Any]]:
        if status:
            return self._rows(
                "SELECT * FROM reminders WHERE status=? ORDER BY due_at", (status,)
            )
        return self._rows(
            "SELECT * FROM reminders ORDER BY status='pending' DESC, due_at"
        )

    def update_reminder(self, rid: str, **fields: Any) -> Optional[Dict[str, Any]]:
        allowed = {
            k: v
            for k, v in fields.items()
            if k in ("text", "due_at", "recurrence", "status") and v is not None
        }
        if "recurrence" in allowed and allowed["recurrence"] not in RECURRENCES:
            raise ValueError("bad recurrence")
        if "status" in allowed and allowed["status"] not in REMINDER_STATUSES:
            raise ValueError("bad status")
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._exec(
                f"UPDATE reminders SET {sets} WHERE id=?", (*allowed.values(), rid)
            )
        return self.get_reminder(rid)

    def delete_reminder(self, rid: str) -> bool:
        return self._exec("DELETE FROM reminders WHERE id=?", (rid,)) > 0

    def due_reminders(self, now: Optional[float] = None) -> List[Dict[str, Any]]:
        return self._rows(
            "SELECT * FROM reminders WHERE status='pending' AND due_at<=? ORDER BY "
            "due_at",
            (now or _now(),),
        )

    # -- notifications -------------------------------------------------------

    def notify(
        self, kind: str, title: str, body: str = "", link: str = ""
    ) -> Dict[str, Any]:
        nid = _id()
        self._exec(
            "INSERT INTO notifications(id, kind, title, body, link, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (nid, kind, title[:200], body[:2000], link[:500], _now()),
        )
        return self._one("SELECT * FROM notifications WHERE id=?", (nid,))  # type: ignore[return-value]

    def list_notifications(
        self, unread_only: bool = False, since: float = 0, limit: int = 100
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM notifications WHERE created_at>?"
        if unread_only:
            sql += " AND read=0"
        return self._rows(sql + " ORDER BY created_at DESC LIMIT ?", (since, limit))

    def mark_read(self, nid: Optional[str] = None) -> int:
        if nid:
            return self._exec("UPDATE notifications SET read=1 WHERE id=?", (nid,))
        return self._exec("UPDATE notifications SET read=1 WHERE read=0")

    # -- sites ---------------------------------------------------------------

    def add_site(self, name: str, url: str, **opts: Any) -> Dict[str, Any]:
        sid = _id()
        auth = opts.get("auth_method", "none")
        if auth not in SITE_AUTH:
            raise ValueError(f"auth_method must be one of {SITE_AUTH}")
        self._exec(
            "INSERT INTO sites(id, name, url, health_path, auth_method, auth_header, "
            "perm_read, perm_prepare, "
            "perm_execute, monitor_minutes, bridge_key, created_at) VALUES "
            "(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                sid,
                name.strip()[:80] or url,
                url.strip(),
                opts.get("health_path", "") or "",
                auth,
                opts.get("auth_header") or "Authorization",
                int(opts.get("perm_read", True)),
                int(opts.get("perm_prepare", False)),
                int(opts.get("perm_execute", False)),
                max(0, int(opts.get("monitor_minutes", 15))),
                secrets.token_urlsafe(18),
                _now(),
            ),
        )
        return self.get_site(sid)  # type: ignore[return-value]

    def get_site(self, sid: str) -> Optional[Dict[str, Any]]:
        return self._one("SELECT * FROM sites WHERE id=?", (sid,))

    def list_sites(self) -> List[Dict[str, Any]]:
        return self._rows("SELECT * FROM sites ORDER BY created_at")

    def update_site(self, sid: str, **fields: Any) -> Optional[Dict[str, Any]]:
        keys = (
            "name",
            "url",
            "health_path",
            "auth_method",
            "auth_header",
            "perm_read",
            "perm_prepare",
            "perm_execute",
            "monitor_minutes",
            "status",
            "status_code",
            "latency_ms",
            "page_title",
            "last_error",
            "last_check",
            "last_event",
        )
        allowed = {k: v for k, v in fields.items() if k in keys and v is not None}
        if "auth_method" in allowed and allowed["auth_method"] not in SITE_AUTH:
            raise ValueError("bad auth_method")
        for k in ("perm_read", "perm_prepare", "perm_execute"):
            if k in allowed:
                allowed[k] = int(bool(allowed[k]))
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._exec(f"UPDATE sites SET {sets} WHERE id=?", (*allowed.values(), sid))
        return self.get_site(sid)

    def delete_site(self, sid: str) -> bool:
        return self._exec("DELETE FROM sites WHERE id=?", (sid,)) > 0

    def site_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        if not key:
            return None
        for s in self.list_sites():
            if secrets.compare_digest(s["bridge_key"], key):
                return s
        return None

    def add_site_event(
        self,
        sid: str,
        level: str,
        kind: str,
        message: str,
        page: str = "",
        data: Optional[dict] = None,
    ) -> Dict[str, Any]:
        eid, t = _id(), _now()
        level = level if level in ("info", "warn", "error") else "info"
        self._exec(
            "INSERT INTO site_events(id, site_id, level, kind, message, page, data, "
            "created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                eid,
                sid,
                level,
                kind[:40],
                message[:2000],
                page[:500],
                json.dumps(data or {})[:4000],
                t,
            ),
        )
        self._exec("UPDATE sites SET last_event=? WHERE id=?", (t, sid))
        # keep the newest 2,000 events per site
        self._exec(
            "DELETE FROM site_events WHERE site_id=? AND id NOT IN "
            "(SELECT id FROM site_events WHERE site_id=? ORDER BY created_at DESC "
            "LIMIT 2000)",
            (sid, sid),
        )
        return {
            "id": eid,
            "site_id": sid,
            "level": level,
            "kind": kind,
            "message": message,
            "page": page,
            "created_at": t,
        }

    def site_events(self, sid: str, limit: int = 100) -> List[Dict[str, Any]]:
        return [
            {**e, "data": json.loads(e["data"] or "{}")}
            for e in self._rows(
                "SELECT * FROM site_events WHERE site_id=? ORDER BY created_at DESC "
                "LIMIT ?",
                (sid, limit),
            )
        ]

    # -- jobs & reports ------------------------------------------------------

    def add_job(self, kind: str, input_text: str) -> Dict[str, Any]:
        jid = _id()
        self._exec(
            "INSERT INTO jobs(id, kind, input, created_at) VALUES (?,?,?,?)",
            (jid, kind, input_text[:2000], _now()),
        )
        return self.get_job(jid)  # type: ignore[return-value]

    def get_job(self, jid: str) -> Optional[Dict[str, Any]]:
        return self._one("SELECT * FROM jobs WHERE id=?", (jid,))

    def list_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self._rows(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        )

    def update_job(self, jid: str, **fields: Any) -> None:
        allowed = {
            k: v
            for k, v in fields.items()
            if k in ("status", "progress", "report_id", "error", "finished_at")
        }
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._exec(f"UPDATE jobs SET {sets} WHERE id=?", (*allowed.values(), jid))

    def add_report(
        self, title: str, body: str, sources: List[dict], kind: str = "research"
    ) -> Dict[str, Any]:
        rid = _id()
        self._exec(
            "INSERT INTO reports(id, title, body, sources, kind, created_at) VALUES "
            "(?,?,?,?,?,?)",
            (rid, title[:200], body, json.dumps(sources), kind, _now()),
        )
        return self.get_report(rid)  # type: ignore[return-value]

    def get_report(self, rid: str) -> Optional[Dict[str, Any]]:
        r = self._one("SELECT * FROM reports WHERE id=?", (rid,))
        if r:
            r["sources"] = json.loads(r["sources"] or "[]")
        return r

    def list_reports(self) -> List[Dict[str, Any]]:
        return self._rows(
            "SELECT id, title, kind, created_at FROM reports ORDER BY created_at DESC"
        )

    def delete_report(self, rid: str) -> bool:
        return self._exec("DELETE FROM reports WHERE id=?", (rid,)) > 0

    # -- export --------------------------------------------------------------

    def export_all(self) -> Dict[str, Any]:
        convs = [
            self.get_conversation(c["id"], with_messages=True)
            for c in self._rows("SELECT id FROM conversations")
        ]
        sites = [
            {k: v for k, v in s.items() if k != "bridge_key"} for s in self.list_sites()
        ]
        return {
            "exported_at": _now(),
            "conversations": convs,
            "memories": self.list_memories(),
            "reminders": self.list_reminders(),
            "sites": sites,
            "reports": [self.get_report(r["id"]) for r in self.list_reports()],
        }
