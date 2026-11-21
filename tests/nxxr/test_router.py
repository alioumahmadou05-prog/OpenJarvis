"""API tests for /v1/nxxr with a fake engine and no network."""

from __future__ import annotations

import time

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.nxxr import router as nx_router  # noqa: E402
from openjarvis.nxxr import services  # noqa: E402
from openjarvis.nxxr.router import create_nxxr_router  # noqa: E402
from openjarvis.nxxr.sites import SecretStore  # noqa: E402
from openjarvis.nxxr.store import NxxrStore  # noqa: E402


class FakeEngine:
    def __init__(self):
        self.calls = []

    def generate(self, messages, *, model, temperature=0.7, max_tokens=1024, **kw):
        self.calls.append(messages)
        user = messages[-1].content
        if "search queries" in messages[0].content:
            return {"content": "gold price today\ngold market news"}
        if "Draft an email" in user:
            return {
                "content": "Subject: Assignment extension\n"
                "Dear Dr Bello,\nCould I have two more days?"
            }
        return {"content": "# Report\nGold rose [1]."}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(services, "internet_ok", lambda timeout=3.0: True)
    monkeypatch.setattr(nx_router, "internet_ok", lambda: True)
    fake_results = [
        {
            "title": "Gold hits record",
            "url": "https://news.test/gold",
            "snippet": "Gold rose 2%",
            "date": "2026-11-20",
        }
    ]
    monkeypatch.setattr(
        nx_router,
        "web_search",
        lambda q, n=6, **kw: {
            "ok": True,
            "results": fake_results,
            "searched_at": time.time(),
        },
    )
    monkeypatch.setattr(
        services,
        "web_search",
        lambda q, n=6, **kw: {
            "ok": True,
            "results": fake_results,
            "error": "",
            "searched_at": time.time(),
        },
    )
    monkeypatch.setattr(
        services,
        "read_article",
        lambda url, max_chars=6000: "Full article text about gold.",
    )
    monkeypatch.setattr(
        services,
        "collect",
        lambda sources, hours_back=24, limit=20: {
            "connected": [],
            "not_connected": list(sources),
            "errors": [],
            "items": [],
        },
    )
    store = NxxrStore(tmp_path / "nxxr.db")
    r, scheduler, _ = create_nxxr_router(store, SecretStore(tmp_path / "secrets.json"))
    app = FastAPI()
    app.include_router(r)
    app.state.engine = FakeEngine()
    app.state.model = "fake-model"
    c = TestClient(app)
    c.store = store  # type: ignore[attr-defined]
    return c


def test_status_and_settings(client):
    s = client.get("/v1/nxxr/status").json()
    assert s["internet"] is True and "tutor" in s["modes"]
    out = client.put(
        "/v1/nxxr/settings",
        json={
            "timezone": "Africa/Lagos",
            "briefing_enabled": True,
            "briefing_time": "6:5",
            "humor": 9,
        },
    ).json()
    assert (
        out["briefing_time"] == "06:05"
        and out["humor"] == 3
        and out["timezone"] == "Africa/Lagos"
    )
    assert (
        client.put("/v1/nxxr/settings", json={"timezone": "Mars/Base"}).status_code
        == 400
    )


