"""Tests for the macOS ``say`` TTS backend (subprocess mocked)."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path
from unittest.mock import patch

import pytest

from openjarvis.speech.macos_say_tts import DEFAULT_VOICE, MacOSSayTTS


def _fake_say(fail_with_voice: bool = False):
    calls: list[list[str]] = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:2] == ["say", "-v"] and "?" in cmd:
            out = (
                "Daniel              en_GB    # Hello! My name is Daniel.\n"
                "Eddy (English (UK)) en_GB    # Hello! My name is Eddy.\n"
            )
            return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")
        if fail_with_voice and "-v" in cmd:
            return subprocess.CompletedProcess(cmd, 1, stdout=b"", stderr=b"no voice")
        out_path = Path(cmd[cmd.index("-o") + 1])
        with wave.open(str(out_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(22050)
            wf.writeframes(b"\x00\x00" * 22050)  # 1 second
        return subprocess.CompletedProcess(cmd, 0, stdout=b"", stderr=b"")

    return run, calls


def test_synthesize_uses_daniel_and_returns_wav():
    run, calls = _fake_say()
    with patch("subprocess.run", run):
        result = MacOSSayTTS().synthesize("Hello there")
    assert result.format == "wav"
    assert result.sample_rate == 22050
    assert result.voice_id == DEFAULT_VOICE
    assert result.duration_seconds == pytest.approx(1.0)
    cmd = calls[0]
    assert cmd[cmd.index("-v") + 1] == "Daniel"
    assert "-f" in cmd and "-" in cmd  # text comes via stdin


def test_speed_changes_rate():
    run, calls = _fake_say()
    with patch("subprocess.run", run):
        MacOSSayTTS().synthesize("hi", speed=2.0)
    assert calls[0][calls[0].index("-r") + 1] == "350"


def test_missing_voice_falls_back_to_default_voice():
    run, calls = _fake_say(fail_with_voice=True)
    with patch("subprocess.run", run):
        result = MacOSSayTTS().synthesize("hi", voice_id="Nonexistent")
    assert result.voice_id == "default"
    assert "-v" not in calls[-1]


def test_empty_text_rejected():
    with pytest.raises(ValueError):
        MacOSSayTTS().synthesize("   ")


def test_available_voices_parses_names():
    run, _ = _fake_say()
    backend = MacOSSayTTS()
    with (
        patch.object(MacOSSayTTS, "health", return_value=True),
        patch("subprocess.run", run),
    ):
        assert backend.available_voices() == ["Daniel", "Eddy (English (UK))"]


def test_health_false_off_mac():
    with patch("sys.platform", "linux"):
        assert MacOSSayTTS().health() is False
