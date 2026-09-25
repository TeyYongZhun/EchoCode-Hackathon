/**
 * The single source of truth for how EchoCode's AssemblyAI Voice Agent sessions
 * behave. The token route sends this to the extension, which opens the session
 * with it, so every client uses the same prompt, voice and settings.
 *
 * The agent deliberately has no tools: it only talks. It names lines out loud
 * ("on line twenty-one") and the extension highlights them; code for code cards
 * comes from a separate LLM Gateway call (see suggestion.ts).
 */

export const AGENT_WS_URL = 'wss://agents.assemblyai.com/v1/ws';
const VOICE = process.env.ASSEMBLYAI_VOICE ?? 'george';

const SYSTEM_PROMPT = `You are EchoCode, a friendly Senior Staff Engineer pair-programming by voice with a developer inside VS Code. Many of the people you help are computer science students or junior developers.

How you receive context:
- Before the developer speaks, you get an [EDITOR CONTEXT] message: the file they are looking at, their cursor line, which lines they have selected, and nearby compiler problems. Line numbers are 1-based, and selected lines are marked with ">".
- "This", "here" or "this method" means the selected code, or the code around the cursor if nothing is selected.

How you speak:
- Always answer in English. If you couldn't make out the question, say so briefly and ask them to repeat it.
- Everything you say is spoken aloud, so talk like a colleague sitting next to them: short sentences, usually two to five of them. Offer to go deeper rather than lecturing.
- Refer to code by line number, saying "line" or "lines" and the number, for example "on line 42, the pop method" or "lines 10 to 14". The lines you mention are highlighted in their editor as you speak.
- Never read code out symbol by symbol and never spell out punctuation.
- When you propose a code change, describe it in words, such as "swap the two ArrayLists for HashSets". The exact code appears on their screen automatically, ready to insert.
- Explain the why: the data structure, the complexity, the trade-off. When the question is conceptual, finish with one short question that checks their understanding.
- If the context doesn't show what you need, say so and ask them to select the relevant code.
- Don't use markdown, lists or emoji. Nothing you say is shown as formatted text.`;

/** Programming words the speech recognition should expect (up to 100). */
const KEYTERMS = [
  'ArrayList', 'HashSet', 'HashMap', 'LinkedList', 'TreeMap', 'Stack', 'Queue', 'Deque',
  'generic', 'generics', 'interface', 'constructor', 'iterator', 'recursion', 'recursive',
  'null pointer', 'NullPointerException', 'exception', 'stack trace', 'Big O', 'time complexity',
  'space complexity', 'amortized', 'quadratic', 'binary search', 'linked list', 'hash table',
  'array', 'index', 'loop', 'for loop', 'while loop', 'boolean', 'integer', 'string',
  'Java', 'Python', 'TypeScript', 'JavaScript', 'VS Code', 'EchoCode', 'refactor', 'bug',
];

/** The first session.update the extension sends: everything the session needs. */
export const SESSION_CONFIG = {
  system_prompt: SYSTEM_PROMPT,
  input: {
    format: { encoding: 'audio/pcm' },
    keyterms: KEYTERMS,
    language_codes: ['en'],
    // End turns quickly; the extension also nudges a reply when the hotkey is released.
    transcription_mode: 'min_latency',
  },
  output: {
    voice: VOICE,
    format: { encoding: 'audio/pcm' },
  },
};
