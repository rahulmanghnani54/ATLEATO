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

// Largest base64 image payload any endpoint will accept, per image.
//
// WHY A NUMBER AT ALL: analyze-physique read its three (single mode) or six
// (compare mode) images with a bare `typeof x === 'string'` and no length
// check, then sent them to a Sonnet-tier vision model. Image tokens scale with
// pixels, so an oversized upload is a directly proportional bill — one request
// could cost more than a user's monthly subscription. analyze-food-photo
// already capped at 11MB; this is the same idea, shared.
//
// 5MB of base64 is ~3.7MB of JPEG — an order of magnitude above a legitimate
// 1024px check-in photo, and safely UNDER Anthropic's own ~5MB-per-image limit.
// (An earlier 8MB here was above that ceiling, so the provider would have
// rejected the request after we had already paid to ship it.)
export const MAX_IMAGE_BASE64_LEN = 5_000_000;

// Per-REQUEST ceiling across every image. Per-image caps alone do not bound a
// bill: analyze-physique's compare mode accepts SIX images, so six payloads
// each just under the per-image cap is what an attacker would actually send.
// Cost scales with the total, so the total is what has to be capped.
export const MAX_IMAGES_TOTAL_BASE64_LEN = 12_000_000;

export const ALLOWED_PERSONAS = new Set([
  'arnold', 'cbum', 'nippard', 'ct_fletcher', 'dr_mike',
]);
