# EchoCode

**The voice-first AI pair programmer for VS Code.**

Highlight the code that confuses you, press **Ctrl+Alt+Space** and ask your question out loud. EchoCode reads the file you're looking at, then a virtual Senior Staff Engineer talks you through the logic, the architecture and the bug. The answer is spoken back in real time with live subtitles.

EchoCode runs on **AssemblyAI**. The **Voice Agent API** hears your question, reasons over your code and speaks the answer in one streaming session. The **LLM Gateway** writes the exact code behind a suggested fix.

> **Demo:** a GIF of the three demo scenes is still to be recorded (see [Build plan](#build-plan)). Landing page: https://echo-code-hackathon.vercel.app

---

## The problem: text-based context switching

AI coding assistants have made developers faster, but you still talk to them by typing. When you hit a hard algorithm, a tricky data structure or an unfamiliar codebase, you have to:

1. Break your flow to type a long, precise prompt.
2. Copy and paste code, error logs and file structures into a chat window.
3. Work out which part of your code each line of the AI's text answer refers to.

The result is **"vibe coding" fatigue**. Developers paste in solutions they don't really understand, because asking for a line-by-line explanation takes too much effort.

EchoCode makes that explanation effortless. If a nested loop or a generic type confuses you, select it, tap the hotkey and ask, the way you'd ask a colleague sitting next to you.

## What makes it different

- **A real conversation, not a chatbot wrapper.** AssemblyAI's Voice Agent runs speech recognition, reasoning and speech as one streaming session. It uses semantic turn detection, knows coding vocabulary such as "HashSet" and "generics" through key terms, and lets you interrupt the answer the way you'd interrupt a colleague.
- **Context without copy-paste.** The extension quietly attaches the open file, your cursor line, your selection and nearby compiler errors. There's no screen sharing or video, so it stays fast and uses few tokens.
- **It points at the code.** As the AI explains, the lines it's talking about light up in your editor, so you never have to match the answer back to the code yourself.
- **Answers you can act on.** Suggested code arrives as a card with a one-click **Insert at Cursor** button.

## How it works

1. **Voice trigger.** Select a block of code, **hold Ctrl+Alt+Space** (**Ctrl+Shift+Space** on macOS) and ask something like *"Walk me through this method. Why are we using a generic Stack here?"* Let go to send. You can also tap the hotkey (or click the status bar robot), speak, and tap again or just stop talking.
2. **Silent context capture.** The extension reads the active editor through the VS Code API. It collects the file path, language, cursor line, your selection, the surrounding code with line numbers, and any diagnostics.
3. **One live session.** The editor context and your microphone audio (24 kHz PCM) travel over a single WebSocket session to AssemblyAI's Voice Agent.
4. **Reasoning over your code.** The agent transcribes your question, with coding terms boosted, and answers with the exact code you're looking at in mind.
5. **Spoken answer.** The reply streams back as 24 kHz audio. Every word arrives with its timing, so the subtitles and line highlights keep pace with the voice. Every turn shows its measured latency.

EchoCode is push-to-talk. Nothing is sent until you press the hotkey, so background noise in a busy room can't start a conversation by accident. If you press the hotkey but don't say anything, nothing is sent at all. Pressing it while EchoCode is answering interrupts it with your new question.

## The interface

EchoCode sits in VS Code's bottom panel, next to the Terminal. VS Code doesn't allow extensions to float windows over the editor, so the assistant goes in the panel your eyes already visit.

- **The assistant.** A glowing, Tron-style robot pulses with your voice while it listens and with its own voice while it speaks. A matching robot in the status bar shows the state at a glance and works as a talk button.
- **The subtitle bubble.** The sentence being spoken appears live, like Netflix subtitles, so you can follow along without losing your place in the code.
- **The chat log.** Click **^** to slide up the full history: your transcribed questions, the AI's answers and any code cards. If the AI suggests swapping an `ArrayList` for a `HashSet`, the snippet appears with **Insert at Cursor** and **Copy** buttons.
- **Line highlights.** The lines the AI is discussing are highlighted in the editor.

## Architecture

```
┌──────────────── VS Code (your machine) ──────────────────┐
│ Extension host (Node)                                    │
│  Ctrl+Alt+Space ─► SessionController (state machine)     │
│    ├─ editorContext   file · cursor · selection · errors │
│    ├─ MicRecorder     PvRecorder → 16 kHz → 24 kHz PCM   │
│    ├─ AgentClient     paced WebSocket session ───────────┼─ wss ─► AssemblyAI Voice Agent API
│    ├─ lineReferences  "on line 21" → editor highlight    │
│    └─ CodeCards       Insert at Cursor / Replace lines   │
│          ▲ postMessage ▼                                 │
│ Webview (bottom panel): robot · subtitles · chat log     │
│    AudioPlayer: 24 kHz PCM → Web Audio                   │
└──────────────┬───────────────────────────────────────────┘
               │ HTTPS: /api/token (once per session) · /api/suggest and /api/usage (after an answer)
               ▼
   Vercel · Next.js ── ASSEMBLYAI_API_KEY ─► single-use tokens · code cards (LLM Gateway) · usage (Upstash Redis)
```

The extension is a lightweight client. Everything sensitive stays on a small backend deployed on Vercel.

- **The API key never leaves the server.** The Vercel route `/api/token` uses the AssemblyAI key to create a **single-use token** that must be redeemed within two minutes. The extension uses it to open the Voice Agent session.
- **Audio goes straight to AssemblyAI.** Sending every audio packet through our own WebSocket proxy would add a network hop to each one. Vercel's WebSocket support is also still in beta, with a connection cap of about 5 minutes. Single-use tokens give the same key protection as a proxy at the latency of a direct connection.
- **One source of truth for the AI's setup.** The prompt, voice, coding key terms and audio settings live in the backend (`backend/lib/agentConfig.ts`). The token route sends them to the extension, which opens every session with them.
- **The voice agent does one job.** It only talks. It names lines out loud ("on line twenty-one"), and the extension highlights them at the moment each word plays, using the word timing the Voice Agent sends. When an answer proposes a change, a separate LLM Gateway call (`/api/suggest`) writes the exact code for the card, after the voice is already on its way.
- **Native microphone capture.** VS Code webviews can't use the microphone, so the extension records 16 kHz audio in the extension host with PvRecorder. It then resamples it to the 24 kHz AssemblyAI expects, and sends it no faster than real time, because the Voice Agent drops audio that arrives faster.
- **Sessions are cheap and resilient.** A dropped connection reconnects in the background and resumes the same conversation if it's back within 30 seconds. A session nobody has used for 3 minutes is ended, because Voice Agent time is billed while a session is open.

## Tech stack

| Layer | Technology |
|---|---|
| IDE client | VS Code Extension API, TypeScript, esbuild |
| Voice capture | `@picovoice/pvrecorder-node` (prebuilt for Windows, macOS and Linux) |
| Voice conversation | AssemblyAI Voice Agent API over a WebSocket (`ws`) |
| Code cards | AssemblyAI LLM Gateway (`claude-haiku-4-5-20251001`, structured JSON output) |
| UI | Webview view (HTML, CSS, TypeScript) with the Web Audio API for playback |
| Backend | Next.js App Router on Vercel: single-use tokens, code cards and usage metering |
| Usage and quota | Upstash Redis through the Vercel Marketplace |

## Business model

- **Target users.** The first market is computer science undergraduates and junior developers joining legacy codebases. They often struggle with foundational data structures such as linked lists, stacks and generics, and they learn best from conversational, back-and-forth tutoring.
- **Market size.** VS Code has roughly 30 million users worldwide. EchoCode's initial target is the estimated 5 to 7 million university-level CS students and entry-level developers among them.
- **Freemium SaaS pricing:**

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 30 minutes of voice pair programming per month |
| Pro | $10/month | Unlimited voice sessions and a larger codebase context |

The quota is checked on the server when a session token is created, so the free tier can't be bypassed from the client.

## Repository layout

```
extension/
  README.md                     the extension's page in VS Code (install, commands, settings, privacy)
  scripts/dev-host.mjs          `npm run dev`: opens VS Code with EchoCode loaded from source
  src/extension.ts              activation: panel, commands, hotkey
  src/SessionController.ts      push-to-talk state machine for each question
  src/audio/                    microphone worker thread, levels, silence detection
  src/context/                  builds the [EDITOR CONTEXT] block from the active editor
  src/voice/                    AssemblyAI Voice Agent client, and clients for tokens, code cards and usage
  src/ui/                       panel host, status bar robot, line highlights, code cards
  webview/                      panel UI: robot, subtitles, chat log, 24 kHz audio playback
  test/                         unit tests (node --test)
backend/
  app/page.tsx                  landing page
  app/api/token/route.ts        mints single-use Voice Agent tokens (checks quota and rate limits)
  app/api/suggest/route.ts      writes the code behind an answer, for its code card
  app/api/usage/route.ts        records the voice minutes each answer used
  app/api/health/route.ts       status check
  lib/agentConfig.ts            prompt, voice, coding key terms and audio settings
  lib/assemblyai.ts             AssemblyAI token and LLM Gateway calls
  lib/suggestion.ts             the code-card prompt and JSON schema
  lib/usage.ts                  freemium metering in Upstash Redis
  scripts/smoke-live.mjs        end-to-end check without VS Code
demo/                           Java files used in the live demo
```

## Getting started

You'll need:

- Node.js 22.18 or later (24 recommended)
- VS Code 1.95 or later
- A microphone, ideally with headphones

The extension uses the deployed backend at **https://echo-code-hackathon.vercel.app** by default, so you don't need an AssemblyAI key to try it.

**Just want to try it?** Download `echocode-0.1.0.vsix` from the [latest release](https://github.com/TeyYongZhun/EchoCode_Hackathon/releases/latest). In VS Code, open the Extensions view, click **⋯ → Install from VSIX…**, pick the file, then open the `demo/` folder and follow step 2 below.

**1. Run the extension from source.**

```bash
cd extension
npm install
npm run dev
```

This builds EchoCode, checks that the backend is reachable, and opens a VS Code window on the `demo/` folder with the extension loaded. (**Run EchoCode** from the Run and Debug view opens the same window with the debugger attached.)

**2. Talk to it.**

1. In the new window, run **EchoCode: Test Microphone** from the Command Palette. If it reports silence, run **EchoCode: Choose Microphone**.
2. Open `GenericStack.java`, select the `push` method and ask *"Walk me through this method."* To talk, either:
   - **hold** Ctrl+Alt+Space while you speak and let go to send, or
   - **tap** Ctrl+Alt+Space (or click **EchoCode** in the status bar), speak, then tap again or pause for two seconds.
3. The answer plays through the EchoCode panel at the bottom of the window, with the transcript alongside.

The **EchoCode** output channel logs every step, including connection time and the latency of each answer.

**Running your own backend (optional).** You'll need an AssemblyAI API key from your [AssemblyAI dashboard](https://www.assemblyai.com/dashboard).

```bash
cd backend
npm install
cp .env.example .env.local   # then put your key in ASSEMBLYAI_API_KEY
npm run dev                  # serves http://localhost:3000
```

Set `echocode.backendUrl` to `http://localhost:3000` in VS Code settings. From `extension/`, run `ECHOCODE_BACKEND_URL=http://localhost:3000 npm run dev` to have the launcher start the local backend for you. `npm run smoke` in `backend/` checks the whole path to the AssemblyAI Voice Agent without VS Code or a microphone.

To deploy your own on Vercel, import the repository, set **Root Directory** to `backend` and **Framework Preset** to Next.js, and add `ASSEMBLYAI_API_KEY` as an environment variable. To switch on the free-tier quota, add **Upstash Redis** from the Vercel Marketplace to the project and redeploy. Without it, usage isn't metered and nothing is blocked. The other options are listed in `backend/.env.example`.

**Useful commands**

| Where | Command | What it does |
|---|---|---|
| `extension/` | `npm run dev` | Builds EchoCode and opens VS Code on `demo/` with it loaded |
| `extension/` | `npm test` | Unit tests: editor context, line references, subtitles, hotkey handling, audio and resampling |
| `extension/` | `npm run typecheck` | Type-checks the extension and the webview |
| `extension/` | `npm run watch` | Rebuilds on save (reload the Development Host to pick up changes) |
| `extension/` | `npm run package` | Builds `echocode-0.1.0.vsix`, including the native microphone library for Windows, macOS and Linux |
| `backend/` | `npm run dev` | Runs the backend locally at http://localhost:3000 |
| `backend/` | `npm run smoke` | Asks the Voice Agent one question through the backend and reports the reply and latency |
| `backend/` | `npm run build` | Production build of the backend and landing page |

**Settings** (search "EchoCode" in Settings): `echocode.backendUrl` (default `https://echo-code-hackathon.vercel.app`), `echocode.micDeviceIndex`, `echocode.maxContextLines` and `echocode.autoStopSilenceMs`.

## Troubleshooting

| Problem | Fix |
|---|---|
| No **🤖 EchoCode** in the status bar | Check the extension is installed and enabled in the Extensions view, then run **Developer: Reload Window**. Right-click the status bar and make sure **EchoCode** is ticked. |
| The hotkey does nothing | Click inside a code editor first. The terminal and chat boxes take the key for themselves. You can also click the status bar robot or run **EchoCode: Talk / Send Question**. |
| Double-clicking the `.vsix` opens "VSIX Installer" and fails | That's Visual Studio's installer, not VS Code's. Use **Extensions view → ⋯ → Install from VSIX…** in VS Code instead. |
| "Couldn't open the microphone" or silence in the mic test | On Windows, turn on **Settings → Privacy & security → Microphone → Let desktop apps access your microphone**, then pick your mic with **EchoCode: Choose Microphone**. |
| "I didn't hear anything" | EchoCode heard no speech, so nothing was sent. Speak a little closer to the microphone. |
| "Extension host did not start in 10 seconds" when debugging | The window is waiting for the debugger. Close it and use `npm run dev` in `extension/`, which needs no debugger. |
| "Can't reach the EchoCode backend" | Check your internet connection, or run the backend locally and set `echocode.backendUrl` to it. |

Every step is logged in **View → Output → EchoCode**.

