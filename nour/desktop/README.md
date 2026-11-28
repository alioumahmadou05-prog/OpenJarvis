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

Nour's cat is therefore an **original design** in the same spirit: a friendly cartoon cat that lives on the desktop. Its look is a brown (or white, or black) cat with forehead tabby stripes and glowing blue eyes. It wears a black T-shirt with a white **"Nx"** outlined in light and tinted futuristic shades that the eyes show through, so expressions stay readable. The shades slide up onto its head when it is happy or asleep, and sit crooked on an error. The colour of the "Nx" and of the glow behind the cat changes with each state.

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

### Nour's monkey (the user's own design)

The user then chose their own design: a brown cartoon monkey standing upright, with round black shades and a black T-shirt with a white **"Nx"**. `src/renderer/cat/nour-monkey.ts` (`<nour-monkey>`) redraws it in vector form and uses the same state engine, effects and API as the cat. Its extras: it waves on success, scratches its head on error, and raises a hand while thinking. Its ears grow while listening, and the shades lift onto its head when it is happy or asleep (they are slightly see-through, so the eyes still show). The preview is in `preview/Nour Monkey.html`.

### Nour Nx: the official character (the user's exact design)

`src/renderer/character/nour-nx.ts` (`<nour-nx>`) is the user's own Nx monkey: a brown monkey standing upright, with round black shades and a black T-shirt with a white "Nx". It is **traced 1:1 from the user's picture** with potrace, so it looks exactly like it, with no restyling. It is split into moving parts: head, legs, tail, and separate sunglasses (the face under them is filled in, so the glasses can come off). At rest the arms are the original traced arms. As soon as an arm moves, it switches to a vector arm in the same style with a real elbow, and poses are solved with 2-link inverse kinematics (`scripts/character/arms.py`), so hands reach the cup, the ear or the chin without cut-out pieces of the picture moving around.

- **9 assistant states:** sleeping, idle, listening (hand to ear), thinking (hand on chin), speaking (mouth follows `level`), working (laptop), success (arms up and jump), error (head scratch, crooked glasses), translating.
- **20 fun actions, in the spirit of Dexter's** (original choreography, no Dexter assets): walk, coffee, glasses (takes them off and cleans them), reading, phone, clipboard, idea, confused, sad, angry, thumbs up, waiting (watch), dance, celebrate, six-seven, wave, portal in and out, fall, entrance.
- **`autoplay`:** an idle Nour plays a random fun action every 20 to 40 seconds. `el.play("coffee")` plays one action and then returns to the previous state.
- **Regenerating:** `scripts/character/` holds the tracer (`parts.py`, `trace2.py`) and the generator (`gen_nx.py`). The reference image itself is not committed.
- **Preview:** `preview/Nour Nx.html`.

### Sprite-sheet animation (frame by frame)

Nour's monkey is played from **pre-rendered sprite sheets**, not live CSS transforms.

