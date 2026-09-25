import { gatewayJson } from './assemblyai';

/**
 * Turns a finished spoken answer into the exact code shown on the developer's
 * screen. This runs as a separate, fast AssemblyAI LLM Gateway call after the
 * voice answer, so it never slows the voice down.
 */

/**
 * `qwen3.5-4b-32k-fast` is available on every AssemblyAI account; stronger
 * models (Claude, GPT) need account access. Set ASSEMBLYAI_SUGGEST_MODEL to use one.
 */
export const SUGGEST_MODEL = process.env.ASSEMBLYAI_SUGGEST_MODEL ?? 'qwen3.5-4b-32k-fast';

/** Qwen models on the gateway don't accept response_format, so they're asked for JSON in the prompt. */
const STRUCTURED_OUTPUT = !SUGGEST_MODEL.startsWith('qwen');

/** Strict JSON schema for the gateway: every field required, nothing extra. */
const CODE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    hasCode: { type: 'boolean' },
    title: { type: 'string' },
    code: { type: 'string' },
    replaceSelection: { type: 'boolean' },
  },
  required: ['hasCode', 'title', 'code', 'replaceSelection'],
  additionalProperties: false,
};

/**
 * Only answers that propose a change get a code card. Checking the spoken
 * answer first skips a model call for pure explanations, and stops a small
 * model from inventing a fix nobody talked about.
 */
const PROPOSES_CHANGE =
  /\b(swap|replace|change|switch|instead|should|fix|rewrite|refactor|rename|you can|you could|try|add an?|add the|remove|delete|move|wrap|initiali[sz]e|update)\b/i;

const MAX_FIELD_CHARS = 60_000;

export interface SuggestRequest {
  /** The [EDITOR CONTEXT] block the voice model saw. */
  context: string;
  /** Transcript of the developer's spoken question. */
  question: string;
  /** Transcript of EchoCode's spoken answer. */
  answer: string;
  languageId: string;
  /** The selected code when the question was asked, if any. */
  selectedCode?: string;
}

export interface Suggestion {
  title: string;
  language: string;
  code: string;
  replaceSelection: boolean;
}

interface CodeCardJson {
  hasCode?: boolean;
  title?: string;
  code?: string;
  replaceSelection?: boolean;
}

export function parseSuggestRequest(body: unknown): SuggestRequest | undefined {
  const b = body as Partial<Record<keyof SuggestRequest, unknown>> | undefined;
  const text = (value: unknown) => typeof value === 'string' && value.length <= MAX_FIELD_CHARS;
  if (!text(b?.context) || !text(b?.question) || !text(b?.answer) || !text(b?.languageId)) return undefined;
  if (b?.selectedCode !== undefined && !text(b.selectedCode)) return undefined;
  return b as SuggestRequest;
}

/** The imports already in the file, read from the numbered lines of the editor context. */
function importsInContext(context: string): string[] {
  return [...context.matchAll(/\|\s*import\s+(?:static\s+)?([\w.*]+)\s*;/g)].map((m) => m[1]);
}

/** Classes, interfaces and enums the file declares itself, which must never be renamed. */
function typesDeclaredInContext(context: string): Set<string> {
  return new Set([...context.matchAll(/\b(?:class|interface|enum|record)\s+(\w+)/g)].map((m) => m[1]));
}

/** java.util types a suggestion may use without importing; they get their full name if the file lacks the import. */
const COMMON_JAVA_UTIL_TYPES = [
  'Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'Map', 'HashMap', 'LinkedHashMap', 'TreeMap',
  'Queue', 'Deque', 'ArrayDeque', 'PriorityQueue', 'Iterator', 'Collections', 'Arrays', 'Objects', 'Optional',
  'List', 'ArrayList', 'LinkedList', 'NoSuchElementException', 'Scanner', 'Random',
];

/**
 * Java only: import lines can't go where a replacement is inserted (inside a
 * class), and small models sometimes add them anyway. Remove them and write
 * each newly imported type with its full name instead, so the code compiles.
 */
