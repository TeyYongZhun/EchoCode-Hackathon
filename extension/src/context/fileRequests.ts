import { findFileMentions } from './lineReferences';

/**
 * "Open the CSS file", "take me to LinkedList.java": a question that asks to be
 * shown a file rather than told about the code in it.
 *
 * The file is worked out from the developer's own words, not from the answer,
 * so being taken somewhere doesn't depend on the agent saying the name back
 * exactly — and it lands while the answer is still being thought about.
 *
 * Speech is imprecise about file names ("global dot css" for globals.css), so a
 * name is matched exactly first, then within a slip or two of its letters, and
 * finally by type alone when the project has only one file of that kind. Each
 * step insists on a single winner: opening the wrong file is worse than opening
 * none, because it moves the cursor out from under them.
 */

/** Asking to be taken somewhere, rather than asking about code. */
const OPEN_REQUEST =
  /\b(open|opens|opened|opening|show|shows|bring up|pull up|go to|goto|jump to|take me|navigate|switch to|display|where is|where's)\b/i;

/** Letters and digits only: spoken names lose their punctuation ("style dot c s s"). */
const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Words said between the parts of a name, which carry none of its own letters. */
const FILLER = new Set([
  'dot', 'slash', 'the', 'a', 'an', 'my', 'that', 'this', 'file', 'in', 'of', 'inside',
  'within', 'please', 'just', 'for', 'me', 'up', 'yeah', 'ok', 'okay', 'can', 'you',
]);
/** Longest run of words that can spell one name, as in "src slash main dot t s". */
const MAX_NAME_WORDS = 12;
/** Most letters a spoken name may be out by, however long it is. */
const MAX_SLIP = 2;
/** Below this a name is too short to correct: "app" and "api" are one slip apart. */
const MIN_FUZZY_LENGTH = 5;
/** What people call a file type out loud, where that isn't the extension itself. */
const SPOKEN_TYPES: Record<string, string> = {
  python: 'py', javascript: 'js', typescript: 'ts', markdown: 'md', stylesheet: 'css',
  styles: 'css', config: 'json', yaml: 'yml',
};

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
}

/** Whether a question is asking to be taken to a file at all. */
export function isFileOpenRequest(question: string): boolean {
  return OPEN_REQUEST.test(question);
}

/** The names a path answers to: its full path, its file name, and that name without the extension. */
function namesOf(path: string): string[] {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const names = [letters(path), letters(base)];
  if (dot > 0) names.push(letters(base.slice(0, dot)));
  return names.filter((name) => name.length >= MIN_FUZZY_LENGTH);
}

/**
 * Levenshtein distance, or undefined once it is certainly over `limit`. The
 * early exit is what keeps this cheap against every name in the project.
 */
function distance(a: string, b: string, limit: number): number | undefined {
  if (Math.abs(a.length - b.length) > limit) return undefined;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, substitution);
      best = Math.min(best, row[j]);
    }
    if (best > limit) return undefined;
    previous = row;
  }
  return previous[b.length] <= limit ? previous[b.length] : undefined;
}

/** How far a name of this length may be off before it stops being that name. */
function slipAllowed(name: string): number {
  return Math.min(MAX_SLIP, Math.floor(name.length / 4));
}

/** Every run of words in the question that could be spelling a name. */
function spelledRuns(spoken: string[]): string[] {
  const runs: string[] = [];
  for (let i = 0; i < spoken.length; i++) {
    let spelled = '';
    for (let j = i; j < Math.min(spoken.length, i + MAX_NAME_WORDS); j++) {
      if (FILLER.has(spoken[j])) continue;
      spelled += spoken[j];
      if (spelled.length >= MIN_FUZZY_LENGTH) runs.push(spelled);
    }
  }
  return runs;
}

/** The one file whose name the question came closest to, if exactly one did. */
function nearestName(question: string, knownPaths: string[]): string | undefined {
  let closest = Infinity;
  let winners = new Set<string>();
  for (const run of spelledRuns(words(question))) {
    for (const path of knownPaths) {
      for (const name of namesOf(path)) {
        const slip = slipAllowed(name);
        if (slip === 0) continue;
        const off = distance(run, name, Math.min(slip, closest));
        if (off === undefined || off > closest) continue;
        if (off < closest) {
          closest = off;
          winners = new Set();
        }
        winners.add(path);
      }
    }
  }
  return winners.size === 1 ? [...winners][0] : undefined;
}

/** "The CSS file", when the project holds exactly one of them. */
function onlyFileOfItsType(question: string, knownPaths: string[]): string | undefined {
  const byType = new Map<string, string[]>();
  for (const path of knownPaths) {
    const dot = path.lastIndexOf('.');
    if (dot <= path.lastIndexOf('/')) continue;
    const type = path.slice(dot + 1).toLowerCase();
    byType.set(type, [...(byType.get(type) ?? []), path]);
  }
  const spoken = words(question);
  for (let i = 0; i < spoken.length; i++) {
    let spelled = '';
    for (let j = i; j < Math.min(spoken.length, i + 4); j++) {
      if (FILLER.has(spoken[j])) continue;
      spelled += spoken[j];
      // "the go file", not the "go" in "go to line ten": the type has to be said as one.
      const next = spoken[j + 1];
      if (next !== 'file' && next !== 'files' && j !== spoken.length - 1) continue;
      const matches = byType.get(SPOKEN_TYPES[spelled] ?? spelled);
      if (!matches) continue;
      // Several of that type: they have to say which one.
      return matches.length === 1 ? matches[0] : undefined;
    }
  }
  return undefined;
}

/**
 * The project file a question asks to be taken to, or undefined when it isn't
 * asking for one or doesn't say clearly enough which.
 */
export function findRequestedFile(question: string, knownPaths: string[]): string | undefined {
  if (knownPaths.length === 0 || !isFileOpenRequest(question)) return undefined;
  // A name said exactly, matched the same way file names in an answer are.
  const said = findFileMentions(question, knownPaths);
  if (said.length > 0) return said[said.length - 1].path;
  return nearestName(question, knownPaths) ?? onlyFileOfItsType(question, knownPaths);
}
