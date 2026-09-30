/**
 * Freemium metering in Upstash Redis (add it from the Vercel Marketplace; it
 * sets the env vars below). Without Redis configured, metering is off and
 * everything is allowed, so local development needs no database.
 *
 * Usage is reported by the extension after each answer (seconds of question
 * and answer audio). That's trusting the client, and an install id is only
 * what the client says it is, so the monthly allowance alone can't bound
 * cost. What does is below: every token opens a session of limited length
 * (see the token route), and tokens are rate-limited per install and per IP
 * and capped across everyone per day.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

/** Voice allowance per month: 10 minutes (about 13 questions) on Free, 45 (about 60) on Pro. */
export const FREE_SECONDS_PER_MONTH = Number(process.env.ECHOCODE_FREE_SECONDS_PER_MONTH ?? 10 * 60);
export const PRO_SECONDS_PER_MONTH = Number(process.env.ECHOCODE_PRO_SECONDS_PER_MONTH ?? 45 * 60);

/** Most requests allowed in each window. A classroom shares one IP, so the IP limits stay generous. */
const LIMITS = {
  token: {
    perInstallPerHour: 60,
    perIpPerHour: 60,
    perIpPerDay: Number(process.env.ECHOCODE_MAX_TOKENS_PER_IP_PER_DAY ?? 200),
    /** The circuit breaker: however many installs or IPs ask, the day's voice spend is bounded. */
    allPerDay: Number(process.env.ECHOCODE_MAX_TOKENS_PER_DAY ?? 400),
  },
  suggest: { perInstallPerHour: 120, perIpPerHour: 240, perIpPerDay: 1000, allPerDay: 4000 },
};
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

/** 'rate' when this install or IP asked too often; 'capacity' when everyone together has used up today. */
export type RequestVerdict = 'ok' | 'rate' | 'capacity';

/** Increments each counter (setting its expiry) and returns the new values, in one round trip. */
async function increment(counters: [key: string, ttl: number][]): Promise<number[]> {
  const results = await redis(counters.flatMap(([key, ttl]) => [['INCR', key], ['EXPIRE', key, ttl]]));
  return counters.map((_, i) => Number(results[i * 2]));
}

/**
 * Counts a request to the token or suggest endpoint. The per-install and
 * per-IP limits are checked first, and only a request that passes them counts
 * toward the day's total: otherwise one IP hammering the endpoint could use up
 * everyone's capacity.
 */
export async function allowRequest(kind: keyof typeof LIMITS, installId: string, ip: string): Promise<RequestVerdict> {
  if (!isMeteringEnabled()) return 'ok';
  const limits = LIMITS[kind];
  const hour = Math.floor(Date.now() / 3_600_000);
  const day = Math.floor(Date.now() / 86_400_000);
  const [byInstall, byIpHour, byIpDay] = await increment([
    [`echocode:rate:${kind}:install:${installId}:h${hour}`, 3600],
    [`echocode:rate:${kind}:ip:${ip}:h${hour}`, 3600],
    [`echocode:rate:${kind}:ip:${ip}:d${day}`, 86_400],
  ]);
  if (byInstall > limits.perInstallPerHour || byIpHour > limits.perIpPerHour || byIpDay > limits.perIpPerDay) return 'rate';
  const [byAll] = await increment([[`echocode:rate:${kind}:all:d${day}`, 86_400]]);
  return byAll > limits.allPerDay ? 'capacity' : 'ok';
}

/** The caller's IP as Vercel reports it. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function isValidInstallId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