function inlineJavaImports(code: string, fileImports: string[], declaredTypes: Set<string>): string {
  const added: string[] = [];
  const kept = code.split('\n').filter((line) => {
    const match = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;\s*$/.exec(line);
    if (match) added.push(match[1]);
    return !match && !/^\s*package\s+[\w.]+\s*;\s*$/.test(line);
  });
  // Small models also use common collection types without importing them at all.
  const wildcard = fileImports.includes('java.util.*');
  for (const name of COMMON_JAVA_UTIL_TYPES) {
    const fullName = `java.util.${name}`;
    if (!wildcard && !fileImports.includes(fullName) && !added.includes(fullName)) added.push(fullName);
  }
  const toQualify = added.filter((fullName) => {
    const simpleName = fullName.split('.').pop();
    return simpleName && !fileImports.includes(fullName) && !declaredTypes.has(simpleName);
  });
  // Strings, chars and comments sit at odd indexes and are left as they are.
  const parts = kept.join('\n').replace(/^\s*\n/, '').split(JAVA_LITERALS_AND_COMMENTS);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      for (const fullName of toQualify) {
        // Replace bare uses only, not ones that are already qualified.
        part = part.replace(new RegExp(`(?<![\\w.])${fullName.split('.').pop()}\\b`, 'g'), fullName);
      }
      return part;
    })
    .join('');
}

const JAVA_LITERALS_AND_COMMENTS = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/;

function buildPrompt(req: SuggestRequest): string {
  const imports = importsInContext(req.context);
  const importRule =
    req.languageId === 'java'
      ? ` The file only imports ${imports.length ? imports.join(', ') : 'nothing'}, so write every other type with its full package name, such as java.util.HashSet, or the code won't compile.`
      : '';
  const task = req.selectedCode
    ? `The developer selected these lines (marked with > in the context):
\`\`\`${req.languageId}
${req.selectedCode}
\`\`\`

Task: apply the change the answer describes to the selected lines and return the complete new version of those lines, with replaceSelection true. The new code must contain that change, so it must differ from the selected lines. Change nothing else and keep the indentation.`
    : `The developer had nothing selected.

Task: write the code the answer describes as a self-contained snippet to insert at the cursor, with replaceSelection false.`;
  const format = STRUCTURED_OUTPUT
    ? ''
    : '\n\nReply with only a JSON object and no other text: {"hasCode": boolean, "title": string, "code": string, "replaceSelection": boolean}';
  // The answer comes last: small models follow what they read most recently.
  return `You write the exact code that a voice coding assistant just described, so it can be shown on screen with an Insert button.

${req.context}

${task}

Rules:
- The code must compile. Don't include import or package lines.${importRule}
- Write only the change the answer describes: no other improvements and no comments explaining it.
- title: a short label of at most six words, such as "Use HashSets for lookups".
- If the answer only explains, asks a question or proposes no concrete change, set hasCode to false, title and code to empty strings and replaceSelection to false. Otherwise set hasCode to true.

The developer asked (transcribed speech): "${req.question}"
The assistant answered out loud: "${req.answer}"${format}`;
}

export async function generateSuggestion(apiKey: string, req: SuggestRequest): Promise<Suggestion | null> {
  if (!PROPOSES_CHANGE.test(req.answer)) return null;
  const parsed = await gatewayJson<CodeCardJson>(
    apiKey,
    SUGGEST_MODEL,
    buildPrompt(req),
    STRUCTURED_OUTPUT ? { name: 'code_card', schema: CODE_CARD_SCHEMA } : undefined,
  );
  let code = parsed.code?.replace(/^\n+|\s+$/g, '');
  if (!parsed.hasCode || !code) return null;
  // Small models sometimes echo the selection unchanged; that's not a suggestion.
  const squash = (text: string) => text.replace(/\s+/g, '');
  if (req.selectedCode && squash(code) === squash(req.selectedCode)) return null;
  if (req.languageId === 'java') {
    code = inlineJavaImports(code, importsInContext(req.context), typesDeclaredInContext(req.context));
  }
  return {
    title: parsed.title?.trim() || 'Suggested code',
    language: req.languageId,
    code,
    // Only a real selection can be replaced.
    replaceSelection: Boolean(parsed.replaceSelection && req.selectedCode),
  };
}
