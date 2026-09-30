import { assemblyAiKey } from '@/lib/assemblyai';
import { generateSuggestion, parseSuggestRequest } from '@/lib/suggestion';
import { allowRequest, clientIp, isValidInstallId } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * Returns the code behind a spoken answer, or { suggestion: null } when the
 * answer didn't propose any. Called by the extension once an answer ends.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = assemblyAiKey();
  if (!apiKey) {
    return Response.json({ error: 'The EchoCode backend has no ASSEMBLYAI_API_KEY configured.' }, { status: 500 });
  }

  const body: unknown = await request.json().catch(() => undefined);
  const installId = (body as { installId?: unknown } | undefined)?.installId;
  const req = parseSuggestRequest(body);
  if (!isValidInstallId(installId) || !req) {
    return Response.json({ error: 'Invalid suggestion request.' }, { status: 400 });
  }

  try {
    if ((await allowRequest('suggest', installId, clientIp(request))) !== 'ok') {
      return Response.json({ error: 'Too many code cards requested. Try again later.' }, { status: 429 });
    }
  } catch (err) {
    // Metering must never take the product down; let the request through.
    console.error('Rate limit check failed, allowing the suggestion:', err);
  }

  try {
    return Response.json({ suggestion: await generateSuggestion(apiKey, req) });
  } catch (err) {
    console.error('Failed to generate a code suggestion:', err);
    return Response.json({ error: 'Could not generate a code suggestion.' }, { status: 502 });
  }
}
