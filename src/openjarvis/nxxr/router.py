"""FastAPI routes for NxxR JARVIS, mounted at /v1/nxxr."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import (
    JSONResponse,
    Response,
    StreamingResponse,
)
from pydantic import BaseModel, Field

from openjarvis.nxxr import persona
from openjarvis.nxxr.services import (
    CALENDAR_SOURCES,
    EMAIL_SOURCES,
    JobRunner,
    Scheduler,
    briefing_data,
    briefing_text,
    collect,
    internet_ok,
    web_search,
)
from openjarvis.nxxr.sites import BRIDGE_JS, SecretStore, check_site, snapshot
from openjarvis.nxxr.store import NxxrStore

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ContextReq(BaseModel):
    message: str = ""
    mode: str = "companion"
    conversation_id: Optional[str] = None
    web: str = Field("auto", description="auto | on | off")
    tz: Optional[str] = None
    humor: Optional[int] = None


class ConvCreate(BaseModel):
    title: str = ""
    mode: str = "companion"


class ConvPatch(BaseModel):
    title: Optional[str] = None
    mode: Optional[str] = None
    archived: Optional[bool] = None


class MsgCreate(BaseModel):
    role: str
    content: str
    source: str = "text"
    sources: List[Dict[str, Any]] = []
    tz: Optional[str] = None


class MemoryIn(BaseModel):
    text: str
    category: str = "general"


class MemoryPatch(BaseModel):
    text: Optional[str] = None
    category: Optional[str] = None


class ReminderIn(BaseModel):
    text: str
    due: str = Field(
        ..., description="Local time YYYY-MM-DDTHH:MM, or a UNIX timestamp"
    )
    recurrence: str = "none"
    tz: Optional[str] = None


class ReminderPatch(BaseModel):
    text: Optional[str] = None
    due: Optional[str] = None
    recurrence: Optional[str] = None
    status: Optional[str] = None
    tz: Optional[str] = None


class SiteIn(BaseModel):
    name: str
    url: str
    health_path: str = ""
    auth_method: str = "none"
    auth_header: str = "Authorization"
    token: str = ""
    perm_read: bool = True
    perm_prepare: bool = False
    perm_execute: bool = False
    monitor_minutes: int = 15


class SitePatch(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    health_path: Optional[str] = None
    auth_method: Optional[str] = None
    auth_header: Optional[str] = None
    token: Optional[str] = None
    perm_read: Optional[bool] = None
    perm_prepare: Optional[bool] = None
    perm_execute: Optional[bool] = None
    monitor_minutes: Optional[int] = None


class JobIn(BaseModel):
    kind: str
    input: str = ""


class SettingsIn(BaseModel):
    timezone: Optional[str] = None
    humor: Optional[int] = None
    desktop_notifications: Optional[bool] = None
    briefing_enabled: Optional[bool] = None
    briefing_time: Optional[str] = None
    briefing_topics: Optional[List[str]] = None
    wake_word: Optional[str] = None


class DraftReq(BaseModel):
    to: str = ""
    about: str
    context: str = ""
    style: str = "professional"
    tz: Optional[str] = None


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------


def _due(value: str, tz: Optional[str]) -> float:
    v = value.strip()
    try:
        return float(v)
    except ValueError:
        pass
    try:
        return persona.parse_due(v, tz)
    except ValueError:
        raise HTTPException(400, "Time must look like 2026-11-22T18:00")


def _public_site(s: Dict[str, Any], secrets: SecretStore) -> Dict[str, Any]:
    out = dict(s)
    out["has_token"] = secrets.has(f"site:{s['id']}")
    out["connection"] = (
        "connected"
        if s["status"] in ("up", "slow")
        else ("error" if s["status"] in ("down", "unsupported") else "not checked")
    )
    return out


def create_nxxr_router(
    store: NxxrStore, secrets: SecretStore
) -> tuple[APIRouter, Scheduler, "JobRunnerHolder"]:
    router = APIRouter(prefix="/v1/nxxr", tags=["nxxr"])
    scheduler = Scheduler(store, secrets)
    holder = JobRunnerHolder(store, secrets)
    net = {"ok": None, "at": 0.0}

    def tz_of(tz: Optional[str]) -> Optional[str]:
        if tz and persona.tzinfo(tz):
            if store.get_setting("timezone") != tz:
                store.set_setting("timezone", tz)
            return tz
        return store.get_setting("timezone", None)

    # -- status & settings ---------------------------------------------------

    @router.get("/status")
    async def status(request: Request) -> Dict[str, Any]:
        if time.time() - net["at"] > 60:
            net["ok"] = await asyncio.to_thread(internet_ok)
            net["at"] = time.time()
        return {
            "server_time": time.time(),
            "internet": net["ok"],
            "model": getattr(request.app.state, "model", ""),
            "scheduler": scheduler.running,
            "counts": {
                "conversations": len(store.list_conversations()),
                "memories": len(store.list_memories()),
                "reminders_pending": len(store.list_reminders("pending")),
                "notifications_unread": len(store.list_notifications(unread_only=True)),
                "sites": len(store.list_sites()),
            },
            "modes": {
                k: v["label"] for k, v in persona.MODES.items() if k != "briefing"
            },
        }

    @router.get("/settings")
    async def get_settings() -> Dict[str, Any]:
        b = store.get_setting("briefing", {"enabled": False, "time": "07:30"})
        return {
            "timezone": store.get_setting("timezone", None),
            "humor": store.get_setting("humor", 2),
            "desktop_notifications": store.get_setting("desktop_notifications", True),
            "briefing_enabled": b.get("enabled", False),
            "briefing_time": b.get("time", "07:30"),
            "briefing_topics": store.get_setting(
                "briefing_topics",
                [
                    "world news today",
                    "Nigeria news today",
                    "Africa news today",
                    "technology news today",
                ],
            ),
            "wake_word": store.get_setting("wake_word", "jarvis"),
        }

    @router.put("/settings")
    async def put_settings(s: SettingsIn) -> Dict[str, Any]:
        if s.timezone is not None:
            if not persona.tzinfo(s.timezone):
                raise HTTPException(400, "Unknown time zone")
            store.set_setting("timezone", s.timezone)
        if s.humor is not None:
            store.set_setting("humor", max(0, min(3, s.humor)))
        if s.desktop_notifications is not None:
            store.set_setting("desktop_notifications", s.desktop_notifications)
        if s.briefing_enabled is not None or s.briefing_time is not None:
            b = store.get_setting("briefing", {"enabled": False, "time": "07:30"})
            if s.briefing_time is not None:
                try:
                    hh, mm = (int(x) for x in s.briefing_time.split(":")[:2])
                    assert 0 <= hh < 24 and 0 <= mm < 60
                except Exception:
                    raise HTTPException(400, "Briefing time must be HH:MM")
                b["time"] = f"{hh:02d}:{mm:02d}"
            if s.briefing_enabled is not None:
                b["enabled"] = s.briefing_enabled
            store.set_setting("briefing", b)
        if s.briefing_topics is not None:
            store.set_setting(
                "briefing_topics",
                [t.strip() for t in s.briefing_topics if t.strip()][:6],
            )
        if s.wake_word is not None:
            store.set_setting("wake_word", s.wake_word.strip().lower()[:30] or "jarvis")
        store.audit("user", "settings.update")
        return await get_settings()

    # -- conversation context (persona + memory + live web) -----------------

    @router.post("/context")
    async def context(req: ContextReq) -> Dict[str, Any]:
        tz = tz_of(req.tz)
        use_web = req.web == "on" or (
            req.web == "auto"
            and (
                req.mode in ("news", "research") or persona.needs_live_info(req.message)
            )
        )
        search: Dict[str, Any] = {"ok": False, "results": []}
        if use_web and req.message.strip():
            search = await asyncio.to_thread(web_search, req.message.strip()[:300], 6)
        extra = ""
        if req.mode == "briefing":
            data = await asyncio.to_thread(briefing_data, store, tz)
            extra, sources = briefing_text(data, tz)
            search = {"ok": bool(sources), "results": sources}
            use_web = False
        humor = req.humor if req.humor is not None else store.get_setting("humor", 2)
        system = persona.system_prompt(
            req.mode,
            humor=humor,
            memories=store.list_memories(),
            tz=tz,
            web_results=search["results"]
            if (use_web or req.mode == "briefing")
            else None,
            web_attempted=use_web and not search["results"],
            extra=extra,
        )
        history = (
            store.recent_messages(req.conversation_id, 16)
            if req.conversation_id
            else []
        )
        return {
            "system": system,
            "sources": search["results"],
            "used_web": use_web,
            "web_ok": search.get("ok", False),
            "history": history,
            "searched_at": search.get("searched_at"),
        }

    # -- conversations -------------------------------------------------------

    @router.get("/conversations")
    async def list_conversations(q: str = "", archived: bool = False) -> Dict[str, Any]:
        return {"conversations": store.list_conversations(q=q, archived=archived)}

    @router.post("/conversations")
    async def create_conversation(c: ConvCreate) -> Dict[str, Any]:
        return store.create_conversation(c.title, c.mode)

    @router.get("/conversations/{cid}")
    async def get_conversation(cid: str) -> Dict[str, Any]:
        conv = store.get_conversation(cid, with_messages=True)
        if not conv:
            raise HTTPException(404, "Conversation not found")
        return conv

    @router.patch("/conversations/{cid}")
    async def patch_conversation(cid: str, p: ConvPatch) -> Dict[str, Any]:
        if not store.get_conversation(cid):
            raise HTTPException(404, "Conversation not found")
        return store.update_conversation(cid, **p.model_dump())  # type: ignore[return-value]

    @router.delete("/conversations/{cid}")
    async def delete_conversation(cid: str) -> Dict[str, Any]:
        ok = store.delete_conversation(cid)
        store.audit("user", "conversation.delete", cid)
        return {"deleted": ok}

    @router.post("/conversations/{cid}/messages")
    async def add_message(cid: str, m: MsgCreate) -> Dict[str, Any]:
        if not store.get_conversation(cid):
            raise HTTPException(404, "Conversation not found")
        if m.role not in ("user", "assistant"):
            raise HTTPException(400, "role must be user or assistant")
        content, applied = m.content, []
        if m.role == "assistant":
            tz = tz_of(m.tz)
            content, actions = persona.parse_actions(m.content, tz)
            for a in actions:
                applied.append(_apply_action(a))
        msg = store.add_message(
            cid,
            m.role,
            content,
            m.source if m.source in ("text", "voice") else "text",
            {"sources": m.sources[:12], "actions": applied}
            if (m.sources or applied)
            else None,
        )
        return {
            "message": msg,
            "actions": applied,
            "conversation": store.get_conversation(cid),
        }

    def _apply_action(a: Dict[str, Any]) -> Dict[str, Any]:
        if not a.get("ok"):
            return a
        if a["type"] == "remind":
            if a["due_at"] < time.time() - 60:
                return {**a, "ok": False, "error": "That time is in the past."}
            r = store.add_reminder(
                a["text"], a["due_at"], a["recurrence"], source="jarvis"
            )
            store.audit("jarvis", "reminder.create", f"{a['text']} @ {a['due_at']}")
            return {**a, "id": r["id"]}
        if a["type"] == "remember":
            mem = store.add_memory(
                a["text"], a.get("category", "general"), source="jarvis"
            )
            if mem:
                store.audit("jarvis", "memory.add", a["text"])
            return {**a, "id": mem["id"] if mem else None, "duplicate": mem is None}
        if a["type"] == "forget":
            n = store.forget_matching(a["keyword"])
            store.audit("jarvis", "memory.forget", f"{a['keyword']} ({n})")
            return {**a, "removed": n}
        return a

    @router.get("/search")
    async def search_history(q: str = Query(..., min_length=2)) -> Dict[str, Any]:
        return {"results": store.search_messages(q)}

    # -- memory --------------------------------------------------------------

    @router.get("/memories")
    async def list_memories(q: str = "") -> Dict[str, Any]:
        return {"memories": store.list_memories(q)}

    @router.post("/memories")
    async def add_memory(m: MemoryIn) -> Dict[str, Any]:
        mem = store.add_memory(m.text, m.category)
        if not mem:
            raise HTTPException(409, "Already remembered, or empty")
        store.audit("user", "memory.add", m.text)
        return mem

    @router.patch("/memories/{mid}")
    async def patch_memory(mid: str, m: MemoryPatch) -> Dict[str, Any]:
        mem = store.update_memory(mid, m.text, m.category)
        if not mem:
            raise HTTPException(404, "Memory not found")
        store.audit("user", "memory.edit", mid)
        return mem

    @router.delete("/memories/{mid}")
    async def delete_memory(mid: str) -> Dict[str, Any]:
        store.audit("user", "memory.delete", mid)
        return {"deleted": store.delete_memory(mid)}

    @router.delete("/memories")
    async def clear_memories(confirm: str = "") -> Dict[str, Any]:
        if confirm != "yes":
            raise HTTPException(400, "Pass confirm=yes to delete every memory")
        n = store.clear_memories()
        store.audit("user", "memory.clear", str(n))
        return {"deleted": n}

    # -- reminders -----------------------------------------------------------

    @router.get("/reminders")
    async def list_reminders(status: str = "") -> Dict[str, Any]:
        return {"reminders": store.list_reminders(status)}

    @router.post("/reminders")
    async def add_reminder(r: ReminderIn) -> Dict[str, Any]:
        tz = tz_of(r.tz)
        due = _due(r.due, tz)
        try:
            rem = store.add_reminder(r.text, due, r.recurrence)
        except ValueError as e:
            raise HTTPException(400, str(e))
        store.audit("user", "reminder.create", r.text)
        return rem

    @router.patch("/reminders/{rid}")
    async def patch_reminder(rid: str, r: ReminderPatch) -> Dict[str, Any]:
        if not store.get_reminder(rid):
            raise HTTPException(404, "Reminder not found")
        fields = r.model_dump(exclude={"due", "tz"})
        if r.due:
            fields["due_at"] = _due(r.due, tz_of(r.tz))
            fields.setdefault("status", "pending")
        try:
            rem = store.update_reminder(rid, **fields)
        except ValueError as e:
            raise HTTPException(400, str(e))
        store.audit("user", "reminder.update", rid)
        return rem  # type: ignore[return-value]

    @router.delete("/reminders/{rid}")
    async def delete_reminder(rid: str) -> Dict[str, Any]:
        store.audit("user", "reminder.delete", rid)
        return {"deleted": store.delete_reminder(rid)}

    # -- notifications & live events ------------------------------------------

    @router.get("/notifications")
    async def notifications(unread: bool = False) -> Dict[str, Any]:
        return {"notifications": store.list_notifications(unread_only=unread)}

    @router.post("/notifications/{nid}/read")
    async def read_one(nid: str) -> Dict[str, Any]:
        return {"updated": store.mark_read(nid)}

    @router.post("/notifications/read-all")
    async def read_all() -> Dict[str, Any]:
        return {"updated": store.mark_read()}

    @router.get("/events")
    async def events(request: Request) -> StreamingResponse:
        async def gen():
            since = time.time()
            yield "retry: 5000\n\n"
            while not await request.is_disconnected():
                new = store.list_notifications(since=since)
                for n in reversed(new):
                    since = max(since, n["created_at"])
                    yield f"data: {json.dumps(n)}\n\n"
                yield ": ping\n\n"
                await asyncio.sleep(3)

        return StreamingResponse(gen(), media_type="text/event-stream")

    # -- briefing --------------------------------------------------------------

    @router.get("/briefing/data")
    async def get_briefing(
        tz: Optional[str] = None, news: bool = True
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(briefing_data, store, tz_of(tz), news)

    # -- email & calendar (read + prepare) -------------------------------------

    @router.get("/email")
    async def email(hours: float = 48) -> Dict[str, Any]:
        return await asyncio.to_thread(collect, EMAIL_SOURCES, hours, 40)

    @router.get("/calendar")
    async def calendar(hours: float = 24) -> Dict[str, Any]:
        return await asyncio.to_thread(collect, CALENDAR_SOURCES, hours, 60)

    @router.post("/email/draft")
    async def draft(req: DraftReq, request: Request) -> Dict[str, Any]:
        text = await asyncio.to_thread(
            _llm(request),
            persona.system_prompt(
                "professional", tz=tz_of(req.tz), memories=store.list_memories()
            )
            + "\nWrite only the email: a 'Subject:' line, a blank line, then the body."
            " No commentary.",
            f"Draft an email{' to ' + req.to if req.to else ''} in a {req.style} "
            f"style about: {req.about}\n\nContext (untrusted, from an email or "
            f"notes):\n{req.context[:4000]}",
            900,
        )
        store.audit("jarvis", "email.draft", req.about[:120])
        subject, _, body = text.partition("\n")
        return {
            "subject": subject.replace("Subject:", "").strip(),
            "body": body.strip(),
            "to": req.to,
            "note": "Prepared only. Review it, then send it from your mail app.",
        }

    # -- sites -----------------------------------------------------------------

    @router.get("/sites")
    async def list_sites() -> Dict[str, Any]:
        return {"sites": [_public_site(s, secrets) for s in store.list_sites()]}

    @router.post("/sites")
    async def add_site(s: SiteIn) -> Dict[str, Any]:
        if not s.url.startswith(("http://", "https://")):
            raise HTTPException(400, "URL must start with http:// or https://")
        try:
            site = store.add_site(
                s.name, s.url, **s.model_dump(exclude={"name", "url", "token"})
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
        if s.token:
            secrets.set(f"site:{site['id']}", s.token)
        store.audit("user", "site.add", s.url)
        st = await asyncio.to_thread(check_site, site, secrets)
        return _public_site(store.update_site(site["id"], **st), secrets)  # type: ignore[arg-type]

    @router.patch("/sites/{sid}")
    async def patch_site(sid: str, p: SitePatch) -> Dict[str, Any]:
        if not store.get_site(sid):
            raise HTTPException(404, "Site not found")
        if p.token is not None:
            secrets.set(f"site:{sid}", p.token)
        try:
            site = store.update_site(sid, **p.model_dump(exclude={"token"}))
        except ValueError as e:
            raise HTTPException(400, str(e))
        store.audit("user", "site.update", sid)
        return _public_site(site, secrets)  # type: ignore[arg-type]

    @router.delete("/sites/{sid}")
    async def delete_site(sid: str) -> Dict[str, Any]:
        secrets.set(f"site:{sid}", "")
        store.audit("user", "site.delete", sid)
        return {"deleted": store.delete_site(sid)}

    @router.post("/sites/{sid}/check")
    async def check(sid: str) -> Dict[str, Any]:
        site = store.get_site(sid)
        if not site:
            raise HTTPException(404, "Site not found")
        st = await asyncio.to_thread(check_site, site, secrets)
        return _public_site(store.update_site(sid, **st), secrets)  # type: ignore[arg-type]

    @router.get("/sites/{sid}/snapshot")
    async def site_snapshot(sid: str) -> Dict[str, Any]:
        site = store.get_site(sid)
        if not site:
            raise HTTPException(404, "Site not found")
        if not site["perm_read"]:
            raise HTTPException(403, "Read permission is off for this site")
        try:
            snap = await asyncio.to_thread(snapshot, site, secrets)
        except Exception as exc:
            raise HTTPException(502, f"Couldn't read the site: {exc}")
        store.audit("jarvis", "site.read", site["url"])
        return snap

    @router.get("/sites/{sid}/events")
    async def site_events(sid: str, limit: int = 100) -> Dict[str, Any]:
        if not store.get_site(sid):
            raise HTTPException(404, "Site not found")
        return {"events": store.site_events(sid, limit)}

    @router.post("/sites/ingest")
    async def ingest(request: Request, key: str = "") -> Response:
        site = store.site_by_key(key)
        if not site:
            return Response(status_code=204)  # don't reveal which keys exist
        try:
            payload = json.loads((await request.body())[:20000] or b"{}")
        except json.JSONDecodeError:
            return Response(status_code=204)
        ev = store.add_site_event(
            site["id"],
            str(payload.get("level", "info")),
            str(payload.get("kind", "event")),
            str(payload.get("message", ""))[:2000],
            str(payload.get("page", "")),
            payload.get("data") if isinstance(payload.get("data"), dict) else {},
        )
        if ev["level"] == "error":
            recent = [
                e
                for e in store.site_events(site["id"], 20)
                if e["level"] == "error" and e["created_at"] > time.time() - 600
            ]
            if len(recent) == 1:  # one notification per burst
                store.notify(
                    "site",
                    f"Error on {site['name']}",
                    f"{ev['message'][:200]} ({ev['page']})",
                    link="#sites",
                )
        return Response(status_code=204)

    @router.get("/bridge.js")
    async def bridge_js() -> Response:
        return Response(
            BRIDGE_JS,
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache"},
        )

    # -- jobs & reports --------------------------------------------------------

    @router.get("/jobs")
    async def list_jobs() -> Dict[str, Any]:
        return {"jobs": store.list_jobs()}

    @router.post("/jobs")
    async def start_job(j: JobIn, request: Request) -> Dict[str, Any]:
        runner = holder.get(request)
        try:
            return runner.submit(j.kind, j.input)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/jobs/{jid}")
    async def get_job(jid: str) -> Dict[str, Any]:
        job = store.get_job(jid)
        if not job:
            raise HTTPException(404, "Job not found")
        return job

    @router.post("/jobs/{jid}/cancel")
    async def cancel_job(jid: str, request: Request) -> Dict[str, Any]:
        return {"cancelled": holder.get(request).cancel(jid)}

    @router.get("/reports")
    async def reports() -> Dict[str, Any]:
        return {"reports": store.list_reports()}

    @router.get("/reports/{rid}")
    async def report(rid: str) -> Dict[str, Any]:
        r = store.get_report(rid)
        if not r:
            raise HTTPException(404, "Report not found")
        return r

    @router.delete("/reports/{rid}")
    async def delete_report(rid: str) -> Dict[str, Any]:
        return {"deleted": store.delete_report(rid)}

    # -- data control ------------------------------------------------------------

    @router.get("/audit")
    async def audit(limit: int = 200) -> Dict[str, Any]:
        return {"audit": store.audit_log(limit)}

    @router.get("/export")
    async def export() -> JSONResponse:
        store.audit("user", "data.export")
        return JSONResponse(
            store.export_all(),
            headers={
                "Content-Disposition": 'attachment; filename="nxxr-jarvis-export.json"'
            },
        )

    return router, scheduler, holder


def _llm(request: Request):
    """A blocking (system, user, max_tokens) -> text function on the server's engine."""
    from openjarvis.core.types import Message, Role

    engine = request.app.state.engine
    model = getattr(request.app.state, "model", "")

    def call(system: str, user: str, max_tokens: int = 1200) -> str:
        res = engine.generate(
            [
                Message(role=Role.SYSTEM, content=system),
                Message(role=Role.USER, content=user),
            ],
            model=model,
            temperature=0.3,
            max_tokens=max_tokens,
        )
        return persona.visible(str(res.get("content") or ""))

    return call


class JobRunnerHolder:
    """Creates the JobRunner lazily, once the app's engine exists."""

    def __init__(self, store: NxxrStore, secrets: SecretStore) -> None:
        self.store, self.secrets = store, secrets
        self._runner: Optional[JobRunner] = None

    def get(self, request: Request) -> JobRunner:
        if self._runner is None:
            self._runner = JobRunner(self.store, _llm(request), self.secrets)
        return self._runner
