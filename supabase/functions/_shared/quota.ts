// Durable per-user daily quota for the endpoints that spend real money.
//
// WHY THIS EXISTS: checkRateLimit() in ./security.ts is an in-memory Map inside
// ONE Deno isolate. Supabase runs many and recycles idle ones, so the same user
// hitting two isolates gets two independent budgets, and a redeploy resets
// every counter. It is a burst shield, not a ceiling — keep it in front of this
// (it is free and spares the database a round trip), but never rely on it to
// bound a bill.
//
// This calls consume_ai_quota() (migration 024), which increments and checks in
// a single atomic statement while holding the row lock, so two isolates racing
// on the last unit produce exactly one winner.
//
// IDENTITY: like requireTier(), the RPC derives the user from auth.uid() inside
// the database and takes no user-id argument, so pass the USER-scoped client
// (anon key + the caller's Authorization header). `userId` here is for log
// correlation only and never reaches the query. A service-role client has no
// auth.uid() and is denied — the safe direction.
import { jsonResponse } from './claude.ts';

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  used: number;
  limit: number;
  remaining?: number;
  resets_at?: string;
}

/**
 * Spend one unit of the caller's daily allowance for `action`.
 *
 * Returns null when the call may proceed, otherwise a ready-to-return Response:
 *
 *   429 { error: 'quota_exceeded', used, limit, resets_at, message }
 *   503 { error: 'quota_unavailable', retryable: true, message }
 *
 * FAILS CLOSED. If the RPC itself errors we deny rather than wave the request
 * through, matching requireTier()'s stance: an outage may cost us a feature for
 * a few minutes, but waving requests through means an attacker who can induce
 * database errors gets unmetered inference. Nothing is spent on a denial.
 *
 * ORDERING. Always AFTER requireTier() — a free caller should be told to
 * upgrade, not told they are out of an allowance they never had.
 *
 * Relative to the request body, the right place differs by endpoint and the
 * split is deliberate:
 *
 *   TEXT endpoints: meter IMMEDIATELY BEFORE the provider call. Validation,
 *   ownership checks and early returns (weekly-summary answers
 *   "not enough data" without calling Claude at all) must not cost a unit —
 *   a unit spent on a request that produced no inference is one the user paid
 *   for and did not receive.
 *
 *   IMAGE endpoints (analyze-physique, analyze-food-photo): meter BEFORE the
 *   body is parsed. There, decoding a multi-MB base64 payload IS the expensive
 *   operation, so "parse it, then decide whether to charge" leaves exactly the
 *   unmetered loop an attacker wants.
 */
export async function requireQuota(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  action: string,
  dailyLimit: number,
): Promise<Response | null> {
  let result: QuotaResult | null = null;

  try {
    const { data, error } = await supabase.rpc('consume_ai_quota', {
      p_action: action,
      p_limit: dailyLimit,
    });
    if (error) {
      // Loud: a quota lookup that fails is a cost incident waiting to happen.
      console.error('[quota] consume_ai_quota failed for', userId, action, error);
    } else if (data && typeof (data as QuotaResult).allowed === 'boolean') {
      result = data as QuotaResult;
    } else {
      console.error('[quota] unrecognised RPC payload for', userId, action, JSON.stringify(data));
    }
  } catch (e) {
    console.error('[quota] lookup threw for', userId, action, (e as Error)?.message ?? e);
  }

  if (result === null) {
    return jsonResponse({
      error: 'quota_unavailable',
      retryable: true,
      message: 'Could not check your daily allowance right now. Please try again shortly.',
    }, 503);
  }

  if (result.allowed) return null;

  // Killed from the database (migration 026 app_config). Not the user's fault
  // and not retryable by them, so say plainly that the feature is off rather
  // than implying they did something wrong or should try again.
  if (result.reason === 'feature_disabled') {
    return jsonResponse({
      error: 'feature_disabled',
      retryable: false,
      message: 'This feature is temporarily unavailable. Please try again later.',
    }, 503);
  }

  // 'no_identity' / 'not_permitted' mean the call was malformed or unauthenticated
  // rather than over budget; say so honestly instead of blaming the user's usage.
  if (result.reason && result.reason !== 'quota_exceeded') {
    return jsonResponse({
      error: 'quota_unavailable',
      retryable: false,
      message: 'Could not check your daily allowance for this request.',
    }, 503);
  }

  return jsonResponse({
    error: 'quota_exceeded',
    used: result.used,
    limit: result.limit,
    resets_at: result.resets_at ?? null,
    message: `You have used today's ${result.limit} requests for this feature. It resets at midnight UTC.`,
  }, 429);
}

/**
 * Daily ceilings, per action. Deliberately generous against real use and tight
 * against scripted abuse — the point is a ceiling that exists, not a tight fit.
 *
 * These live in code, not in the database, so changing one ships with
 * `supabase functions deploy` and never waits on an app-store release.
 *
 * Sizing note: the numbers are per user per UTC day, so the real ceiling is
 * N_accounts x these values. Two things bound N: "Confirm email" is ENABLED in
 * Supabase (verified 2026-09-09), so each account costs a working inbox, and
 * anonymous sign-ins are OFF. There is still no CAPTCHA — the app sends no
 * captchaToken, so enabling one server-side would reject every sign-up, sign-in
 * and password reset until the client is rebuilt to supply it.
 *
 * The true backstop is neither of those: it is the monthly spend cap set in the
 * Anthropic console and the per-agent call/duration limits in ElevenLabs.
 */
export const DAILY_QUOTA = {
  // Free tier's headline feature. A long coaching session is tens of messages.
  ai_coach_chat: 120,
  // One workout is analysed once; the rest is re-reading the same result.
  analyze_workout: 40,
  nutrition_advice: 40,
  // Expensive per call (1000 output tokens) and nobody plans 20 weeks of meals.
  generate_meal_plan: 15,
  recovery_plan: 20,
  // Genuinely weekly.
  weekly_summary: 10,
  // Paid features. Still capped: a compromised paid account is still our bill.
  form_feedback: 100,
  food_scan: 60,
  // Sonnet-tier vision on multi-MB images — the single most expensive call.
  physique_analysis: 20,
  // Per-minute billing downstream, so this is the one that most needs a floor
  // AND a max-duration cap set on the agent in the ElevenLabs dashboard.
  voice_call_token: 12,
} as const;
