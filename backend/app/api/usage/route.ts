import { addUsage, getUsage, isValidInstallId, MAX_REPORT_SECONDS } from '@/lib/usage';

export const dynamic = 'force-dynamic';

/**
 * The extension reports the seconds of voice each answer used, and gets back
 * this month's total. Returns { usage: null } while metering is off.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as { installId?: unknown; seconds?: unknown } | undefined;
  const installId = body?.installId;
  const seconds = body?.seconds;
  if (!isValidInstallId(installId)) {
    return Response.json({ error: 'Request must include an installId.' }, { status: 400 });
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_REPORT_SECONDS) {
    return Response.json({ error: `seconds must be between 0 and ${MAX_REPORT_SECONDS}.` }, { status: 400 });
  }

  try {
    const usage = seconds > 0 ? await addUsage(installId, seconds) : await getUsage(installId);
    return Response.json({ usage });
  } catch (err) {
    console.error('Failed to record usage:', err);
    return Response.json({ error: 'Could not record usage.' }, { status: 502 });
  }
}
