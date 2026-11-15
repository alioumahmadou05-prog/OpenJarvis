"""macOS built-in text-to-speech backend (the ``say`` command).

Free, offline, nothing to install, and works on Intel and Apple Silicon Macs.
The default voice is "Daniel" (British English), which suits a Jarvis-style
assistant. List installed voices with ``say -v '?'``.
"""

from __future__ import annotations

import io
import logging
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import List

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "Daniel"
_SAMPLE_RATE = 22050
_BASE_WORDS_PER_MINUTE = 175
_VOICE_LINE = re.compile(r"^(?P<name>.+?)\s+[A-Za-z]{2,3}[_-][A-Za-z0-9]+\s")


@TTSRegistry.register("macos_say")
class MacOSSayTTS(TTSBackend):
    """Speak with the voices that ship with macOS."""

    backend_id = "macos_say"

    def health(self) -> bool:
        return sys.platform == "darwin" and shutil.which("say") is not None

    def available_voices(self) -> List[str]:
        if not self.health():
            return []
        try:
            out = subprocess.run(
                ["say", "-v", "?"], capture_output=True, text=True, timeout=10
            ).stdout
        except Exception:
            return []
        voices = []
        for line in out.splitlines():
            match = _VOICE_LINE.match(line)
            if match:
                voices.append(match.group("name").strip())
        return voices

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        if not text.strip():
            raise ValueError("Nothing to say")
        rate = max(80, min(400, int(_BASE_WORDS_PER_MINUTE * speed)))
        voice = voice_id or DEFAULT_VOICE

        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "speech.wav"
            used_voice = voice
            result = self._run_say(text, voice, rate, out_path)
            if result.returncode != 0 or not out_path.exists():
                # Voice not installed on this Mac: use the system default voice.
                logger.debug("say failed for voice %r, retrying with default", voice)
                used_voice = ""
                result = self._run_say(text, "", rate, out_path)
            if result.returncode != 0 or not out_path.exists():
                raise RuntimeError(
                    "macOS 'say' failed: "
                    + (result.stderr or b"").decode(errors="replace").strip()
                )
            audio = out_path.read_bytes()

        duration = 0.0
        try:
            with wave.open(io.BytesIO(audio), "rb") as wf:
                duration = wf.getnframes() / float(wf.getframerate())
        except Exception:
            pass
        return TTSResult(
            audio=audio,
            format="wav",
            duration_seconds=duration,
            voice_id=used_voice or "default",
            sample_rate=_SAMPLE_RATE,
        )

    @staticmethod
    def _run_say(
        text: str, voice: str, rate: int, out_path: Path
    ) -> "subprocess.CompletedProcess[bytes]":
        cmd = ["say", "-r", str(rate), "-o", str(out_path)]
        cmd += ["--data-format=LEI16@%d" % _SAMPLE_RATE]
        if voice:
            cmd += ["-v", voice]
        cmd += ["-f", "-"]  # read the text from stdin (safe for any characters)
        return subprocess.run(
            cmd, input=text.encode("utf-8"), capture_output=True, timeout=120
        )


__all__ = ["DEFAULT_VOICE", "MacOSSayTTS"]
