import type { Usage } from './usageClient';

/** Everything the extension needs to open one AssemblyAI Voice Agent session. */
export interface SessionTicket {
  /** Single-use AssemblyAI token, never the real API key. */
  token: string;
  /** The Voice Agent WebSocket endpoint. */
  url: string;
  /** Sent as the first session.update: prompt, voice, keyterms, audio formats. */
  session: Record<string, unknown>;
  expiresAt: string;
  /** This month's usage; null or missing when the backend doesn't meter. */
  usage?: Usage | null;
}

const REQUEST_TIMEOUT_MS = 10_000;

function isTicket(value: unknown): value is SessionTicket {
  const v = value as Partial<SessionTicket> | undefined;
  return (
    typeof v?.token === 'string' &&
    typeof v.url === 'string' &&
    typeof v.session === 'object' &&
    v.session !== null
  );
}

/** Asks the EchoCode backend for a fresh single-use session token. */
export async function fetchSessionTicket(backendUrl: string, installId: string): Promise<SessionTicket> {
  const base = backendUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ installId }),
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
