# EchoCode — Voice-First AI Pair Programmer

![Status](https://img.shields.io/badge/Status-Hackathon%20MVP-orange)
![VS Code Extension](https://img.shields.io/badge/VS%20Code%20Extension-007ACC)
![AssemblyAI](https://img.shields.io/badge/AssemblyAI-2545D3)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)

EchoCode is a VS Code extension that lets you ask about your code out loud and hear the answer, like pair programming with a senior engineer.

**[Landing page](https://echo-code-hackathon.vercel.app)** · **[Download the extension](https://github.com/TeyYongZhun/EchoCode-Hackathon/releases/latest)** · **[Try it in 2 minutes](#try-it)**

## Tech stack

| Part | Built with |
|---|---|
| Voice conversation | AssemblyAI Voice Agent API |
| Code suggestions | AssemblyAI LLM Gateway |
| VS Code extension | TypeScript, VS Code Extension API, esbuild |
| Microphone | PvRecorder (Windows, macOS, Linux) |
| Backend and landing page | Next.js on Vercel |
| Usage metering | Upstash Redis |

## The problem

Many students now "vibe code": they tell an AI *"please fix the code"* and paste in whatever comes back, without knowing what was wrong or why the fix works. Asking for a real explanation takes more effort, because it means typing a long prompt, copy-pasting code into a chat window, and matching the answer back to the right lines. So they skip the understanding and ship code they cannot explain. EchoCode makes asking *why* as easy as talking, so understanding the code takes less effort than copying it.

## The solution

Hold one key and ask out loud. EchoCode already knows your file, selection, errors and the rest of your project, so you never copy-paste anything.

1. **Wake it.** Press `Ctrl+Alt+Space` once. EchoCode says hello and stays ready.
2. **Hold the key and ask:** *"Why is this so slow?"*, *"Where do I change the font?"*, *"Open the LinkedList file."* Let go to send.
3. **Listen and apply.** A voice explains, the lines it mentions light up, and a suggested fix appears with a **Replace lines** button.

## Key features

- 🎙️ **Talk, don't type.** Nothing is recorded until you press the key.
- 📁 **Knows your project.** Answers about files you don't have open, and opens them for you.
- 🧭 **Takes you there.** *"Open the style.css file"* works even if the name is heard slightly wrong.
- 🔦 **Points at the code.** Lines light up at the moment they are mentioned.
- ⚡ **One-click fixes.** Code cards with **Replace lines** or **Insert at Cursor**.
- ✋ **Interrupt any time.** Press the key mid-answer to ask something else.
- 💬 **Read along.** The answer appears as text while it is spoken.

## How EchoCode uses AssemblyAI

| Product | What it does in EchoCode |
|---|---|
| **Voice Agent API** | Runs the whole spoken conversation in one streaming session. **Key terms** improve recognition of coding words, **turn detection** closes the question, and **word-level timing** lights up each line as it is spoken. |
| **LLM Gateway** | Writes the code for each suggested fix as JSON, after the voice answer, so it never slows the conversation. |
| **Single-use tokens** | The backend keeps the API key secret and gives the extension a short-lived token per conversation. |

## Architecture

![EchoCode architecture: the VS Code extension captures editor and project context and streams mic audio to AssemblyAI's Voice Agent over one WebSocket session. Over HTTPS it calls the EchoCode backend on Vercel, which holds the API key, mints single-use session tokens, meters usage and calls the AssemblyAI LLM Gateway to write each code card.](docs/architecture.svg)

- **The key stays safe.** Only the Vercel backend holds the AssemblyAI API key.
- **The voice is fast.** Audio goes straight from VS Code to AssemblyAI, with no server in between.
- **Costs are bounded.** Idle sessions close after 3 minutes, sessions are capped at 15 minutes, and tokens are rate-limited per install, per IP and per day.
- **Privacy.** Your audio, the open file and other project source files go to AssemblyAI. Git-ignored files and files named like secrets (`.env`, `credentials.json`, key files) stay on your machine, unless one is the file you have open. Nothing is stored except an anonymous install id and usage counts.

## Try it

**You need:** desktop VS Code 1.95 or later (1.106 or later to get the right-hand panel) and a microphone. No API key is needed.

1. **Install.** Download `echocode-0.1.4.vsix` from the [latest release](https://github.com/TeyYongZhun/EchoCode-Hackathon/releases/latest). In VS Code, open the Extensions view and choose **⋯ → Install from VSIX…**. Don't double-click the file: on Windows that opens Visual Studio's installer.
2. **Open the demo.** Download this repository and open its `demo/` folder in VS Code.
3. **Check your mic.** Press `Ctrl+Shift+P` and run **EchoCode: Test Microphone**.
4. **Wake EchoCode.** Click once inside the **EchoCode** panel (VS Code keeps a panel silent until you do), then press `Ctrl+Alt+Space` (`Ctrl+Shift+Space` on macOS).
5. **Ask.** Select some code, click inside the editor, **hold** the same key, ask, and let go.

| Demo file | Select | Ask |
|---|---|---|
| `GenericStack.java` | the `push` method | *"Walk me through this method. Why does it double the array?"* |
| `DuplicateFinder.java` | the `findDuplicates` method | *"Why is this so slow with a big list? How do I fix it?"* Then click **Replace lines**. |
| `LinkedList.java` | the `removeLast` method | *"Why does this crash?"* |
| `web/index.html` | nothing | *"Where do I change the font?"* — `style.css` opens at the `font-family` line. |
| `web/index.html` | nothing | *"Why doesn't the counter update when I delete a task?"* — `app.js` opens at the bug. |

Click **⚙** in the panel to see your minutes left, change the hotkey or change the background.

## Business model

**We sell to institutions, not to students.** Individuals use EchoCode free; bootcamps and university departments pay for their learners.

| Plan | Price | Included | Status |
|---|---|---|---|
| **Free** | $0 | 10 minutes of voice a month, about 13 questions | **Available today** |
| **Pro** | $20/month or $192/year | 60 questions a month, about 45 minutes | Not on sale yet |
| **Cohort** | $25 per learner, once, per 12-week cohort | Pooled voice allowance | Not on sale yet |
| **Campus** | $36 per seat, per academic year | Pooled voice allowance | Not on sale yet |

- **Cost per question:** about $0.22 today. The Voice Agent API bills per second a session is open ($0.075 a minute), so idle time is the cost driver.
- **Next step:** cutting the idle timeout from 3 minutes to 60 seconds brings it to about $0.13 and lifts the modelled overall margin from about 36% to about 63%.
- **Details:** [revenue plan](docs/EchoCode-Revenue-Plan.pdf).

## Run from source

**You need:** Node.js 22.18 or later (24 recommended).

```bash
cd extension
npm install
npm run dev
```

This builds EchoCode and opens a VS Code window on `demo/` with the extension loaded. Logs are in **View → Output → EchoCode**.

## Run your own backend

**You need:** an AssemblyAI API key from your [AssemblyAI dashboard](https://www.assemblyai.com/dashboard).

```bash
cd backend
npm install
cp .env.example .env.local   # then set ASSEMBLYAI_API_KEY
npm run dev                  # serves http://localhost:3000
```

Then set `echocode.backendUrl` to `http://localhost:3000` in VS Code. Or, from `extension/`, let the launcher start the backend for you:

```bash
ECHOCODE_BACKEND_URL=http://localhost:3000 npm run dev
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | Yes | Your AssemblyAI key. Never commit `.env.local`. |
| `ASSEMBLYAI_VOICE` | No | Voice of the agent (default `george`) |
| `ASSEMBLYAI_SUGGEST_MODEL` | No | Code-card model (default `qwen3.5-4b-32k-fast`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No | Turn on usage metering. Without them, nothing is counted or blocked. |
| `ECHOCODE_FREE_SECONDS_PER_MONTH` | No | Free voice allowance (default `600`) |
| `ECHOCODE_PRO_SECONDS_PER_MONTH` | No | Pro voice allowance (default `2700`) |
| `ECHOCODE_PRO_INSTALL_IDS` | No | Comma-separated install ids on the Pro plan |
| `ECHOCODE_MAX_TOKENS_PER_DAY` | No | Daily session-token ceiling across all users (default `400`) |
| `ECHOCODE_MAX_TOKENS_PER_IP_PER_DAY` | No | Daily session-token ceiling per IP (default `200`) |

The allowance and ceiling variables need Redis.

### Deploy

- **Backend:** import the repository on Vercel, set **Root Directory** to `backend` and **Framework Preset** to Next.js, and add `ASSEMBLYAI_API_KEY`.
- **Usage metering (optional):** add **Upstash Redis** from the Vercel Marketplace and redeploy.
- **Extension:** run `npm run package` in `extension/` and attach the `.vsix` to a GitHub release.

## Testing

```bash
cd extension
npm install   # first time only
npm test
```

**93 tests, all passing**, in about 25 seconds, on Node's built-in test runner with no extra dependencies.

![EchoCode test suite: 93 tests across 9 files, all passing](docs/EchoCode-Test-Report.png)

- **Covered:** the Voice Agent protocol, audio resampling, line and file references, code-card placement, project context budget, push-to-talk and conversation memory.
- **No live API needed:** a local WebSocket server replays AssemblyAI's protocol, so interruptions, empty answers and dropped connections are tested deterministically and cost nothing.

## Commands and settings

| Where | Command | What it does |
|---|---|---|
| `extension/` | `npm run dev` | Builds EchoCode and opens VS Code on `demo/` |
| `extension/` | `npm test` | Runs the 93 unit tests |
| `extension/` | `npm run typecheck` | Type-checks the extension and webview |
| `extension/` | `npm run watch` | Rebuilds on save |
| `extension/` | `npm run package` | Builds `echocode-0.1.4.vsix` |
| `backend/` | `npm run dev` | Runs the backend at http://localhost:3000 |
| `backend/` | `npm run smoke` | Asks the Voice Agent one question and reports the reply and latency |
| `backend/` | `npm run build` | Production build |

| Setting | Default | What it does |
|---|---|---|
| `echocode.backendUrl` | `https://echo-code-hackathon.vercel.app` | Backend that issues session tokens |
| `echocode.micDeviceIndex` | `-1` | Microphone to record from; `-1` is the system default |
| `echocode.maxContextLines` | `400` | Lines of the open file sent with each question |
| `echocode.autoStopSilenceMs` | `2000` | Send automatically after this much silence; `0` turns it off |
| `echocode.panelBackground` | `midnight` | `midnight`, `graphite`, `purple`, `ocean` or `vscode` |

## Troubleshooting

| Problem | Fix |
|---|---|
| Double-clicking the `.vsix` opens "VSIX Installer" | Use **Extensions view → ⋯ → Install from VSIX…** in VS Code instead. |
| No **🤖 EchoCode** in the status bar | Check the extension is enabled, then run **Developer: Reload Window**. |
| The hotkey does nothing | Click inside a code editor first, or click the status bar robot. Rebind it in **⚙ → Change hotkey** if another extension uses the key. |
| "EchoCode can't be heard yet" | Click anywhere inside the panel once. |
| "Couldn't open the microphone" | On Windows, turn on **Settings → Privacy & security → Microphone → Let desktop apps access your microphone**, then run **EchoCode: Choose Microphone**. |
| "I didn't hear anything" | Speak closer to the microphone, and pause briefly after pressing the key. |
| "EchoCode didn't answer that time" | Ask again. If it repeats, check **View → Output → EchoCode**. |
| "Can't reach the EchoCode backend" | Check your internet connection, or run the backend locally. |
| "Extension host did not start in 10 seconds" | Close the window and use `npm run dev` in `extension/`. |

## Repository layout

```
EchoCode-Hackathon/
├── extension/                      the VS Code extension
│   ├── src/
│   │   ├── extension.ts            entry point: registers commands, hotkey and panel
│   │   ├── SessionController.ts    runs each voice question from key press to answer
│   │   ├── audio/                  microphone recording, resampling, silence detection
│   │   ├── context/                editor and project context, line and file references
│   │   ├── voice/                  AssemblyAI Voice Agent client and backend API calls
│   │   └── ui/                     panel, line highlights, code cards, status bar
│   ├── webview/                    panel UI, robot animation and audio playback
│   ├── scripts/                    launcher behind `npm run dev`
│   └── test/                       93 unit tests
├── backend/                        Next.js backend and landing page on Vercel
│   ├── app/
│   │   ├── api/token/              issues single-use Voice Agent tokens
│   │   ├── api/suggest/            writes code cards through the LLM Gateway
│   │   ├── api/usage/              reports voice minutes used per plan
│   │   ├── api/health/             status check
│   │   └── page.tsx                landing page
│   ├── lib/                        agent prompt and settings, AssemblyAI calls, usage metering
│   └── scripts/                    live smoke test behind `npm run smoke`
├── demo/                           sample code for the live demo
│   ├── *.java                      three Java files, each with a bug or slow method to ask about
│   └── web/                        small to-do app for cross-file questions
└── docs/                           architecture diagram, revenue plan, test report
```
