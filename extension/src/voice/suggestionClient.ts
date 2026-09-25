export interface SuggestRequest {
  installId: string;
  context: string;
  question: string;
  answer: string;
  languageId: string;
  selectedCode?: string;
}

export interface Suggestion {
  title: string;
  language: string;
  code: string;
  replaceSelection: boolean;
}

const REQUEST_TIMEOUT_MS = 20_000;

function isSuggestion(value: unknown): value is Suggestion {
  const v = value as Partial<Suggestion> | undefined;
  return typeof v?.title === 'string' && typeof v.code === 'string' && typeof v.replaceSelection === 'boolean';
}

/** Asks the backend for the code behind a finished answer. Resolves to null when there is none. */
export async function fetchSuggestion(backendUrl: string, request: SuggestRequest): Promise<Suggestion | null> {
  const response = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => undefined)) as { suggestion?: unknown; error?: unknown } | undefined;
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
  }
  return isSuggestion(body?.suggestion) ? body.suggestion : null;
}
