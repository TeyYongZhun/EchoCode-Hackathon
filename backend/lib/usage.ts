/**
 * Freemium metering in Upstash Redis (add it from the Vercel Marketplace; it
 * sets the env vars below). Without Redis configured, metering is off and
 * everything is allowed, so local development needs no database.
 *
 * Usage is reported by the extension after each answer (seconds of question
 * and answer audio). That's trusting the client, which is fine for a free
 * tier; paid enforcement would meter on the server.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

/** Voice allowance per month: 15 minutes (about 20 questions) on Free, 150 (about 200) on Pro. */
export const FREE_SECONDS_PER_MONTH = Number(process.env.ECHOCODE_FREE_SECONDS_PER_MONTH ?? 15 * 60);
export const PRO_SECONDS_PER_MONTH = Number(process.env.ECHOCODE_PRO_SECONDS_PER_MONTH ?? 150 * 60);
/** Session tokens one install may request per hour, to blunt abuse of the public endpoint. */
const TOKENS_PER_HOUR_PER_INSTALL = 60;
const TOKENS_PER_HOUR_PER_IP = 120;
/** Longest usage a single report may add. */
export const MAX_REPORT_SECONDS = 600;

const PRO_INSTALL_IDS = new Set(
  (process.env.ECHOCODE_PRO_INSTALL_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

export interface Usage {
  plan: 'free' | 'pro';
  usedSeconds: number;
  limitSeconds: number;
}

export function isMeteringEnabled(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

type Command = (string | number)[];

/** Runs Redis commands in one round trip and returns their results in order. */
async function redis(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Redis responded with HTTP ${response.status}`);
  const results = (await response.json()) as { result?: unknown; error?: string }[];
  const failed = results.find((r) => r.error);
  if (failed) throw new Error(`Redis error: ${failed.error}`);
  return results.map((r) => r.result);
}

function monthKey(installId: string): string {
  const now = new Date();
  return `echocode:usage:${installId}:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function describe(installId: string, usedSeconds: number): Usage {
  return PRO_INSTALL_IDS.has(installId)
    ? { plan: 'pro', usedSeconds, limitSeconds: PRO_SECONDS_PER_MONTH }
    : { plan: 'free', usedSeconds, limitSeconds: FREE_SECONDS_PER_MONTH };
}

export function isOverLimit(usage: Usage): boolean {
  return usage.usedSeconds >= usage.limitSeconds;
}

/** This month's usage, or null when metering is off. */
export async function getUsage(installId: string): Promise<Usage | null> {
  if (!isMeteringEnabled()) return null;
  const [used] = await redis([['GET', monthKey(installId)]]);
  return describe(installId, Number(used ?? 0));
}

/** Adds seconds to this month's usage and returns the new total, or null when metering is off. */
export async function addUsage(installId: string, seconds: number): Promise<Usage | null> {
  if (!isMeteringEnabled()) return null;
  const key = monthKey(installId);
  // Keys expire after the month is over (40 days covers any month).
  const [used] = await redis([
    ['INCRBY', key, Math.round(seconds)],
    ['EXPIRE', key, 40 * 24 * 3600],
  ]);
  return describe(installId, Number(used));
}

/** Counts a token request; false when this install or IP has asked too often this hour. */
export async function allowTokenRequest(installId: string, ip: string): Promise<boolean> {
  if (!isMeteringEnabled()) return true;
  const hour = Math.floor(Date.now() / 3_600_000);
  const installKey = `echocode:rate:install:${installId}:${hour}`;
  const ipKey = `echocode:rate:ip:${ip}:${hour}`;
  const [byInstall, , byIp] = await redis([
    ['INCR', installKey],
    ['EXPIRE', installKey, 3600],
    ['INCR', ipKey],
    ['EXPIRE', ipKey, 3600],
  ]);
  return Number(byInstall) <= TOKENS_PER_HOUR_PER_INSTALL && Number(byIp) <= TOKENS_PER_HOUR_PER_IP;
}

/** The caller's IP as Vercel reports it. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function isValidInstallId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
