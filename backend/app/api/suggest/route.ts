import { assemblyAiKey } from '@/lib/assemblyai';
import { generateSuggestion, parseSuggestRequest } from '@/lib/suggestion';

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
  if (typeof installId !== 'string' || installId.length < 8 || installId.length > 128 || !req) {
    return Response.json({ error: 'Invalid suggestion request.' }, { status: 400 });
  }

  try {
    return Response.json({ suggestion: await generateSuggestion(apiKey, req) });
  } catch (err) {
    console.error('Failed to generate a code suggestion:', err);
    return Response.json({ error: 'Could not generate a code suggestion.' }, { status: 502 });
  }
}
