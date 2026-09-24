import { GoogleGenAI } from '@google/genai';
import { LIVE_API_VERSION, LIVE_CONFIG, LIVE_MODEL } from '@/lib/liveConfig';

export const dynamic = 'force-dynamic';

/** How long an open session may keep using the token. */
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
/** How long the extension has to open its session with the token. */
const NEW_SESSION_WINDOW_MS = 60 * 1000;

/**
 * Mints a single-use Gemini Live token for one EchoCode session.
 * The real API key never leaves this server, and the token is locked to
 * EchoCode's model and session settings.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'The EchoCode backend has no GEMINI_API_KEY configured.' }, { status: 500 });
  }

  const body: unknown = await request.json().catch(() => undefined);
  const installId = (body as { installId?: unknown } | undefined)?.installId;
  if (typeof installId !== 'string' || installId.length < 8 || installId.length > 128) {
    return Response.json({ error: 'Request must include an installId.' }, { status: 400 });
  }

  const now = Date.now();
  const expireTime = new Date(now + TOKEN_LIFETIME_MS).toISOString();
  const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: { model: LIVE_MODEL, config: LIVE_CONFIG },
        httpOptions: { apiVersion: LIVE_API_VERSION },
      },
    });
    if (!token.name) throw new Error('Gemini returned a token without a name.');

    return Response.json({
      token: token.name,
      model: LIVE_MODEL,
      apiVersion: LIVE_API_VERSION,
      config: LIVE_CONFIG,
      expiresAt: expireTime,
    });
  } catch (err) {
    console.error('Failed to create an ephemeral Gemini token:', err);
    return Response.json({ error: 'Could not create a Gemini session token.' }, { status: 502 });
  }
}
