import type { LiveConnectConfig } from '@google/genai';
import type { Usage } from './usageClient';

/** Everything the extension needs to open one Gemini Live session. */
export interface SessionTicket {
  /** Single-use ephemeral token ("auth_tokens/..."), never the real API key. */
  token: string;
  model: string;
  apiVersion: string;
  config: LiveConnectConfig;
  expiresAt: string;
  /** This month's usage; null or missing when the backend doesn't meter. */
  usage?: Usage | null;
}

const REQUEST_TIMEOUT_MS = 10_000;

function isTicket(value: unknown): value is SessionTicket {
  const v = value as Partial<SessionTicket> | undefined;
  return (
    typeof v?.token === 'string' &&
    typeof v.model === 'string' &&
    typeof v.apiVersion === 'string' &&
    typeof v.config === 'object' &&
    v.config !== null
  );
}

/**
 * Asks the EchoCode backend for a fresh session token. Passing the resumption
 * handle of an earlier session makes the new session continue that conversation.
 */
export async function fetchSessionTicket(
  backendUrl: string,
  installId: string,
  resumeHandle?: string,
): Promise<SessionTicket> {
  const base = backendUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ installId, resumeHandle }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(base);
    throw new Error(
      isLocal
        ? `Can't reach the EchoCode backend at ${base}. Start it with "npm run dev" in the backend folder.`
        : `Can't reach the EchoCode backend at ${base}. Check your connection or the echocode.backendUrl setting.`,
    );
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const reason = (body as { error?: unknown } | undefined)?.error;
    throw new Error(typeof reason === 'string' ? reason : `The EchoCode backend returned HTTP ${response.status}.`);
  }
  if (!isTicket(body)) throw new Error('The EchoCode backend sent an unexpected response.');
  return body;
}
