# EchoCode

**The voice-first AI pair programmer for VS Code.**

Highlight the code that confuses you, press **Ctrl+Alt+Space** and ask your question out loud. EchoCode reads the file you're looking at, then a virtual Senior Staff Engineer talks you through the logic, the architecture and the bug. The answer is spoken back in real time with live subtitles.

EchoCode runs on the **Gemini Live API** (`gemini-3.8-live`), which listens, reasons and speaks in one native audio stream.

> **Demo:** a GIF of the three demo scenes will be added on Day 3 of the build (see [Build plan](#build-plan)).

---

## The problem: text-based context switching

AI coding assistants have made developers faster, but you still talk to them by typing. When you hit a hard algorithm, a tricky data structure or an unfamiliar codebase, you have to:

1. Break your flow to type a long, precise prompt.
2. Copy and paste code, error logs and file structures into a chat window.
3. Work out which part of your code each line of the AI's text answer refers to.

The result is **"vibe coding" fatigue**. Developers paste in solutions they don't really understand, because asking for a line-by-line explanation takes too much effort.

EchoCode makes that explanation effortless. If a nested loop or a generic type confuses you, select it, tap the hotkey and ask, the way you'd ask a colleague sitting next to you.

## What makes it different

- **Native audio-to-audio, not a chatbot wrapper.** Most voice assistants chain speech-to-text, a language model and text-to-speech. Gemini Live replaces that pipeline with one real-time stream that hears your question and reads your code at the same time.
- **Context without copy-paste.** The extension quietly attaches the open file, your cursor line, your selection and nearby compiler errors. There's no screen sharing or video, so it stays fast and uses few tokens.
- **It points at the code.** As the AI explains, the lines it's talking about light up in your editor, so you never have to match the answer back to the code yourself.
- **Answers you can act on.** Suggested code arrives as a card with a one-click **Insert at Cursor** button.

## How it works

1. **Voice trigger.** Select a block of code, press **Ctrl+Alt+Space** (**Ctrl+Shift+Space** on macOS) and ask something like *"Walk me through this method. Why are we using a generic Stack here?"* Press the hotkey again when you're done, or simply stop talking.
2. **Silent context capture.** The extension reads the active editor through the VS Code API. It collects the file path, language, cursor line, your selection, the surrounding code with line numbers, and any diagnostics.
3. **One live session.** The editor context and your microphone audio (16 kHz PCM) travel over a single WebSocket session to Gemini Live.
4. **Native multimodal reasoning.** Gemini hears your question directly, with no transcription step first, and reasons over the exact code you're looking at.
5. **Spoken answer.** The reply streams back as 24 kHz audio with live subtitles. The target is under 600 ms from the end of your question to the first spoken word, and every turn shows its measured latency.

EchoCode is push-to-talk. Nothing is sent until you press the hotkey, so background noise in a busy room can't start a conversation by accident.

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
│    ├─ MicRecorder     PvRecorder → 16 kHz PCM frames     │
│    ├─ LiveClient      @google/genai live session ────────┼─ wss ─► Gemini Live (gemini-3.8-live)
│    └─ tools           suggest_code · highlight_lines     │
│          ▲ postMessage ▼                                 │
│ Webview (bottom panel): robot · subtitles · chat log     │
│    AudioPlayer: 24 kHz PCM → Web Audio                   │
└──────────────┬───────────────────────────────────────────┘
               │ HTTPS POST /api/token  (once per session)
               ▼
   Vercel · Next.js route /api/token ── GEMINI_API_KEY ─► mints ephemeral token
```

The extension is a lightweight client. Everything sensitive stays on a small backend deployed on Vercel.

- **The API key never leaves the server.** The Vercel route `/api/token` uses the Gemini key to create a **single-use ephemeral token**. The token expires within minutes and is locked to EchoCode's model and session settings. The extension uses it to open the live session.
- **Audio goes straight to Google.** Sending every audio packet through our own WebSocket proxy would add a network hop to each one. Vercel's WebSocket support is also still in beta, with a connection cap of about 5 minutes. Ephemeral tokens give the same key protection as a proxy at the latency of a direct connection.
- **One source of truth for the AI's setup.** The model, voice, system prompt and tool definitions live in the backend (`backend/lib/liveConfig.ts`). The token route sends that setup to the extension, so client and server never disagree.
- **Native microphone capture.** VS Code webviews can't use the microphone, so the extension records audio in the extension host with PvRecorder. It produces exactly the format Gemini expects: 16 kHz, 16-bit, mono PCM.

## Tech stack

| Layer | Technology |
|---|---|
| IDE client | VS Code Extension API, TypeScript, esbuild |
| Voice capture | `@picovoice/pvrecorder-node` (prebuilt for Windows, macOS and Linux) |
| Live AI session | `@google/genai` SDK with the Gemini Live API (`gemini-3.8-live`) |
| UI | Webview view (HTML, CSS, TypeScript) with the Web Audio API for playback |
| Backend | Next.js App Router on Vercel: ephemeral token minting and usage metering |
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

## Build plan

EchoCode is being built during a 3-day hackathon. Each step lands as its own commit, and the boxes are ticked as they're done.

**Day 1: It talks**
- [x] 0. Project README: pitch, architecture and plan
- [x] 1. Scaffold the extension (esbuild) and the backend (Next.js), plus the demo files
- [ ] 2. `/api/token` creates ephemeral tokens
- [ ] 3. Microphone check: PvRecorder recording inside VS Code
- [ ] 4. Voice loop: hotkey, then context and mic audio to Gemini Live, then a spoken answer

**Day 2: It looks like EchoCode**
- [ ] 5. Robot UI with an audio visualizer, the subtitle bubble, the collapsible chat log and the status bar robot
- [ ] 6. Code cards with Insert at Cursor (`suggest_code`) and editor line highlights (`highlight_lines`)
- [ ] 7. Latency badge, interrupting the AI mid-answer, and friendly error messages
- [ ] 8. Backend deployed to Vercel

**Day 3: It's a product**
- [ ] 9. Session resumption and pre-warmed connections
- [ ] 10. Freemium quota (30 minutes a month) stored in Upstash Redis
- [ ] 11. Landing page, packaged VSIX and final README
- [ ] 12. Demo rehearsal and backup recording

## Repository layout

```
extension/
  src/extension.ts              activation: panel, commands, hotkey
  src/SessionController.ts      push-to-talk state machine for each question
  src/audio/                    microphone worker thread, levels, silence detection
  src/context/                  builds the [EDITOR CONTEXT] block from the active editor
  src/gemini/                   session token request and the Gemini Live client
  src/ui/                       webview panel host
  webview/                      panel UI and 24 kHz audio playback
  test/                         unit tests (node --test)
backend/
  app/api/token/route.ts        mints single-use ephemeral tokens
  app/api/health/route.ts       status check
  lib/liveConfig.ts             model, voice, system prompt and session settings
  scripts/smoke-live.mjs        end-to-end check without VS Code
demo/                           Java files used in the live demo
```

## Getting started

You'll need:

- Node.js 22.18 or later (24 recommended)
- VS Code 1.95 or later
- A microphone, ideally with headphones
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). The free tier is enough.

**1. Start the backend.** It holds your API key and hands out short-lived session tokens.

```bash
cd backend
npm install
cp .env.example .env.local   # then put your key in GEMINI_API_KEY
npm run dev                  # serves http://localhost:3000
```

To check the whole path to Gemini without VS Code or a microphone, run `npm run smoke` in a second terminal. It asks Gemini one question and prints the reply and its latency.

**2. Run the extension.**

```bash
cd extension
npm install
```

Open the repository folder in VS Code and press **F5**. A second VS Code window, the Extension Development Host, opens on the `demo/` folder with EchoCode loaded.

**3. Talk to it.**

1. In the new window, run **EchoCode: Test Microphone** from the Command Palette. If it reports silence, run **EchoCode: Choose Microphone**.
2. Open `GenericStack.java`, select the `push` method, press **Ctrl+Alt+Space** and ask *"Walk me through this method."*
3. Press **Ctrl+Alt+Space** again, or just stop talking for two seconds. The answer plays through the EchoCode panel at the bottom of the window.

The **EchoCode** output channel logs every step, including connection time and the latency of each answer.

**Useful commands**

| Where | Command | What it does |
|---|---|---|
| `extension/` | `npm test` | Unit tests for context building and audio helpers |
| `extension/` | `npm run typecheck` | Type-checks the extension and the webview |
| `extension/` | `npm run watch` | Rebuilds on save (reload the Development Host to pick up changes) |
| `backend/` | `npm run build` | Production build of the backend |

**Settings** (search "EchoCode" in Settings): `echocode.backendUrl` (default `http://localhost:3000`), `echocode.micDeviceIndex`, `echocode.maxContextLines` and `echocode.autoStopSilenceMs`.

## Presentation and judging

- **Live demo.** There are three scenes. First, a walkthrough of a generic `Stack<T>`, with lines highlighted as the AI speaks. Second, *"Why is this slow?"*, which leads to an `ArrayList` → `HashSet` fix inserted with one click. Third, *"Why does this crash?"*, about a null pointer in a linked list. Every answer shows its measured latency.
- **Try it yourself.** Judges get the packaged extension (`.vsix`) and the `demo/` folder. EchoCode runs in desktop VS Code, including desktop VS Code connected to a GitHub Codespace, because the extension always runs on your own machine where the microphone is. Browser-only editors such as vscode.dev can't reach a local microphone.
- **Commit history.** EchoCode was built solo during the event, and each step of the build plan above is a separate commit.