- **Frames.** `scripts/sprites/poses.js` defines every frame of 11 sequences, using ease in and out, overlapping action (the head and tail lag the body), squash and stretch on contacts, anticipation before jumps, and secondary motion on effects. `scripts/sprites/render.cjs` poses the rig (`<nour-nx>`, traced 1:1 from the user's picture) for each frame and captures it as a transparent PNG. It also renders 5 mouth visemes and records the mouth position and angle for every `speaking` frame.
- **Sheets.** `scripts/sprites/pack.py` crops all frames to a shared box and packs one WebP sheet per sequence, plus `atlas.json`, into `assets/sprites/nx/` (320 frames, 348×423 px, about 6 MB).

| Sequence | Frames | fps | Notes |
|---|---|---|---|
| idle | 48 | 20 | breathing, weight shift, lagging head and tail |
| listening | 32 | 20 | hand to ear, head tilt, sound waves |
| thinking | 40 | 20 | hand on chin with finger taps, thought dots |
| speaking | 24 | 20 | gestures; the mouth is a live viseme overlay |
| walking | 16 | 20 | leg swing, bob on passing, counter-swinging arms |
| running | 12 | 24 | forward lean, pumping arms, squash on contact |
| dancing | 32 | 20 | bounce on the beat, alternating arms, kicks, notes |
| sleeping | 36 | 12 | slow deep breathing, drifting Z's |
| waving | 20 | 20 | forearm wave from the elbow |
| celebrating | 32 | 20 | anticipation crouch, jump, hang, landing squash |
| error | 28 | 20 | head scratch, crooked shades, sweat drop |

**Runtime.** `src/renderer/sprite/nour-sprite.ts` (`<nour-sprite>`) is the player. It draws one transparent canvas, plays each sequence at its own fps with seamless loops, and cross-fades between sequences (180 ms).

- **Voice-synced mouth.** The mouth picks `closed`, `small`, `mid` or `wide` from the live `level`, from the speech word events, or from a natural chatter fallback, and draws it on that frame's anchor.
- **Automatic switching.** `waving`, `celebrating` and `error` return to `idle` by themselves. `say(text, voice)` switches to `speaking` and back. An idle Nour falls asleep after `sleepAfter` ms (90 s by default), and any activity wakes it.

**Rebuilding.**

```bash
tsc -p .
node scripts/sprites/render.cjs
node scripts/build-preview.mjs
```

The last command writes the standalone `preview/Nour Nx.html`: one transparent monkey, with no grids or boxes. Add `?transparent` for a floating window.

### Build and preview

```bash
cd nour/desktop
tsc -p .                          # compiles to build/
node scripts/build-preview.mjs    # writes "preview/Nour Cat.html" and "preview/Nour Monkey.html"
```

Open `preview/Nour Cat.html` in Chrome to see all 9 states, switch fur colour, test lip-sync and play a demo sequence.

## Voice identity

The spec lives in `config/voice-identity.json`. Nour should sound like a young man of 16 to 20: medium pitch, slightly deep and warm, smooth and clear, relaxed, confident and playful. It speaks neutral international English and natural French, and **must be the same recognisable speaker in both languages**. It must never sound elderly, overly deep, robotic or like a butler.

- **Browser app (`nour/nour-ai-app.html`, now).** It prefers a Microsoft Edge *Multilingual* neural voice (Brian, then Andrew), which speaks English and French as one person. It detects the language of each phrase and sets it on that same voice. Without Edge, it uses the most natural young male voice per language (for example Evan or Nathan for English and Thomas for French) at a medium pitch. The old deep, British-butler settings are reset automatically.
- **Nx monkey (`src/renderer/voice/nour-voice.ts`).** `NourVoice` implements the same voice choice as a reusable module, with per-phrase English/French detection, a medium pitch and a relaxed pace. The Nx preview has a *Talk* box: the monkey switches to `speaking`, opens its mouth on each spoken word (from the speech word events, with a natural fallback when a browser sends none), and returns to its previous state when it is done.
- **Desktop app (Phase 5, local and offline).** Piper cannot keep one speaker across English and French. Phase 5 will benchmark XTTS-v2 (cross-lingual from one reference clip) against MeloTTS with an OpenVoice V2 tone-colour converter on the Intel Mac, and keep Piper only as the fast fallback. The reference voice must be one the user has the right to use.

## Development environment (evaluation)

- **This build environment.** A Linux x86_64 container with Node 22, TypeScript 6, Python 3.13, ffmpeg, cmake and Playwright/Chromium. It can build and test the web/React UI, the Python FastAPI backend and the logic (budget controller, router, memory).
- **What needs the Mac or a macOS runner.** Accessibility, AppleScript, Keychain, real microphone and speaker testing, and the signed `.app`. Intel (x64) builds will use GitHub Actions on an Intel macOS runner, plus local testing on the MacBook.
- **Intel MacBook Pro 2020, 16 GB.** Qwen3 4B (Q4) through Ollama uses about 3 GB of RAM and runs on the CPU. Expect a few words per second, so it suits a backup brain and short answers. whisper.cpp `base`/`small` and Piper voices run comfortably on Intel.
- **Accounts the user must create.** An Anthropic API key (console.anthropic.com, with $5 of credit) and a Google Cloud OAuth client for Gmail and Calendar (Phase 8).
- **WhatsApp.** There is no official API for personal accounts. Phase 8 will read and draft through the official WhatsApp Desktop app with macOS Accessibility, always showing the message and only sending after confirmation. Unofficial WhatsApp Web libraries are avoided because they break WhatsApp's terms and can get the account banned.
