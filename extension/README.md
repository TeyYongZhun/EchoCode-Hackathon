# EchoCode

**The voice-first AI pair programmer.** Hold a key and ask out loud. EchoCode reads the file you are looking at and the rest of your project, talks you through it, opens the file it is talking about and lights up the lines, takes you to any file you ask for by name, and hands you ready-to-insert code when it suggests a fix.

Powered by AssemblyAI: the Voice Agent API for the conversation and the LLM Gateway for code cards.

## How to use it

The panel itself opens on a **Get started** card with these steps and the default hotkey; your first question pushes it up out of the way, and scrolling to the top of the conversation brings it back.

1. Press **`Ctrl+Alt+Space`** (`Ctrl+Shift+Space` on macOS) once to wake EchoCode. It says hello and stays ready.
2. **Hold the same key**, ask your question and let go. You can also tap the key or click **EchoCode** in the status bar, speak, and tap again. Select some code first if your question is about a particular part.
3. Listen. The answer appears in the conversation in the **EchoCode** tab of the right panel, and the lines it mentions light up in your editor. If the answer is in another file, that file opens. Ask for a file by name — *"open the LinkedList file"* — and it opens with your cursor in it.
4. When it proposes a change, use **Replace lines** or **Insert at Cursor** on the code card in the conversation.

Press the key while EchoCode is talking to interrupt it with a new question.

VS Code keeps a panel muted until you click inside it, so after a restart the panel may say it can't be heard yet. Click anywhere in it once and the voice works for the rest of the session.

Click **⚙** in the panel to see your plan and minutes left this month, upgrade to Pro, change the hotkey (it opens Keyboard Shortcuts at **EchoCode: Talk**), or change the panel background.

## What EchoCode can answer

- **About the code in front of you:** "why does this crash?", "walk me through this method".
- **About the rest of the project:** "where do I change the font?", "how does clicking a task mark it done?" EchoCode reads the other source files in the open folder, so it can point at a file you do not have open.
- **To take you to a file:** "open the LinkedList file", "show me globals.css", "take me to the duplicate finder". The file opens with your cursor in it. Names come through speech imprecisely, so one a letter or two off still finds the file; a name that could mean two files opens neither, and EchoCode asks which you meant.

## Commands

| Command | What it does |
|---|---|
| EchoCode: Talk / Send Question | Start a question, or send it (also the hotkey) |
| EchoCode: Stop | Stop listening or talking |
| EchoCode: Test Microphone | Record 3 seconds and report whether audio came through |
| EchoCode: Choose Microphone | Pick which input device EchoCode records from |

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `echocode.backendUrl` | `https://echo-code-hackathon.vercel.app` | The EchoCode backend that issues session tokens |
| `echocode.micDeviceIndex` | `-1` | Microphone to use; `-1` is the system default |
| `echocode.maxContextLines` | `400` | Lines of the open file sent with each question. The other project files go alongside it, within a 45 KB budget |
| `echocode.autoStopSilenceMs` | `2000` | Send automatically after this much silence; `0` turns it off |
| `echocode.panelBackground` | `midnight` | Panel background: `midnight`, `graphite`, `purple`, `ocean` or `vscode` (follow your theme) |

## Privacy

Nothing is recorded until you press the hotkey. Your question audio goes to AssemblyAI to be answered, along with the file you're looking at and the other source files in the open folder, so EchoCode can answer about code you don't have open. Folders like `node_modules`, `.git` and build output are never sent. No API key is stored in the extension: the backend hands out short-lived, single-use session tokens.

## Plans

Free includes 10 minutes of voice a month, about 13 questions, and is available today. Pro ($20/month, or $192/year) adds 60 questions a month. Cohort ($25 per learner, once, for a 12-week cohort) and Campus ($36 per seat, per academic year) pool minutes across a bootcamp intake or a university department. Pro, Cohort and Campus are not on sale yet.

Minutes count the audio of your questions and EchoCode's answers; question counts are estimates. The panel's ⚙ Settings shows how many are left.

Source and full documentation: https://github.com/TeyYongZhun/EchoCode-Hackathon