def test_chat_flow_actions_applied_and_history(client):
    conv = client.post("/v1/nxxr/conversations", json={}).json()
    ctx = client.post(
        "/v1/nxxr/context",
        json={
            "message": "What's the gold price today?",
            "conversation_id": conv["id"],
            "tz": "Africa/Lagos",
        },
    ).json()
    assert ctx["used_web"] and ctx["sources"][0]["url"] == "https://news.test/gold"
    assert "LIVE WEB RESULTS" in ctx["system"]
    client.post(
        f"/v1/nxxr/conversations/{conv['id']}/messages",
        json={
            "role": "user",
            "content": "Remind me to study thermo tomorrow at 6pm",
            "source": "voice",
        },
    )
    reply = (
        "Fine. Thermodynamics it is.\n"
        "[[remind: 2031-03-04T18:00 | Study thermodynamics | none]]\n"
        "[[remember: Studies chemical engineering | academic]]"
    )
    res = client.post(
        f"/v1/nxxr/conversations/{conv['id']}/messages",
        json={
            "role": "assistant",
            "content": reply,
            "tz": "Africa/Lagos",
            "sources": ctx["sources"],
        },
    ).json()
    assert res["message"]["content"] == "Fine. Thermodynamics it is."
    assert [a["type"] for a in res["actions"]] == ["remind", "remember"] and all(
        a["ok"] for a in res["actions"]
    )
    assert (
        client.get("/v1/nxxr/reminders").json()["reminders"][0]["text"]
        == "Study thermodynamics"
    )
    assert (
        client.get("/v1/nxxr/memories").json()["memories"][0]["text"]
        == "Studies chemical engineering"
    )
    full = client.get(f"/v1/nxxr/conversations/{conv['id']}").json()
    assert (
        full["messages"][0]["source"] == "voice"
        and full["messages"][1]["meta"]["sources"][0]["title"] == "Gold hits record"
    )
    ctx2 = client.post(
        "/v1/nxxr/context",
        json={"message": "and silver?", "conversation_id": conv["id"], "web": "off"},
    ).json()
    assert (
        "Studies chemical engineering" in ctx2["system"]
        and len(ctx2["history"]) == 2
        and not ctx2["used_web"]
    )


def test_past_reminder_from_model_is_rejected(client):
    conv = client.post("/v1/nxxr/conversations", json={}).json()
    res = client.post(
        f"/v1/nxxr/conversations/{conv['id']}/messages",
        json={
            "role": "assistant",
            "content": "Ok [[remind: 2001-01-01T10:00 | old | none]]",
        },
    ).json()
    assert (
        res["actions"][0]["ok"] is False
        and client.get("/v1/nxxr/reminders").json()["reminders"] == []
    )


def test_manual_reminder_and_validation(client):
    r = client.post(
        "/v1/nxxr/reminders",
        json={
            "text": "Chemistry assignment",
            "due": "2031-01-10T09:00",
            "recurrence": "weekly",
            "tz": "Africa/Lagos",
        },
    )
    assert r.status_code == 200
    assert (
        client.post("/v1/nxxr/reminders", json={"text": "x", "due": "soon"}).status_code
        == 400
    )
    assert (
        client.post(
            "/v1/nxxr/reminders",
            json={"text": "x", "due": "2031-01-10T09:00", "recurrence": "hourly"},
        ).status_code
        == 400
    )
    rid = r.json()["id"]
    assert (
        client.patch(f"/v1/nxxr/reminders/{rid}", json={"status": "cancelled"}).json()[
            "status"
        ]
        == "cancelled"
    )


def test_memory_crud_and_clear_needs_confirmation(client):
    m = client.post(
        "/v1/nxxr/memories", json={"text": "Prefers short answers", "category": "style"}
    ).json()
    assert (
        client.post(
            "/v1/nxxr/memories", json={"text": "prefers short answers"}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/v1/nxxr/memories/{m['id']}", json={"text": "Prefers concise answers"}
        ).json()["text"]
        == "Prefers concise answers"
    )
    assert client.delete("/v1/nxxr/memories").status_code == 400
    assert client.delete("/v1/nxxr/memories?confirm=yes").json()["deleted"] == 1


