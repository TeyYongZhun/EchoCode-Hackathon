/** Thin wrappers around the two AssemblyAI APIs the backend calls. */

const TOKEN_URL = 'https://agents.assemblyai.com/v1/token';
const GATEWAY_URL = 'https://llm-gateway.assemblyai.com/v1/chat/completions';

export function assemblyAiKey(): string | undefined {
  return process.env.ASSEMBLYAI_API_KEY;
}

/**
 * Mints a single-use Voice Agent token. `expiresInSeconds` is how long the
 * client has to open the WebSocket; `maxSessionSeconds` caps the session.
 */
export async function createAgentToken(
  apiKey: string,
  expiresInSeconds: number,
  maxSessionSeconds: number,
): Promise<string> {
  const url = new URL(TOKEN_URL);
  url.searchParams.set('expires_in_seconds', String(expiresInSeconds));
  url.searchParams.set('max_session_duration_seconds', String(maxSessionSeconds));
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, cache: 'no-store' });
  const body = (await response.json().catch(() => undefined)) as { token?: unknown; error?: unknown } | undefined;
  if (!response.ok || typeof body?.token !== 'string') {
    throw new Error(`AssemblyAI token request failed (HTTP ${response.status}): ${JSON.stringify(body?.error ?? body)}`);
  }
  return body.token;
}

/** Finds the JSON object in a model reply, even if it's wrapped in a code fence or a sentence. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`The model didn't return JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * One LLM Gateway chat completion that returns JSON. With a schema, the model
 * is constrained by response_format; without one (for models that don't
 * support it), the prompt must ask for JSON and it's extracted from the reply.
 */
export async function gatewayJson<T>(
  apiKey: string,
  model: string,
  prompt: string,
  schema?: { name: string; schema: Record<string, unknown> },
): Promise<T> {
  let response = await postChat(apiKey, model, prompt, schema);
  // The gateway rate-limits per model per minute; one short wait usually clears it.
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
    response = await postChat(apiKey, model, prompt, schema);
  }
  return readJson<T>(response);
}

const RATE_LIMIT_RETRY_MS = 1500;

function postChat(
  apiKey: string,
  model: string,
  prompt: string,
  schema?: { name: string; schema: Record<string, unknown> },
): Promise<Response> {
  return fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
      ...(schema && {
        response_format: { type: 'json_schema', json_schema: { name: schema.name, schema: schema.schema, strict: true } },
      }),
    }),
    cache: 'no-store',
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | { choices?: { message?: { content?: string } }[]; error?: unknown; request_id?: string }
    | undefined;
  const content = body?.choices?.[0]?.message?.content;
  if (!response.ok || typeof content !== 'string') {
    // AssemblyAI support can trace a request by its request_id.
    throw new Error(
      `LLM Gateway request failed (HTTP ${response.status}, request_id ${body?.request_id ?? 'none'}): ${JSON.stringify(body?.error ?? body)}`,
    );
  }
  return extractJson(content) as T;
}
