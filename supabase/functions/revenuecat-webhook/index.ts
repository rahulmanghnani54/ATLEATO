// Supabase Edge Function — RevenueCat webhook receiver (server-authoritative entitlement).
//
// This is the ONLY thing that may grant a paid tier. lib/featureGates.ts compares
// ranks against a tier the device hydrates from AsyncStorage, so until this ran
// nothing on the server ever vouched for a purchase (see the "PAID TIER SEAM"
// note at lib/subscriptionManager.ts:172). RevenueCat verifies the store receipt;
// we verify RevenueCat, then write profiles.subscription_* through
// apply_subscription_event() (migration 023) — the only writer the guard trigger
// and RLS let through.
//
// DEPLOY NOTE — must be deployed WITHOUT JWT verification, exactly like
// lemonsqueezy-webhook. RevenueCat is a third-party server and cannot mint a
// Supabase JWT; with the default gateway check every delivery would 401 before
// reaching this code:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<long random string>
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
// Then in RevenueCat: Project → Integrations → Webhooks:
//   URL:    https://kbldncrurztfwlqzajen.supabase.co/functions/v1/revenuecat-webhook
//   Header: paste the SAME value as REVENUECAT_WEBHOOK_SECRET into the
//           "Authorization header value" field (compared verbatim below).
//
// AUTH DIFFERS FROM LEMON SQUEEZY: RevenueCat has no HMAC body signature. It
// replays one shared secret in the Authorization header, so there is nothing to
// bind the secret to the body — which is why the replay window and the
// (provider, event_id) idempotency key below carry more weight here.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { isValidUUID } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';
// Play license testers and App Store sandbox accounts can buy unlimited times
// for free, and RevenueCat signs those deliveries with the same secret. So
// SANDBOX events are recorded for audit but grant nothing unless explicitly
// opted in. There is deliberately NO equivalent flag for the secret itself.
const ALLOW_SANDBOX = Deno.env.get('REVENUECAT_ALLOW_SANDBOX') === '1';

