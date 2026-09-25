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

/** One LLM Gateway chat completion constrained to a JSON schema; returns the parsed JSON. */
export async function gatewayJson<T>(
  apiKey: string,
  model: string,
  prompt: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } },
    }),
    cache: 'no-store',
  });
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
  return JSON.parse(content) as T;
}
