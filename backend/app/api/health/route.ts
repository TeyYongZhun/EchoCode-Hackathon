import { assemblyAiKey } from '@/lib/assemblyai';
import { SUGGEST_MODEL } from '@/lib/suggestion';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    ok: true,
    voice: 'AssemblyAI Voice Agent',
    codeCards: SUGGEST_MODEL,
    configured: Boolean(assemblyAiKey()),
  });
}