const PROVIDER = 'revenuecat';
// RevenueCat retries a failed delivery for ~a day; 7 days of headroom means a
// legitimate retry always lands while a captured payload replayed later cannot.
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Same ids as PRODUCT_IDS in lib/subscriptionManager.ts. An id that is not in
// this map grants nothing — a new product added in Play/RevenueCat must be
// added here (and to the client map) before it can unlock anything.
const PRODUCT_TIERS: Record<string, 'pro' | 'legend'> = {
  atleato_pro_monthly: 'pro',
  atleato_pro_yearly: 'pro',
  atleato_legend_monthly: 'legend',
  atleato_legend_yearly: 'legend',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ─── Timing-safe secret comparison ───
// Double-HMAC: both values are reduced to a fixed-width digest under a key that
// exists only in this process, then compared. `===` on the raw strings would
// leak the secret's length and its matching prefix through response timing;
// comparing digests is constant-work regardless of what was presented.
const COMPARE_KEY = crypto.getRandomValues(new Uint8Array(32));

async function digest(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    COMPARE_KEY,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function secretMatches(presented: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([digest(presented), digest(expected)]);
  // Both are 64 hex chars, so this loop runs a fixed number of iterations.
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Event classification ───
// CANCELLATION is deliberately NOT here: it means "auto-renew is off", and the
// user keeps everything they paid for until the period ends. Revoking on it
// would cut off customers mid-term. Only EXPIRATION revokes. (A refund also
// surfaces as CANCELLATION with cancel_reason CUSTOMER_SUPPORT, but RevenueCat
// follows it with EXPIRATION — that is the event that takes access away.)
// BILLING_ISSUE is likewise a warning during the grace period, not a revocation.
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);
const REVOKE_EVENTS = new Set(['EXPIRATION']);
const AUDIT_EVENTS = new Set(['CANCELLATION', 'BILLING_ISSUE']);

type Supa = ReturnType<typeof createClient>;

/** Append an event to the ledger without touching any tier. Used for everything
 *  we accept but must not act on (unknown product, unknown user, cancellations,
 *  sandbox). A duplicate is a no-op, same as the RPC's idempotency gate. */
async function recordOnly(
  supabase: Supa,
  row: {
    event_id: string;
    event_type: string;
    app_user_id: string | null;
    product_id: string | null;
    payload: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from('subscription_events').insert({
    provider: PROVIDER,
    event_id: row.event_id,
    event_type: row.event_type,
    // Only ever a user id we have already confirmed exists — the column has an
    // FK to auth.users, so an unknown id would abort the insert entirely.
    app_user_id: row.app_user_id,
    product_id: row.product_id,
    payload: row.payload ?? {},
  });
  if (error && error.code !== '23505') {
    console.error('[rc-webhook] ledger insert failed:', error.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // ── 1. Shared-secret auth (FAIL CLOSED) ──
  // No secret configured => reject everything. There is no dev bypass: an
  // unauthenticated caller here could hand any account Legend forever.
  if (!RC_SECRET) {
    console.error('[rc-webhook] REVENUECAT_WEBHOOK_SECRET not configured — rejecting');
    return json({ error: 'webhook misconfigured' }, 503);
  }
  const presented = req.headers.get('authorization') || '';
  if (!(await secretMatches(presented, RC_SECRET))) {
    // Never log the presented value or the secret — only that it failed.
    console.warn('[rc-webhook] rejected: bad or missing Authorization header');
    return json({ error: 'unauthorized' }, 401);
  }

  // ── 2. Parse ──
  let payload: any;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const event = payload?.event;
  if (!event || typeof event !== 'object') return json({ error: 'missing event' }, 400);

  const eventType = String(event.type || '').toUpperCase();
  const environment = String(event.environment || '').toUpperCase();
  const eventAtMs = Number(event.event_timestamp_ms);
  const rawAppUserId = event.app_user_id ?? event.original_app_user_id ?? null;
  const productId = event.product_id ? String(event.product_id) : null;
  const expiresMs = Number(event.expiration_at_ms);

  // event.id is RevenueCat's own delivery id and is the idempotency key. The
  // fallback is deterministic (same inputs => same key), so a retry that lacks
  // an id still dedupes instead of applying twice.
  const eventId = String(
    event.id || `${eventType}:${rawAppUserId ?? 'none'}:${event.event_timestamp_ms ?? '0'}`,
  );

  console.log(
    `[rc-webhook] ${eventType} id=${eventId} product=${productId ?? '-'} env=${environment || '-'}`,
  );

  // ── 3. Replay window ──
  // Returns 200, not 4xx: this is a deliberate ignore, and a 4xx would make
  // RevenueCat retry a payload that can never become fresh.
  if (Number.isFinite(eventAtMs) && Date.now() - eventAtMs > REPLAY_WINDOW_MS) {
    console.warn(`[rc-webhook] ${eventType} outside replay window — ignored`);
    return json({ ok: true, applied: false, reason: 'outside_replay_window' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── 4. Resolve identity ──
  // app_user_id is whatever lib/subscriptionManager.identifyBillingUser() bound
  // to the RevenueCat customer — i.e. the Supabase user id from the auth session.
  // We never create or guess an account: an id we cannot match is recorded and
  // dropped. The existence check must happen BEFORE any ledger write, because
  // subscription_events.app_user_id has an FK to auth.users and a bogus id would
  // abort the insert (losing the audit row too).
  async function resolveUser(candidate: unknown): Promise<string | null> {
    if (!isValidUUID(candidate)) return null; // Supabase auth ids are UUID v4;
    // RevenueCat anonymous ids ("$RCAnonymousID:…") correctly fail here.
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();
    if (error) throw error;
    return data ? candidate : null;
  }

  /** Write a tier through the one RPC allowed to do it. */
  async function apply(opts: {
    eventId: string;
    userId: string;
    tier: 'free' | 'pro' | 'legend';
    expiresAt: string | null;
    productId: string | null;
  }) {
    const { data, error } = await supabase.rpc('apply_subscription_event', {
      p_provider: PROVIDER,
      p_event_id: opts.eventId,
      p_event_type: eventType,
      p_app_user_id: opts.userId,
      p_tier: opts.tier,
      p_expires_at: opts.expiresAt,
      p_product_id: opts.productId,
      p_payload: event,
      p_event_at: Number.isFinite(eventAtMs)
        ? new Date(eventAtMs).toISOString()
        : new Date().toISOString(),
    });
    if (error) throw error;
    return data as { applied: boolean; reason?: string };
  }

  try {
    // ── 5. TRANSFER — the subscription moved to a different account ──
    // Handled first because it carries transferred_from/transferred_to arrays
    // instead of a single app_user_id. We only REVOKE from the losing accounts:
    // the payload has no product_id or expiration, so there is nothing truthful
    // to grant the receiving account — its access arrives with the next
    // RENEWAL/INITIAL_PURCHASE. Each account gets its own deterministic event id
    // so one transfer can revoke several without colliding on the unique key.
    if (eventType === 'TRANSFER') {
      const from: unknown[] = Array.isArray(event.transferred_from) ? event.transferred_from : [];
      let revoked = 0;
      for (const candidate of from) {
        const userId = await resolveUser(candidate);
        if (!userId) continue;
        const res = await apply({
          eventId: `${eventId}#from:${userId}`,
          userId,
          tier: 'free',
          expiresAt: null,
          productId: null,
        });
        if (res?.applied) revoked++;
      }
      // A transfer that names no losing account still deserves an audit row.
      if (from.length === 0) {
        await recordOnly(supabase, {
          event_id: eventId,
          event_type: eventType,
          app_user_id: null,
          product_id: productId,
          payload: event,
        });
      }
      console.log(`[rc-webhook] TRANSFER revoked=${revoked}/${from.length}`);
      return json({ ok: true, applied: revoked > 0, revoked });
    }

    const userId = await resolveUser(rawAppUserId);

    // Unknown/unmatched account: audit it, grant nothing, 200 so RevenueCat
    // stops retrying. Common and benign — e.g. a purchase made before sign-in.
    if (!userId) {
      await recordOnly(supabase, {
        event_id: eventId,
        event_type: eventType,
        app_user_id: null,
        product_id: productId,
        payload: event,
      });
      console.log(`[rc-webhook] ${eventType} unmatched app_user_id — recorded, no tier written`);
      return json({ ok: true, applied: false, reason: 'unknown_app_user' });
    }

    // ── 6. Events we accept but must not act on ──
    if (AUDIT_EVENTS.has(eventType)) {
      await recordOnly(supabase, {
        event_id: eventId,
        event_type: eventType,
        app_user_id: userId,
        product_id: productId,
        payload: event,
      });
      console.log(`[rc-webhook] ${eventType} recorded — access intentionally unchanged`);
      return json({ ok: true, applied: false, reason: 'no_entitlement_change' });
    }

    // ── 7. Revocation ──
    if (REVOKE_EVENTS.has(eventType)) {
      const res = await apply({
        eventId,
        userId,
        tier: 'free',
        expiresAt: null,
        productId,
      });
      console.log(`[rc-webhook] EXPIRATION -> free applied=${res?.applied} ${res?.reason ?? ''}`);
      return json({ ok: true, ...res });
    }

    // ── 8. Grants ──
    if (GRANT_EVENTS.has(eventType)) {
      // On PRODUCT_CHANGE, product_id is what the user is subscribed to RIGHT
      // NOW and new_product_id is what they move to at the next renewal. We map
      // the current one: applying the new one early would either downgrade
      // someone who already paid for this period, or hand out an upgrade the
      // store has not billed yet. The follow-up RENEWAL carries the new product.
      const tier = productId ? PRODUCT_TIERS[productId] : undefined;
      if (!tier) {
        await recordOnly(supabase, {
          event_id: eventId,
          event_type: eventType,
          app_user_id: userId,
          product_id: productId,
          payload: event,
        });
        console.warn(`[rc-webhook] ${eventType} unknown product '${productId}' — nothing granted`);
        return json({ ok: true, applied: false, reason: 'unknown_product' });
      }

      // Every product we sell is auto-renewing, so a grant without an expiry is
      // malformed. Refusing it matters: migration 023 reads a NULL expiry as
      // "never expires", so guessing here would mint a permanent tier.
      if (!Number.isFinite(expiresMs) || expiresMs <= 0) {
        await recordOnly(supabase, {
          event_id: eventId,
          event_type: eventType,
          app_user_id: userId,
          product_id: productId,
          payload: event,
        });
        console.warn(`[rc-webhook] ${eventType} ${productId} has no expiration — nothing granted`);
        return json({ ok: true, applied: false, reason: 'missing_expiration' });
      }

      if (environment === 'SANDBOX' && !ALLOW_SANDBOX) {
        await recordOnly(supabase, {
          event_id: eventId,
          event_type: eventType,
          app_user_id: userId,
          product_id: productId,
          payload: event,
        });
        console.warn(
          `[rc-webhook] SANDBOX ${eventType} recorded but not applied — set REVENUECAT_ALLOW_SANDBOX=1 to test grants`,
        );
        return json({ ok: true, applied: false, reason: 'sandbox_not_allowed' });
      }

      const res = await apply({
        eventId,
        userId,
        tier,
        expiresAt: new Date(expiresMs).toISOString(),
        productId,
      });
      console.log(
        `[rc-webhook] ${eventType} ${productId} -> ${tier} applied=${res?.applied} ${res?.reason ?? ''}`,
      );
      return json({ ok: true, ...res });
    }

    // ── 9. Everything else (TEST, SUBSCRIPTION_PAUSED, SUBSCRIBER_ALIAS, …) ──
    // Accepted with 200 and no ledger row: a 4xx here would make RevenueCat
    // retry an event we will never act on.
    console.log(`[rc-webhook] '${eventType}' not entitlement-affecting — ignored`);
    return json({ ok: true, applied: false, reason: 'unhandled_event', event: eventType });
  } catch (e) {
    // A DB failure must NOT look like success: 5xx so RevenueCat retries and a
    // real purchase is not silently dropped. apply_subscription_event is one
    // transaction, so a retry after a failure re-runs cleanly.
    console.error(`[rc-webhook] ${eventType} failed:`, (e as Error)?.message ?? e);
    return json({ error: 'internal error' }, 500);
  }
});
