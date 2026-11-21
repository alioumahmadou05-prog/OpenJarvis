"""Unit tests for the NxxR JARVIS persona, action tags, recurrence and store."""

from __future__ import annotations

import time
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from openjarvis.nxxr import persona
from openjarvis.nxxr.services import Scheduler, parse_search_text
from openjarvis.nxxr.sites import SecretStore
from openjarvis.nxxr.store import NxxrStore

TZ = "Africa/Lagos"


@pytest.fixture()
def store(tmp_path):
    return NxxrStore(tmp_path / "nxxr.db")


def test_parse_actions_reminder_memory_forget():
    text = (
        "Done, sir.\n"
        "[[remind: 2030-01-02T18:00 | Study thermodynamics | weekly]]\n"
        "[[remember: Studies chemical engineering | academic]]\n"
        "[[forget: pizza]]"
    )
    clean, actions = persona.parse_actions(text, TZ)
    assert clean == "Done, sir."
    kinds = [a["type"] for a in actions]
    assert kinds == ["remind", "remember", "forget"]
    rem = actions[0]
    assert (
        rem["ok"]
        and rem["recurrence"] == "weekly"
        and rem["text"] == "Study thermodynamics"
    )
    assert (
        datetime.fromtimestamp(rem["due_at"], ZoneInfo(TZ)).strftime("%Y-%m-%d %H:%M")
        == "2030-01-02 18:00"
    )
    assert actions[1]["category"] == "academic"


def test_parse_actions_bad_time_is_reported_not_faked():
    _, actions = persona.parse_actions("[[remind: tomorrow-ish | call mum | none]]", TZ)
    assert actions[0]["ok"] is False and "unreadable" in actions[0]["error"]


def test_visible_hides_partial_tags_while_streaming():
    assert persona.visible("Sure.\n[[remind: 2030-01") == "Sure."
    assert persona.visible("<think>hmm</think>Hello") == "Hello"


def test_next_due_rules():
    tz = ZoneInfo(TZ)
    fri = datetime(2030, 1, 4, 9, 0, tzinfo=tz).timestamp()  # a Friday
    assert (
        datetime.fromtimestamp(persona.next_due(fri, "weekdays", TZ), tz).weekday() == 0
    )
    jan31 = datetime(2030, 1, 31, 9, 0, tzinfo=tz).timestamp()
    assert datetime.fromtimestamp(persona.next_due(jan31, "monthly", TZ), tz).day == 28
    assert persona.next_due(fri, "none", TZ) is None


def test_live_info_detection_multilingual():
    assert persona.needs_live_info("What's happening in Nigeria today?")
    assert persona.needs_live_info("Quel est le prix de l'or ?")
    assert not persona.needs_live_info("Explain the second law of thermodynamics")


def test_system_prompt_includes_memory_mode_and_sources():
    sp = persona.system_prompt(
        "tutor",
        memories=[{"text": "Studies chemical engineering"}],
        tz=TZ,
        web_results=[
            {
                "title": "Gold hits record",
                "url": "https://x.test/a",
                "snippet": "Gold rose",
                "date": "2026-11-20",
            }
        ],
    )
    assert "Chemical Engineering" in sp and "Studies chemical engineering" in sp
    assert "[1] Gold hits record (2026-11-20) https://x.test/a" in sp
    assert "untrusted" in sp.lower()


def test_parse_search_text():
    text = (
        "### A title\nSource: https://a.test\nSummary: alpha\n\n---\n\n"
        "### B\nSource: https://b.test\nPublished: 2026-11-20\nSummary: beta"
    )
    res = parse_search_text(text)
    assert [r["url"] for r in res] == ["https://a.test", "https://b.test"]
    assert res[1]["date"] == "2026-11-20" and res[1]["snippet"] == "beta"


def test_conversations_titles_search_archive(store):
    c = store.create_conversation()
    store.add_message(c["id"], "user", "Explain the Reynolds number please")
    store.add_message(c["id"], "assistant", "Inertia versus viscosity.")
    conv = store.get_conversation(c["id"], with_messages=True)
    assert (
        conv["title"].startswith("Explain the Reynolds") and len(conv["messages"]) == 2
    )
    assert store.search_messages("viscosity")[0]["conversation_id"] == c["id"]
    store.update_conversation(c["id"], archived=True)
    assert (
        store.list_conversations() == []
        and len(store.list_conversations(archived=True)) == 1
    )
    assert store.delete_conversation(c["id"])


def test_memories_dedupe_edit_forget(store):
    m = store.add_memory("Studies chemical engineering", "academic")
    assert store.add_memory("studies chemical ENGINEERING") is None
    store.update_memory(m["id"], text="Studies petrochemical engineering")
    assert store.list_memories("petro")[0]["id"] == m["id"]
    assert store.forget_matching("petro") == 1 and store.list_memories() == []


def test_scheduler_fires_and_reschedules(store, tmp_path, monkeypatch):
    monkeypatch.setattr("openjarvis.nxxr.services.desktop_notify", lambda *a: True)
    store.set_setting("timezone", TZ)
    past = time.time() - 5
    once = store.add_reminder("Call someone", past)
    daily = store.add_reminder("Revise thermo", past, "daily")
    out = Scheduler(store, SecretStore(tmp_path / "s.json")).tick()
    assert out["reminders_fired"] == 2
    assert store.get_reminder(once["id"])["status"] == "done"
    d = store.get_reminder(daily["id"])
    assert d["status"] == "pending" and d["due_at"] > time.time()
    assert {n["body"] for n in store.list_notifications()} == {
        "Call someone",
        "Revise thermo",
    }


def test_secret_store_is_private(tmp_path):
    s = SecretStore(tmp_path / "secrets.json")
    s.set("site:1", "tok")
    assert (
        s.get("site:1") == "tok"
        and oct((tmp_path / "secrets.json").stat().st_mode)[-3:] == "600"
    )
    s.set("site:1", "")
    assert not s.has("site:1")
