# EchoCode

**The voice-first AI pair programmer.** Highlight code, hold a key and ask out loud. EchoCode reads the file you're looking at and talks you through it, highlighting the lines it mentions and handing you ready-to-insert code when it suggests a fix.

Powered by AssemblyAI: the Voice Agent API for the conversation and the LLM Gateway for code cards.

## How to use it

1. Select the code you're curious about.
2. **Hold `Ctrl+Alt+Space`** (`Ctrl+Shift+Space` on macOS), ask your question and let go. You can also tap the key or click **EchoCode** in the status bar, speak, and tap again.
3. Listen. The answer plays in the **EchoCode** tab of the right panel, with live subtitles, and the lines it mentions light up in your editor.
4. When it proposes a change, use **Replace lines** or **Insert at Cursor** on the code card in the conversation.

Press the key while EchoCode is talking to interrupt it with a new question.

Click **⚙** in the panel to see your plan and minutes left this month, upgrade to Pro, change the hotkey (it opens Keyboard Shortcuts at **EchoCode: Talk**), or change the panel background.

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
| `echocode.maxContextLines` | `400` | Lines of the current file sent with each question |
| `echocode.autoStopSilenceMs` | `2000` | Send automatically after this much silence; `0` turns it off |
| `echocode.panelBackground` | `midnight` | Panel background: `midnight`, `graphite`, `purple`, `ocean` or `vscode` (follow your theme) |

## Privacy

Nothing is recorded until you press the hotkey. Your question audio and the surrounding code go to AssemblyAI to be answered. No API key is stored in the extension: the backend hands out short-lived, single-use session tokens.

## Free and Pro

Free includes 15 minutes of voice a month, about 20 questions. Pro ($15/month, or $144/year) includes 150 minutes, about 200 questions. The panel's ⚙ Settings shows how many minutes are left.

Source and full documentation: https://github.com/TeyYongZhun/EchoCode_Hackathon
