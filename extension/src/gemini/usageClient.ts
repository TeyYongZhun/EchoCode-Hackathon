/** This month's voice usage, as the backend meters it. */
export interface Usage {
  plan: 'free' | 'pro';
  usedSeconds: number;
  /** Null for unlimited (Pro). */
  limitSeconds: number | null;
}

export function isUsage(value: unknown): value is Usage {
  const v = value as Partial<Usage> | undefined;
  return (v?.plan === 'free' || v?.plan === 'pro') && typeof v.usedSeconds === 'number';
}

/** Reports the seconds of voice one answer used. Resolves to null when the backend doesn't meter. */
export async function reportUsage(backendUrl: string, installId: string, seconds: number): Promise<Usage | null> {
  const response = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/usage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installId, seconds: Math.min(600, Math.round(seconds)) }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => undefined)) as { usage?: unknown; error?: unknown } | undefined;
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
  return isUsage(body?.usage) ? body.usage : null;
}
