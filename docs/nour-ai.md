# Nour AI

Nour AI is a personal-assistant layer on top of OpenJarvis: one interface, one memory,
with chat, voice, reminders, briefings, research, website monitoring and your connected apps.
It runs on your computer (local-first). Models, connectors (Gmail, Calendar…), web search and
speech come from OpenJarvis; Nour adds the assistant around them.

## Start it

```bash
jarvis serve          # or open the desktop app, which starts the server for you
```

Then open `http://localhost:8000/jarvis` (or click **Nour AI** in the OpenJarvis sidebar).

## What works today

| Phase | Feature | Status |
|---|---|---|
| 1 | Chat with the Nour personality and 7 modes | ✅ |
| 1 | Voice: continuous conversation, interrupt, sentence-by-sentence speech, optional wake word | ✅ browser speech recognition (Chrome/Safari) or OpenJarvis speech server |
| 1 | Chat history: search, rename, archive, delete, continue; voice saved as transcripts | ✅ |
| 1 | Persistent memory: learned in chat or added by you; searchable, editable, exportable | ✅ |
| 2 | Live web search with dated, clickable sources (keyless by default) | ✅ |
| 2 | Background research jobs: plan → search → read → compare → cited report → notification | ✅ |
| 2 | Multilingual replies (follows your language) | ✅ depends on the model |
| 2 | Academic tutor: step-by-step solutions with units, quizzes, flashcards, revision notes, work checking | ✅ |
| 3 | Reminders (one-time and recurring), set by voice or by hand, fire with the window closed | ✅ while the server runs |
| 3 | Daily briefing on demand and a morning notification | ✅ |
| 3 | Gmail / Calendar: read, triage, draft replies | ✅ after connecting in Connected apps |
| 3 | Sending email / changing calendar events | ❌ not yet: Nour drafts, you send |
| 4 | Website registry, scheduled health checks, page structure reading, down/up alerts | ✅ |
| 4 | Browser bridge: JS errors, failing requests and custom events from inside your sites | ✅ |
| 5 | Background jobs with progress, cancellation, history; notifications; audit log | ✅ |
| 5 | Proactive alerts (reminders, site down, briefing ready, job done) | ✅ |

## Security

- Data lives in `~/.openjarvis/nxxr.db`; site tokens in `~/.openjarvis/nxxr-secrets.json` (owner-only file, never returned by the API).
- Read / Prepare / Execute permissions per website; nothing is sent, deleted or changed without you.
- Every action Nour takes on your data is in the audit log (Settings).
- Web pages, emails and website content are treated as untrusted data, never as instructions.
- If you protect the server with `OPENJARVIS_API_KEY`, everything requires it except the website bridge, which uses a per-site secret key.

## Your websites

Register a site in **My websites**, then paste its bridge snippet before `</body>`:

```html
<script src="http://localhost:8000/v1/nxxr/bridge.js" data-key="YOUR_SITE_KEY"></script>
<script>NxxR.event("lesson_completed", { lesson: 3 });</script>
```

A local HTML file has no web address to check: serve it (VS Code Live Server, or
`python3 -m http.server` in its folder) and register the `http://localhost:…` address.

## API

All routes live under `/v1/nxxr` (conversations, memories, reminders, notifications, events (SSE),
sites, jobs, reports, briefing, email, calendar, settings, audit, export). See `/docs` on the server.
