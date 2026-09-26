# Changelog

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
