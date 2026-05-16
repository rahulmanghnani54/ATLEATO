// Sliding-window in-memory rate limiter.
// Works within a single Deno isolate; protects against burst abuse.
const _rateLimitBuckets = new Map<string, number[]>();

export function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const hits = (_rateLimitBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= maxRequests) return false;
  hits.push(now);
  _rateLimitBuckets.set(key, hits);
  return true;
}

// Strip ASCII control characters (except tab + newline), then trim and cap length.
export function sanitize(input: string, maxLen: number): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

// Reject anything that isn't a well-formed UUID v4.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Reject dates that aren't YYYY-MM-DD within a sane range.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100;
}

export const ALLOWED_PERSONAS = new Set([
  'arnold', 'cbum', 'nippard', 'ct_fletcher', 'dr_mike',
]);
