/** A line range mentioned in speech. Lines are 1-based and inclusive. */
export interface LineReference {
  start: number;
  end: number;
  /** Offset in the text just past the reference. */
  endOffset: number;
  /** The project file named near the reference; absent means the file they're looking at. */
  file?: string;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
/** Words that join the numbers of one reference: "lines 10 to 14", "lines ten, thirteen and fourteen". */
const JOINERS = new Set(['to', 'through', 'thru', 'until', 'and']);
/** A list spanning more lines than this is treated as separate mentions; only its first line counts. */
const MAX_SPAN = 40;

interface Token {
  word: string;
  start: number;
  end: number;
}

interface ParsedNumber {
  value: number;
  next: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.toLowerCase().matchAll(/[a-z]+|\d+/g)) {
    tokens.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/** Parses "42", "twenty-one", "one hundred and five" and similar, starting at token i. */
function parseNumber(tokens: Token[], i: number): ParsedNumber | undefined {
  const word = tokens[i]?.word;
  if (word === undefined) return undefined;
  if (/^\d+$/.test(word)) return { value: Number(word), next: i + 1 };

  let value = 0;
  let next = i;
  if (ONES[word] !== undefined && ONES[word] < 10 && tokens[i + 1]?.word === 'hundred') {
    value = ONES[word] * 100;
    next = i + 2;
    if (tokens[next]?.word === 'and' && isNumberWord(tokens[next + 1]?.word)) next++;
    const rest = parseBelowHundred(tokens, next);
    return rest ? { value: value + rest.value, next: rest.next } : { value, next };
  }
  return parseBelowHundred(tokens, i);
}

function parseBelowHundred(tokens: Token[], i: number): ParsedNumber | undefined {
  const word = tokens[i]?.word;
  if (word === undefined) return undefined;
  if (TENS[word] !== undefined) {
    const unit = ONES[tokens[i + 1]?.word ?? ''];
    return unit !== undefined && unit > 0 && unit < 10
      ? { value: TENS[word] + unit, next: i + 2 }
      : { value: TENS[word], next: i + 1 };
  }
  if (ONES[word] !== undefined) return { value: ONES[word], next: i + 1 };
  return undefined;
}

function isNumberWord(word: string | undefined): boolean {
  return word !== undefined && (ONES[word] !== undefined || TENS[word] !== undefined);
}

/**
 * Finds line numbers mentioned in spoken text, such as "on line twenty-one",
 * "lines 10 to 14" or "lines ten, thirteen, and fourteen" (read as 10–14).
 */
/**
 * Spoken file names lose their punctuation: "style.css" is heard as "style dot
 * c s s", "style css" or "style.css" depending on the sentence. Comparing
 * letters alone matches all three, and the candidates are only the project's
 * own files, so a handful of known names is all this has to tell apart.
 */
const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Words said between the parts of a file name, which carry no letters of their own. */
const FILLER = new Set(['dot', 'slash', 'the', 'file', 'in', 'of', 'inside', 'within']);
/** Longest run of tokens that can spell one file name, as in "src slash main dot t s". */
const MAX_NAME_TOKENS = 12;
/** A file name this far from the line number in the text is about something else. */
const MAX_NAME_DISTANCE = 90;

/**
 * Every way the agent might say each path, mapped to the path. Names that could
 * mean more than one file are dropped: highlighting the wrong file is worse
 * than highlighting none.
 */
function nameLookup(paths: string[]): Map<string, string> {
  const counts = new Map<string, Set<string>>();
  const add = (key: string, path: string) => {
    if (key.length < 3) return;
    const paths = counts.get(key) ?? new Set<string>();
    paths.add(path);
    counts.set(key, paths);
  };
  for (const path of paths) {
    const base = path.slice(path.lastIndexOf('/') + 1);
    add(letters(path), path);
    add(letters(base), path);
    const dot = base.lastIndexOf('.');
    if (dot > 0) add(letters(base.slice(0, dot)), path);
  }
  const lookup = new Map<string, string>();
  for (const [key, matches] of counts) if (matches.size === 1) lookup.set(key, [...matches][0]);
  return lookup;
}

/** Where each file name was said, by its position in the text. */
function findFileMentions(tokens: Token[], lookup: Map<string, string>): { path: string; at: number }[] {
  const mentions: { path: string; at: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let spelled = '';
    let best: { path: string; at: number; next: number } | undefined;
    for (let j = i; j < Math.min(tokens.length, i + MAX_NAME_TOKENS); j++) {
      if (!FILLER.has(tokens[j].word)) spelled += tokens[j].word;
      const path = lookup.get(spelled);
      // Keep going: "main" may be a file, but "main dot t s" is the better match.
      if (path) best = { path, at: tokens[i].start, next: j };
    }
    if (best) {
      mentions.push({ path: best.path, at: best.at });
      i = best.next;
    }
  }
  return mentions;
}

export function findLineReferences(text: string, knownPaths: string[] = []): LineReference[] {
  const tokens = tokenize(text);
  const mentions = knownPaths.length > 0 ? findFileMentions(tokens, nameLookup(knownPaths)) : [];
  /** The file said nearest this point, so "in style.css, lines 4 and 9" marks both. */
  const fileNear = (at: number): string | undefined => {
    let best: { path: string; distance: number } | undefined;
    for (const mention of mentions) {
      const distance = Math.abs(mention.at - at);
      if (distance <= MAX_NAME_DISTANCE && (!best || distance < best.distance)) best = { path: mention.path, distance };
    }
    return best?.path;
  };
  const references: LineReference[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].word !== 'line' && tokens[i].word !== 'lines') continue;
    const first = parseNumber(tokens, i + 1);
    if (!first || first.value < 1) continue;

    const numbers = [first.value];
    let next = first.next;
    while (next < tokens.length) {
      // "10-14" and "ten, thirteen" put punctuation between the numbers; "10 to 14" a word.
      const between = text.slice(tokens[next - 1].end, tokens[next].start);
      const following = JOINERS.has(tokens[next].word)
        ? parseNumber(tokens, next + 1)
        : /[,\-–]/.test(between)
          ? parseNumber(tokens, next)
          : undefined;
      // Line lists go upwards; "line twelve, two things happen" is not a range.
      if (!following || following.value <= numbers[numbers.length - 1]) break;
      numbers.push(following.value);
      next = following.next;
    }

    const start = Math.min(...numbers);
    const end = Math.max(...numbers);
    const endOffset = tokens[next - 1].end;
    const file = fileNear(tokens[i].start);
    const range = end - start > MAX_SPAN ? { start: first.value, end: first.value } : { start, end };
    references.push(file ? { ...range, endOffset, file } : { ...range, endOffset });
    i = next - 1;
  }
  return references;
}
