# Changelog

## 0.1.4

- **Ask EchoCode to open a file and it opens it.** "Open the globals.css file", "take me to LinkedList.java", "show me the HTML file": the file comes up in the editor with the cursor in it. Before, a file only opened as a side effect of EchoCode naming a line *inside* it, so asking for the file itself did nothing and EchoCode said it couldn't. Which file you meant is now worked out from what you said rather than from the answer, so it opens while EchoCode is still thinking, and it opens even when the answer never names it.
- **Names heard slightly wrong still find the file.** Speech loses a letter more often than not: "global.css" now opens `globals.css`, and "the session controller file" opens `SessionController.ts`. A name that could mean two files opens neither, and EchoCode asks which one — moving the cursor into the wrong file is worse than not moving it at all.
- **A file can be asked for by type** when the project holds only one of them: "open the HTML file".

## 0.1.3

- **EchoCode reads your whole project, not just the open file.** Ask "where do I change the font?" while looking at `index.html` and it finds the rule in `style.css`, opens that file and highlights the line. Tested live on a small web app: 9 out of 9 questions opened the right file at the right line. Small projects are sent whole; larger ones send the files your open file references first and name the rest. `node_modules`, `.git` and build output are never sent.
- **EchoCode starts asleep and wakes with a hello.** Nothing connects until you first press the hotkey; that press opens the session and EchoCode greets you straight away, inviting you to ask about anything in the project rather than only the file you have open. It shows "Waking up…" until the greeting speaks, never "Thinking…" — there was no question to think about. Because the connection happens during the greeting, the first real question starts answering in about 1.1 seconds instead of 2.2. If the greeting doesn't arrive, EchoCode goes quietly to Ready instead of reporting a failed answer.
- **Plainer answers.** The voice now answers in two to four short sentences, explains a term the first time it uses one ("a null pointer exception, which is when the code tries to follow a link that points to nothing"), and stops asking a check-up question at the end of every answer. Asking it to "just fix it" now gets the fix instead of an offer to explain. Measured against the old prompt on the same spoken questions: about a third fewer words, and no filler questions in six runs.
- **A calmer robot.** The bubble by the robot now shows only what EchoCode is doing (Asleep, Listening, Thinking, Speaking) instead of repeating the answer as subtitles. The words are in the conversation just above it, and a half-finished sentence no longer lingers there after an answer ends.
- **A "Get started" card in the panel.** An empty panel used to be a robot and nothing else. It now opens with four short steps — allow the microphone, hold the hotkey and ask, ⚙ Settings, ■ Stop — each carrying the icon of the button it describes, and it ends by naming the default hotkey. It isn't dismissed: your first question pushes it up out of the way, and scrolling to the top of the conversation brings it back.
- **You are told straight away when the voice can't be heard.** VS Code panels stay muted until you click inside one, and waking EchoCode is a keypress in the editor, so the greeting used to play silently. The panel now checks the moment it loads and, if it is muted, says so in the robot's own bubble and in a bar above it: click anywhere in the panel once and the voice works for the rest of the session.
- **A microphone notice on first install**, with a button that runs the microphone test.

## 0.1.2

- **Settings panel.** A ⚙ button in the EchoCode panel shows your plan and minutes left this month, opens the pricing page to upgrade, opens Keyboard Shortcuts to change the hotkey, and switches the panel background (Midnight, Graphite, Purple, Ocean, or your VS Code theme). New setting: `echocode.panelBackground`.
- **Conversation always visible.** The ^ button that hid the conversation is gone.
- **The conversation follows the latest message.** It used to stop following as a new answer began, leaving the answer out of view. It now always follows unless you scroll up to read (a **↓ Latest** button then brings you back), and a new question always jumps to the latest.
- **Stop says what it did.** After ■ Stop, the robot's bubble says whether it stopped listening or stopped an answer, instead of still showing "Listening…".
- **Fixed:** the start of a quiet question could be cut off, so "Hello, hello" was heard as "I know". All audio from the moment you start speaking is now sent.
- **Fixed:** after clicking ■ Stop or ⚙ in the panel, every press of the hotkey clicked that button again, so questions stopped as soon as they started.
- **Fixed:** with no code selected, a card holding a whole method was inserted at the cursor, inside the old method. It now replaces the method it rewrites, and the button says which lines.
- **Fixed:** interrupting EchoCode mid-answer (or pressing Stop) and asking something short, like "Hello?", could leave it stuck on "Thinking…" and end with "EchoCode didn't answer that time". The voice agent kept playing the old answer on its side and threw the question away. EchoCode now starts a fresh session for the question, carrying the conversation over.
- **Remembers the conversation after a pause.** A new session (after a few idle minutes) gets the last few questions and answers, so follow-ups still make sense.
- **Faster answers.** Audio recorded while connecting or before speech is confirmed now catches up at twice real time, so answers start sooner: about 1.5 s after release instead of 2.2 s, and 2.2 s instead of 3.0 s after a quiet start.
- **Fixed:** EchoCode asked for an answer while the voice agent was still working through the question, which gave an empty answer or none ("EchoCode didn't answer that time"), often on the first question after connecting. It now waits until the question has been heard.
- **Fixed:** an answer that played without its text showed an empty line in the conversation.
- **Fixed:** the voice agent sometimes ends an early answer empty and starts the real one, and EchoCode took the empty one as the answer and went silently back to Ready. It now waits for the real answer, asks for one only if none starts, and says so if still nothing comes.
- **Fixed:** an answer that finished right as the hotkey was released could be followed by a second, unwanted answer.
- **Fixed:** a question transcribed in several parts showed without spaces between them.
- **Plans:** Free has 15 voice minutes a month and Pro has 150. The panel shows Pro minutes left instead of "unlimited".
