import { GoogleGenAI } from '@google/genai';
import { LIVE_API_VERSION, LIVE_CONFIG, LIVE_MODEL } from '@/lib/liveConfig';
import {
  allowTokenRequest,
  clientIp,
  FREE_SECONDS_PER_MONTH,
  getUsage,
  isOverLimit,
  isValidInstallId,
  type Usage,
} from '@/lib/usage';

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

  const body = (await request.json().catch(() => undefined)) as
    | { installId?: unknown; resumeHandle?: unknown }
    | undefined;
  const installId = body?.installId;
  if (!isValidInstallId(installId)) {
    return Response.json({ error: 'Request must include an installId.' }, { status: 400 });
  }

  let usage: Usage | null = null;
  try {
    if (!(await allowTokenRequest(installId, clientIp(request)))) {
      return Response.json({ error: 'Too many sessions started this hour. Try again later.' }, { status: 429 });
    }
    usage = await getUsage(installId);
    if (usage && isOverLimit(usage)) {
      const freeMinutes = Math.round(FREE_SECONDS_PER_MONTH / 60);
      return Response.json(
        {
          error: `You've used your ${freeMinutes} free minute${freeMinutes === 1 ? '' : 's'} of EchoCode this month. Upgrade to Pro for unlimited voice sessions.`,
          usage,
        },
        { status: 402 },
      );
    }
  } catch (err) {
    // Metering must never take the product down; let the session through.
    console.error('Usage check failed, allowing the session:', err);
  }
  // A handle from an earlier session lets the new one pick up the same conversation.
  // Tokens lock every setting, so the handle has to be baked in here, not sent by the client.
  const resumeHandle = typeof body?.resumeHandle === 'string' && body.resumeHandle.length <= 1024 ? body.resumeHandle : undefined;
  const config = resumeHandle ? { ...LIVE_CONFIG, sessionResumption: { handle: resumeHandle } } : LIVE_CONFIG;

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
        liveConnectConstraints: { model: LIVE_MODEL, config },
        httpOptions: { apiVersion: LIVE_API_VERSION },
      },
    });
    if (!token.name) throw new Error('Gemini returned a token without a name.');

    return Response.json({
      token: token.name,
      model: LIVE_MODEL,
      apiVersion: LIVE_API_VERSION,
      config,
      expiresAt: expireTime,
      usage,
    });
  } catch (err) {
    console.error('Failed to create an ephemeral Gemini token:', err);
    return Response.json({ error: 'Could not create a Gemini session token.' }, { status: 502 });
  }
}