def test_sites_register_secret_never_returned_and_bridge(client, monkeypatch):
    monkeypatch.setattr(
        nx_router,
        "check_site",
        lambda site, secrets=None, timeout=10: {
            "status": "up",
            "status_code": 200,
            "latency_ms": 42,
            "page_title": "Academy",
            "last_error": "",
            "last_check": time.time(),
        },
    )
    assert (
        client.post(
            "/v1/nxxr/sites", json={"name": "Bad", "url": "file:///x.html"}
        ).status_code
        == 400
    )
    site = client.post(
        "/v1/nxxr/sites",
        json={
            "name": "NxxR Academy",
            "url": "https://academy.test",
            "auth_method": "bearer",
            "token": "s3cret",
        },
    ).json()
    assert (
        site["status"] == "up"
        and site["has_token"]
        and "token" not in site
        and "s3cret" not in str(site)
    )
    assert site["connection"] == "connected"
    # browser bridge: a wrong key is silently ignored; the right key records the
    # event and raises one notification per burst
    assert (
        client.post(
            "/v1/nxxr/sites/ingest?key=nope", content='{"level":"error","message":"x"}'
        ).status_code
        == 204
    )
    key = site["bridge_key"]
    client.post(
        f"/v1/nxxr/sites/ingest?key={key}",
        content='{"level":"error","kind":"js_error",'
        '"message":"TypeError: x is undefined","page":"/lesson"}',
    )
    client.post(
        f"/v1/nxxr/sites/ingest?key={key}",
        content='{"level":"error","kind":"js_error","message":"again","page":"/lesson"}',
    )
    ev = client.get(f"/v1/nxxr/sites/{site['id']}/events").json()["events"]
    assert len(ev) == 2 and ev[-1]["message"].startswith("TypeError")
    notes = [
        n
        for n in client.get("/v1/nxxr/notifications").json()["notifications"]
        if n["kind"] == "site"
    ]
    assert len(notes) == 1
    assert "sendBeacon" in client.get("/v1/nxxr/bridge.js").text


def test_research_job_runs_in_background_and_saves_report(client):
    job = client.post(
        "/v1/nxxr/jobs", json={"kind": "research", "input": "gold market this week"}
    ).json()
    for _ in range(50):
        j = client.get(f"/v1/nxxr/jobs/{job['id']}").json()
        if j["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert j["status"] == "done", j
    rep = client.get(f"/v1/nxxr/reports/{j['report_id']}").json()
    assert (
        rep["body"].startswith("# Report")
        and rep["sources"][0]["url"] == "https://news.test/gold"
    )
    assert any(
        n["kind"] == "job"
        for n in client.get("/v1/nxxr/notifications").json()["notifications"]
    )
    assert (
        client.post("/v1/nxxr/jobs", json={"kind": "hack_the_planet"}).status_code
        == 400
    )


def test_email_triage_refuses_without_a_connected_account(client):
    job = client.post("/v1/nxxr/jobs", json={"kind": "email_triage"}).json()
    for _ in range(50):
        j = client.get(f"/v1/nxxr/jobs/{job['id']}").json()
        if j["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert j["status"] == "failed" and "No email account is connected" in j["error"]


def test_briefing_context_and_email_draft(client):
    client.post(
        "/v1/nxxr/reminders",
        json={"text": "Registration deadline", "due": str(time.time() + 3600)},
    )
    ctx = client.post(
        "/v1/nxxr/context",
        json={
            "mode": "briefing",
            "message": "what's happening today?",
            "tz": "Africa/Lagos",
        },
    ).json()
    assert "BRIEFING DATA" in ctx["system"] and "Registration deadline" in ctx["system"]
    assert "EMAILS (last 24h): not connected" in ctx["system"] and ctx["sources"]
    d = client.post(
        "/v1/nxxr/email/draft", json={"to": "Dr Bello", "about": "assignment extension"}
    ).json()
    assert (
        d["subject"] == "Assignment extension"
        and "two more days" in d["body"]
        and "Prepared only" in d["note"]
    )
    actions = [a["action"] for a in client.get("/v1/nxxr/audit").json()["audit"]]
    assert "email.draft" in actions and "reminder.create" in actions


def test_export_excludes_bridge_keys(client, monkeypatch):
    monkeypatch.setattr(
        nx_router,
        "check_site",
        lambda site, secrets=None, timeout=10: {
            "status": "up",
            "last_check": time.time(),
        },
    )
    client.post("/v1/nxxr/sites", json={"name": "S", "url": "https://s.test"})
    data = client.get("/v1/nxxr/export").json()
    assert data["sites"] and "bridge_key" not in data["sites"][0]
