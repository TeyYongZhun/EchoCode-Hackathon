import { gatewayJson } from './assemblyai';

/**
 * Turns a finished spoken answer into the exact code shown on the developer's
 * screen. This runs as a separate, fast AssemblyAI LLM Gateway call after the
 * voice answer, so it never slows the voice down.
 */

export const SUGGEST_MODEL = process.env.ASSEMBLYAI_SUGGEST_MODEL ?? 'claude-haiku-4-5-20251001';

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

export function parseSuggestRequest(body: unknown): SuggestRequest | undefined {
  const b = body as Partial<Record<keyof SuggestRequest, unknown>> | undefined;
  const text = (value: unknown) => typeof value === 'string' && value.length <= MAX_FIELD_CHARS;
  if (!text(b?.context) || !text(b?.question) || !text(b?.answer) || !text(b?.languageId)) return undefined;
  if (b?.selectedCode !== undefined && !text(b.selectedCode)) return undefined;
  return b as SuggestRequest;
}

function buildPrompt(req: SuggestRequest): string {
  const selection = req.selectedCode
    ? `The developer had these lines selected (marked with > in the context):\n\`\`\`${req.languageId}\n${req.selectedCode}\n\`\`\``
    : 'The developer had nothing selected.';
  return `You write the exact code that a voice coding assistant just described, so it can be shown on screen with an Insert button.

The developer asked (transcribed speech): "${req.question}"
The assistant answered out loud: "${req.answer}"

${req.context}

${selection}

Rules:
- If the answer proposes a concrete code change or new code, set hasCode to true and write that code. If it only explains, asks a question or gives no concrete change, set hasCode to false.
- Write only the change the answer describes. Don't add other improvements, comments about the change, or explanations.
- If the code replaces the selected lines, set replaceSelection to true and return a complete drop-in replacement for exactly those lines, keeping their indentation. Don't include imports, package lines or code outside the selection; if a new type is needed, use its fully qualified name (for example java.util.HashSet).
- Otherwise set replaceSelection to false and return a self-contained snippet to insert at the cursor.
- title: a short label of at most six words, such as "Use HashSets for lookups".
- When hasCode is false, set title and code to empty strings and replaceSelection to false.`;
}

export async function generateSuggestion(apiKey: string, req: SuggestRequest): Promise<Suggestion | null> {
  const parsed = await gatewayJson<{ hasCode?: boolean; title?: string; code?: string; replaceSelection?: boolean }>(
    apiKey,
    SUGGEST_MODEL,
    buildPrompt(req),
    'code_card',
    CODE_CARD_SCHEMA,
  );
  const code = parsed.code?.replace(/^\n+|\s+$/g, '');
  if (!parsed.hasCode || !code) return null;
  return {
    title: parsed.title?.trim() || 'Suggested code',
    language: req.languageId,
    code,
    // Only a real selection can be replaced.
    replaceSelection: Boolean(parsed.replaceSelection && req.selectedCode),
  };
}
