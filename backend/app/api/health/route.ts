import { LIVE_MODEL } from '@/lib/liveConfig';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true, model: LIVE_MODEL, configured: Boolean(process.env.GEMINI_API_KEY) });
}
