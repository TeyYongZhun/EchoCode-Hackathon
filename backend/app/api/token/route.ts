import { AGENT_WS_URL, GREETING, SESSION_CONFIG } from '@/lib/agentConfig';
import { assemblyAiKey, createAgentToken } from '@/lib/assemblyai';
import {
  allowRequest,
  clientIp,
  getUsage,
  isOverLimit,
  isValidInstallId,
  PRO_SECONDS_PER_MONTH,
  type Usage,
} from '@/lib/usage';

export const dynamic = 'force-dynamic';

/** How long the extension has to open its session with the token. */
const TOKEN_REDEEM_SECONDS = 120;
/**
 * Longest a single Voice Agent session may run, which bounds what any one
 * token can cost ($1.13 at $0.075 a minute). An unused session already closes
 * after 3 minutes, and when this cap ends a busy one the extension reconnects.
 */
const MAX_SESSION_SECONDS = 15 * 60;

/**
 * Mints a single-use AssemblyAI Voice Agent token for one EchoCode session.
 * The real API key never leaves this server.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = assemblyAiKey();
  if (!apiKey) {
    return Response.json({ error: 'The EchoCode backend has no ASSEMBLYAI_API_KEY configured.' }, { status: 500 });
  }

  const body = (await request.json().catch(() => undefined)) as { installId?: unknown } | undefined;
  const installId = body?.installId;
  if (!isValidInstallId(installId)) {
    return Response.json({ error: 'Request must include an installId.' }, { status: 400 });
  }

  let usage: Usage | null = null;
  try {
    const verdict = await allowRequest('token', installId, clientIp(request));
    if (verdict === 'rate') {
      return Response.json({ error: 'Too many sessions started from here recently. Try again later.' }, { status: 429 });
    }
    if (verdict === 'capacity') {
      return Response.json({ error: "EchoCode has reached today's voice capacity. Please try again tomorrow." }, { status: 503 });
    }
    usage = await getUsage(installId);
    if (usage && isOverLimit(usage)) {
      const minutes = Math.round(usage.limitSeconds / 60);
      const used = `You've used your ${minutes} ${usage.plan === 'pro' ? 'Pro' : 'free'} minute${minutes === 1 ? '' : 's'} of EchoCode this month.`;
      const next =
        usage.plan === 'pro'
          ? 'Top up to keep talking, or wait for next month.'
          : `Upgrade to Pro for ${Math.round(PRO_SECONDS_PER_MONTH / 60)} minutes a month.`;
      return Response.json({ error: `${used} ${next}`, usage }, { status: 402 });
    }
  } catch (err) {
    // Metering must never take the product down; let the session through.
    console.error('Usage check failed, allowing the session:', err);
  }

  try {
    const token = await createAgentToken(apiKey, TOKEN_REDEEM_SECONDS, MAX_SESSION_SECONDS);
    return Response.json({
      token,
      url: AGENT_WS_URL,
      session: SESSION_CONFIG,
      greeting: GREETING,
      expiresAt: new Date(Date.now() + TOKEN_REDEEM_SECONDS * 1000).toISOString(),
      usage,
    });
  } catch (err) {
    console.error('Failed to create an AssemblyAI session token:', err);
    return Response.json({ error: 'Could not create a voice session token.' }, { status: 502 });
  }
}
