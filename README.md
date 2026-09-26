# EchoCode — Voice-First AI Pair Programmer

![Status](https://img.shields.io/badge/Status-Hackathon%20MVP-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![VS Code Extension](https://img.shields.io/badge/VS%20Code%20Extension-007ACC)
![AssemblyAI](https://img.shields.io/badge/AssemblyAI-2545D3)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Upstash Redis](https://img.shields.io/badge/Upstash%20Redis-00E9A3?logo=upstash&logoColor=white)
![esbuild](https://img.shields.io/badge/esbuild-FFCF00?logo=esbuild&logoColor=black)

EchoCode is a VS Code extension that lets you ask about your code out loud and hear the answer, like pair programming with a senior engineer.

**[Landing page](https://echo-code-hackathon.vercel.app)** · **[Download the extension](https://github.com/TeyYongZhun/EchoCode_Hackathon/releases/latest)** · **[Try it in 2 minutes](#try-it)**

---

## In 30 seconds

- **The problem:** asking an AI about your code means typing long prompts and copy-pasting code into a chat window. Students skip it and paste answers they don't understand.
- **Our solution:** select the confusing code, hold one key, and ask out loud. EchoCode answers by voice, highlights the lines it's talking about, and hands you the fix as one-click code.
- **Built on AssemblyAI:** the **Voice Agent API** runs the spoken conversation, and the **LLM Gateway** writes the code for suggested fixes.
- **Who it's for:** computer science students and junior developers who learn best by talking a problem through.

## The problem

When you hit a hard algorithm or unfamiliar code, today's AI assistants make you:

1. Stop and type a long, precise prompt.
2. Copy and paste code and error messages into a chat window.
3. Work out which part of your code each line of the answer means.

It's so much effort that many people give up and paste in code they don't understand. We call it **"vibe coding" fatigue**.

## How it works

1. **Select** the code you're curious about.
2. **Hold Ctrl+Alt+Space and ask** out loud: *"Why is this so slow?"* Let go to send.
3. **Listen and apply.** A senior-engineer voice explains, the lines it mentions light up in your editor, and a suggested fix appears with a **Replace lines** button.

EchoCode already knows which file you're in, where your cursor is, what you selected and any compiler errors, so you never copy-paste anything.

## Key features

| Feature | What it means for you |
|---|---|
| 🎙️ **Talk, don't type** | Hold a key and ask, like asking a colleague. Nothing is recorded until you press it. |
| 📄 **Knows your code** | Your file, selection and errors go with every question automatically. |
| 🔦 **Points at the code** | Lines light up at the moment they're mentioned in the answer. |
| ⚡ **One-click fixes** | Suggested code appears as a card: **Replace lines** or **Insert at Cursor**. |
| ✋ **Interrupt any time** | Press the key mid-answer to ask something else. |
| 💬 **Live subtitles** | The spoken answer appears as subtitles, with the full conversation always visible above it. |
| ⚙️ **Your settings** | See your plan and minutes left, change the hotkey, and pick a panel background. |

## How EchoCode uses AssemblyAI

| AssemblyAI product | What it does in EchoCode |
|---|---|
| **Voice Agent API** | Runs the whole spoken conversation in one streaming session: it hears the question, reasons over your code and speaks the answer. Coding **key terms** (HashSet, generics, null pointer…) improve recognition, **semantic turn detection** knows when you've finished, **interruptions** are built in, and **word-level timing** drives the live subtitles and line highlights. |
| **LLM Gateway** | Writes the exact code behind a suggested fix as JSON, using `qwen3.5-4b-32k-fast` (set `ASSEMBLYAI_SUGGEST_MODEL` to use a stronger model your account has access to). It runs after the voice answer, so it never slows the conversation down. |
| **Single-use tokens** | Our backend keeps the AssemblyAI API key secret and gives the extension a short-lived token for each conversation. |

## Architecture

![EchoCode architecture: the VS Code extension streams mic audio and editor context to AssemblyAI's Voice Agent API over a WebSocket, while a Next.js backend on Vercel holds the AssemblyAI key, mints single-use tokens, writes code cards through the LLM Gateway and meters usage in Upstash Redis.](docs/architecture.svg)

- **The key stays safe.** Only the backend on Vercel knows the AssemblyAI API key. The extension gets a single-use token that expires within two minutes.
- **The voice is fast.** Audio goes straight from VS Code to AssemblyAI, with no server in between.
- **Costs stay low.** Unused sessions close after 3 minutes, and each user's voice minutes are counted in Upstash Redis against their plan.

## Business model

- **Who it's for first:** CS undergraduates and junior developers. They often struggle with data structures such as linked lists, stacks and generics, and learn best through back-and-forth conversation.
- **Market:** VS Code has about 30 million users. Our first target is the estimated 5 to 7 million students and entry-level developers among them.
- **Pricing:**

| Plan | Price | Voice minutes | Includes |
|---|---|---|---|
| Free | $0 | 15 a month, about 20 questions | Spoken answers, line highlights, live subtitles, one-click code cards |
| Pro | $15/month, or $144/year | 150 a month, about 200 questions | Everything in Free, plus a stronger AI model for code fixes, larger code context and minute top-ups |

- **Teams and universities (coming next):** shared minutes for companies, and a campus plan with an instructor view showing which concepts students struggle with.
- **Unit economics:** the Voice Agent API costs $0.075 a minute, so a free user costs at most $1.13 a month and a Pro user at most $11.25, less than they pay. The average student in published classroom studies asks 8 to 20 AI questions a month, which fits inside Free. Question counts assume about 0.75 minutes of session time per question.

## Try it

You need desktop VS Code 1.95 or later (1.106 or later to get EchoCode in the right panel; older versions show it in the Explorer) and a microphone. Headphones help. No API key is needed.

1. **Install:** download `echocode-0.1.2.vsix` from the [latest release](https://github.com/TeyYongZhun/EchoCode_Hackathon/releases/latest). In VS Code, open the Extensions view, click **⋯ → Install from VSIX…** and pick the file. Don't double-click the file: on Windows that opens Visual Studio's installer instead.
2. **Open the demo:** download this repository and open its `demo/` folder in VS Code.
3. **Check your mic:** press **Ctrl+Shift+P** and run **EchoCode: Test Microphone**.
4. **Ask:** open a demo file, select the code below, click inside the editor, then **hold Ctrl+Alt+Space** (**Ctrl+Shift+Space** on macOS), ask, and let go. You can also click **🤖 EchoCode** in the status bar instead.

| Demo file | Select | Ask |
|---|---|---|
| `GenericStack.java` | the `push` method | *"Walk me through this method. Why does it double the array?"* |
| `DuplicateFinder.java` | the `findDuplicates` method | *"Why is this so slow with a big list? How do I fix it?"* Then click **Replace lines** on the code card. |
| `LinkedList.java` | the `removeLast` method | *"Why does this crash?"* |

The answer plays in the **EchoCode** tab of the right panel (**Ctrl+Alt+B** shows or hides it), next to the conversation and code cards. Click **⚙** there to see your plan and minutes left this month, change the hotkey, or change the panel background.

## Tech stack

| Part | Built with |
|---|---|
| Voice conversation | AssemblyAI Voice Agent API |
| Code suggestions | AssemblyAI LLM Gateway |
| VS Code extension | TypeScript, VS Code Extension API, esbuild |
| Microphone | PvRecorder (Windows, macOS and Linux) |
| Backend and landing page | Next.js on Vercel |
| Usage metering | Upstash Redis |

## Repository layout

```
EchoCode-Hackathon/
├── extension/                    the VS Code extension
│   ├── src/
│   │   ├── extension.ts          starts EchoCode
│   │   ├── SessionController.ts  runs each voice question
│   │   ├── audio/                microphone and resampling
│   │   ├── context/              editor context, line numbers
│   │   ├── voice/                AssemblyAI client, API calls
│   │   └── ui/                   panel, highlights, code cards
│   ├── webview/                  panel UI and audio playback
│   ├── scripts/                  npm run dev launcher
│   └── test/                     unit tests
├── backend/                      Next.js backend on Vercel
│   ├── app/api/token/            single-use voice tokens
│   ├── app/api/suggest/          code cards
│   ├── app/api/usage/            voice minutes per plan
│   ├── app/api/health/           status check
│   ├── app/page.tsx              landing page
│   └── lib/                      prompt, AssemblyAI, usage
├── demo/                         Java files for the live demo
└── docs/                         architecture diagram
```

## Deployment

| Component | Platform | Notes |
|---|---|---|
| VS Code extension | GitHub Releases | Build with `npm run package` in `extension/` and attach the `.vsix` to a release |
| Backend and landing page | Vercel | Root Directory `backend`, Framework Preset Next.js, add the `ASSEMBLYAI_API_KEY` env variable |
| Voice and code suggestions | AssemblyAI | Voice Agent API and LLM Gateway; the API key lives only on the backend |
| Usage database | Upstash Redis (Vercel Marketplace) | Optional; turns on the monthly voice minutes (15 on Free, 150 on Pro) |

Live backend and landing page: https://echo-code-hackathon.vercel.app

---

## For developers

<details>
<summary><b>Run from source</b></summary>

You'll need Node.js 22.18 or later (24 recommended).

```bash
cd extension
npm install
npm run dev
```

This builds EchoCode, checks that the backend is reachable, and opens a VS Code window on the `demo/` folder with the extension loaded. **Run EchoCode** from the Run and Debug view does the same with the debugger attached. Every step is logged in **View → Output → EchoCode**.

</details>

<details>
<summary><b>Run your own backend</b></summary>

You'll need an AssemblyAI API key from your [AssemblyAI dashboard](https://www.assemblyai.com/dashboard).

```bash
cd backend
npm install
cp .env.example .env.local   # then put your key in ASSEMBLYAI_API_KEY
npm run dev                  # serves http://localhost:3000
```

Set `echocode.backendUrl` to `http://localhost:3000` in VS Code. From `extension/`, run `ECHOCODE_BACKEND_URL=http://localhost:3000 npm run dev` to have the launcher start the backend for you.

To deploy on Vercel, import the repository, set **Root Directory** to `backend` and **Framework Preset** to Next.js, and add `ASSEMBLYAI_API_KEY`. To switch on the monthly voice minutes, add **Upstash Redis** from the Vercel Marketplace and redeploy. Without it, usage isn't counted and nothing is blocked. Every option is listed in `backend/.env.example`.

</details>

<details>
<summary><b>Commands and settings</b></summary>

| Where | Command | What it does |
|---|---|---|
| `extension/` | `npm run dev` | Builds EchoCode and opens VS Code on `demo/` with it loaded |
| `extension/` | `npm test` | Unit tests: editor context, line references, subtitles, hotkey handling, audio and resampling |
| `extension/` | `npm run typecheck` | Type-checks the extension and the webview |
| `extension/` | `npm run watch` | Rebuilds on save (reload the window to pick up changes) |
| `extension/` | `npm run package` | Builds `echocode-0.1.2.vsix` with the microphone library for every platform |
| `backend/` | `npm run dev` | Runs the backend at http://localhost:3000 |
| `backend/` | `npm run smoke` | Asks the Voice Agent one question through the backend and reports the reply and latency |
| `backend/` | `npm run build` | Production build of the backend and landing page |

| Setting | Default | What it does |
|---|---|---|
| `echocode.backendUrl` | `https://echo-code-hackathon.vercel.app` | The backend that issues session tokens |
| `echocode.micDeviceIndex` | `-1` | Microphone to record from; `-1` is the system default |
| `echocode.maxContextLines` | `400` | Lines of the current file sent with each question |
| `echocode.autoStopSilenceMs` | `2000` | Send automatically after this much silence; `0` turns it off |
| `echocode.panelBackground` | `midnight` | Panel background: `midnight`, `graphite`, `purple`, `ocean` or `vscode` (follow your theme). Also in the panel's ⚙ Settings |

</details>

<details>
<summary><b>How it works under the hood</b></summary>

- **Microphone:** VS Code's panels can't use the microphone, so the extension records 16 kHz audio with PvRecorder in a background thread. It resamples the audio to the 24 kHz the Voice Agent expects. Audio recorded while connecting, or before speech is confirmed, is sent at up to twice real time until it catches up with your voice: tested live, the Voice Agent hears it all and answers sooner, while sending much faster gains nothing.
- **Editor context:** each question carries the file path, language, cursor line, selection, the surrounding code with line numbers, and nearby compiler errors, up to 400 lines.
- **Push-to-talk:** nothing is sent until you press the key, and if you don't speak, nothing is sent at all. Once you start speaking, the audio from half a second before is kept too, so a quiet first word isn't cut off. When you let go, a short tail of silence lets the Voice Agent's turn detection close the question. If no reply has started 1.2 seconds after the Voice Agent has the whole question, EchoCode asks for one directly. It never asks earlier, because asking before the question is fully heard gets an empty answer.
- **Line highlights:** the agent names lines out loud ("on line twenty-one"). The extension finds those references in the transcript and highlights each line when its word plays, using the Voice Agent's word timing.
- **One setup for everyone:** the prompt, voice, coding key terms and audio settings live in `backend/lib/agentConfig.ts`, and every session starts with them.
- **Reconnects:** a dropped connection resumes the same conversation if it's back within 30 seconds. When EchoCode has to start a fresh session instead (after a few idle minutes, or when you interrupt an answer), it passes the last few questions and answers to the new one, so the conversation carries on.
- **Interrupting:** tested live, the Voice Agent keeps playing an answer on its side after EchoCode silences it, and throws away a short question asked over it; the API can't cancel an answer. So pressing the key (or Stop) while an answer is still arriving ends that session, and your question goes to a fresh one, connected while you talk.
- **Why no proxy:** sending every audio packet through our own server would add delay, and Vercel's WebSocket support is still in beta with a 5-minute cap. Single-use tokens protect the key just as well, at direct-connection speed.

</details>

<details>
<summary><b>Troubleshooting</b></summary>

| Problem | Fix |
|---|---|
| No **🤖 EchoCode** in the status bar | Check the extension is installed and enabled, then run **Developer: Reload Window**. Right-click the status bar and make sure **EchoCode** is ticked. |
| The hotkey does nothing | Click inside a code editor first; the terminal and chat boxes take the key for themselves. Or click the status bar robot. If another extension uses the same key, pick a new one in the panel's **⚙ → Change hotkey**. |
| The first words of a question are wrong | Pause for a moment after pressing the key before you speak, and speak close to the microphone. If it keeps happening, raise the microphone's input level in your system sound settings. |
| Double-clicking the `.vsix` opens "VSIX Installer" and fails | That's Visual Studio's installer. Use **Extensions view → ⋯ → Install from VSIX…** in VS Code instead. |
| "Couldn't open the microphone" or silence in the mic test | On Windows, turn on **Settings → Privacy & security → Microphone → Let desktop apps access your microphone**, then run **EchoCode: Choose Microphone**. |
| "I didn't hear anything" | No speech was detected, so nothing was sent. Speak closer to the microphone. |
| "EchoCode didn't answer that time" | No answer arrived within 20 seconds. Ask again; if it repeats, check **View → Output → EchoCode** for the reason. |
| "Extension host did not start in 10 seconds" | The window is waiting for a debugger. Close it and use `npm run dev` in `extension/` instead. |
| "Can't reach the EchoCode backend" | Check your internet connection, or run the backend locally. |

</details>
