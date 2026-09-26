# Changelog

## 0.1.2

- **Settings panel.** A ⚙ button in the EchoCode panel shows your plan and minutes left this month, opens the pricing page to upgrade, opens Keyboard Shortcuts to change the hotkey, and switches the panel background (Midnight, Graphite, Purple, Ocean, or your VS Code theme). New setting: `echocode.panelBackground`.
- **Conversation always visible.** The ^ button that hid the conversation is gone.
- **Stop says what it did.** After ■ Stop, the robot's bubble says whether it stopped listening or stopped an answer, instead of still showing "Listening…".
- **Fixed:** the start of a quiet question could be cut off, so "Hello, hello" was heard as "I know". All audio from the moment you start speaking is now sent.
- **Fixed:** after clicking ■ Stop or ⚙ in the panel, every press of the hotkey clicked that button again, so questions stopped as soon as they started.
- **Fixed:** with no code selected, a card holding a whole method was inserted at the cursor, inside the old method. It now replaces the method it rewrites, and the button says which lines.
- **Fixed:** after interrupting EchoCode with a new question, the voice agent sometimes sent an empty answer, and EchoCode went silently back to Ready. It now asks for the answer again, and says so if none comes.
- **Fixed:** a question transcribed in several parts showed without spaces between them.
- **Plans:** Free has 15 voice minutes a month and Pro has 150. The panel shows Pro minutes left instead of "unlimited".
