# Nour AI: desktop assistant

Nour is a voice-first personal assistant for macOS, starting with an Intel MacBook Pro 2020 with 16 GB of RAM. It uses Claude as its main brain and a local Qwen3 4B as a free backup. It has a floating animated cat, local voice, memory, Mac control and secretary features. It is built in phases, and each phase is tested before the next one starts.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Dexter inspection and Nour's animated cat | ✅ Done |
| 2 | Nour interface: Electron + React + TypeScript, floating cat window | ⏳ Next |
| 3 | Ollama + Qwen3 4B, the local free brain | ☐ |
| 4 | Claude API: Haiku 5.5 / Sonnet 5.5 router and $5 spending controller | ☐ |
| 5 | Voice: wake word, whisper.cpp, Piper, VAD, push-to-talk | ☐ |
| 6 | Memory: SQLite | ☐ |
| 7 | Mac control: Accessibility, AppleScript, Shortcuts | ☐ |
| 8 | Gmail, Calendar, WhatsApp | ☐ |
| 9 | Translation and task engine | ☐ |
| 10 | Testing, optimisation and Intel (x64) packaging | ☐ |

## Phase 1: Dexter inspection

`Dexter-Mac-arm64.dmg` (Dexter 3.4.1, "AI voice assistant for streamers") was unpacked and read without being run.

- **Build.** Electron, packaged for **Apple Silicon only (arm64)**. It cannot run natively on the Intel target Mac.
- **Brain and voice.** These are remote. The app signs in with Clerk (accounts.dexterai.org), uses Dexter's own backend on Railway, and gets its voice from Inworld. Locally it only runs a wake-word ONNX model and the Silero VAD.
- **Mac access.** A global keyboard hook (`uiohook-napi`) for push-to-talk, AppleScript to control and quit apps, screen capture, camera and microphone. It updates itself automatically.
- **The cat.** Dexter's character is a white cartoon cat with round black sunglasses and a black "dex" T-shirt, delivered as pre-rendered WebP/WebM animations.
- **Assets.** The app is proprietary. Its character art, animations, sounds and name belong to its makers, and nothing in the package grants reuse. **No Dexter code or asset is copied into Nour.**

Nour's cat is therefore an **original design** in the same spirit: a friendly cartoon cat that lives on the desktop. Its look is a white (or black) cat with forehead tabby stripes and glowing blue eyes. It wears a navy T-shirt with a glowing **"Nx"** and tinted futuristic shades that the eyes show through, so expressions stay readable. The shades slide up onto its head when it is happy or asleep, and sit crooked on an error. The colour of the "Nx" and of the glow behind the cat changes with each state.

## Phase 1: the cat

`src/renderer/cat/nour-cat.ts` is a dependency-free Web Component (`<nour-cat>`): a single vector SVG with CSS animations. It stays sharp at any size and is light on an Intel CPU, and it works in plain HTML, React and the Electron floating window.

| State | Animation |
|---|---|
| `sleeping` | Closed eyes, slow deep breathing, drooping head, floating "z Z" |
| `idle` | Breathing, swaying tail, random natural blinks (sometimes double), ear twitch, eyes follow the mouse |
| `listening` | Ears perk up, eyes widen, head tilts, sound waves, pulsing glow |
| `thinking` | Eyes look up, one brow raised, thought bubble with bouncing dots, violet Nx |
| `speaking` | Mouth moves; driven by the real voice level via `cat.level = 0..1`, with a gentle nod |
| `working` | Laptop, typing paws, focused brows, eyes down, spinning gear, amber Nx |
| `success` | Happy ^ ^ eyes, big smile, hop with squash and stretch, sparkles, green Nx |
| `error` | Worried brows, ears flattened, sweat drop, head shake, tail down, red Nx |
| `translating` | "A ⇄ 文" speech bubbles, ears forward, head turning between speakers |

```ts
import { NourCat } from "./cat/nour-cat";
const cat = document.querySelector("nour-cat") as NourCat;
cat.state = "listening";
cat.level = 0.7;     // live loudness while speaking
cat.fur = "black";   // or "white"
```

It respects `prefers-reduced-motion`.

### Build and preview

```bash
cd nour/desktop
tsc -p .                          # compiles to build/
node scripts/build-preview.mjs    # writes "preview/Nour Cat.html" (one self-contained file)
```

Open `preview/Nour Cat.html` in Chrome to see all 9 states, switch fur colour, test lip-sync and play a demo sequence.

## Development environment (evaluation)

- **This build environment.** A Linux x86_64 container with Node 22, TypeScript 6, Python 3.13, ffmpeg, cmake and Playwright/Chromium. It can build and test the web/React UI, the Python FastAPI backend and the logic (budget controller, router, memory).
- **What needs the Mac or a macOS runner.** Accessibility, AppleScript, Keychain, real microphone and speaker testing, and the signed `.app`. Intel (x64) builds will use GitHub Actions on an Intel macOS runner, plus local testing on the MacBook.
- **Intel MacBook Pro 2020, 16 GB.** Qwen3 4B (Q4) through Ollama uses about 3 GB of RAM and runs on the CPU. Expect a few words per second, so it suits a backup brain and short answers. whisper.cpp `base`/`small` and Piper voices run comfortably on Intel.
- **Accounts the user must create.** An Anthropic API key (console.anthropic.com, with $5 of credit) and a Google Cloud OAuth client for Gmail and Calendar (Phase 8).
- **WhatsApp.** There is no official API for personal accounts. Phase 8 will read and draft through the official WhatsApp Desktop app with macOS Accessibility, always showing the message and only sending after confirmation. Unofficial WhatsApp Web libraries are avoided because they break WhatsApp's terms and can get the account banned.
