// Server-side entitlement gate for the expensive edge functions.
//
// WHY THIS EXISTS: lib/featureGates.ts is a pure client-side rank compare over a
// tier hydrated from AsyncStorage. It is a UX affordance, not a control — a
// patched binary (or anyone who can write that key) grants itself Legend. Every
// function that spends money on our behalf must therefore re-decide the tier
// here, on the server, from the database.
//
// IDENTITY: the tier is read through the get_my_entitlement() RPC (migration
// 023), which derives the user from auth.uid() inside the database and takes NO
// user-id argument. So the answer is always about whoever's JWT is on the
// request — a client cannot ask about, or claim to be, somebody else. The
// `userId` parameter below is used ONLY for log correlation; it never reaches
// the query. Pass the user-scoped client (anon key + the caller's Authorization
// header), the same one the function already used for auth.getUser(). A
// service-role client has no auth.uid() and resolves to 'free', which denies —
// the safe direction.
//
// RESOLUTION: deliberately NOT re-implemented here. get_my_entitlement() owns
// the one true resolution (paid tier honoured only while unexpired, referral
// overlay, highest-wins). Duplicating it loosely in TypeScript is how the
// server and the database start disagreeing about who paid.
import { jsonResponse } from './claude.ts';

export type Tier = 'free' | 'pro' | 'legend';

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, legend: 2 };

const TIER_LABEL: Record<Tier, string> = { free: 'Free', pro: 'Pro', legend: 'Legend' };

function isTier(v: unknown): v is Tier {
  return v === 'free' || v === 'pro' || v === 'legend';
}

/**
 * Resolve the caller's effective tier, or null when the lookup ITSELF failed
 * (DB unreachable, RPC missing, unrecognised payload). null is not 'free': it
 * means we do not know, and callers must deny — but they can say so honestly
 * instead of telling a paying user to upgrade.
 */
// deno-lint-ignore no-explicit-any
async function resolveTier(supabase: any, userId: string): Promise<Tier | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_entitlement');
    if (error) {
      // Loud: an entitlement lookup that fails is a revenue AND a cost incident.
      console.error('[entitlement] get_my_entitlement failed for', userId, error);
      return null;
    }
    const tier = (data as { tier?: unknown } | null)?.tier;
    if (!isTier(tier)) {
      console.error('[entitlement] unrecognised RPC payload for', userId, JSON.stringify(data));
      return null;
    }
    return tier;
  } catch (e) {
    console.error('[entitlement] lookup threw for', userId, (e as Error)?.message ?? e);
    return null;
  }
}

/**
 * The caller's effective tier. FAILS CLOSED: an unexpected DB error resolves to
 * 'free' (least privilege) after logging loudly. Use requireTier() to gate a
 * request — this is for callers that want to vary behaviour rather than refuse.
 */
// deno-lint-ignore no-explicit-any
export async function getTier(supabase: any, userId: string): Promise<Tier> {
  return (await resolveTier(supabase, userId)) ?? 'free';
}

/**
 * Gate a request. Returns null when the caller is entitled, otherwise a ready-to
 * -return Response that the client can act on:
 *
 *   403 { error: 'upgrade_required', required, current, feature, message }
 *       → route to /paywall?feature=<feature>
 *   503 { error: 'entitlement_unavailable', required, retryable: true, message }
 *       → we could not verify; nothing was spent. Retry, do NOT show a paywall.
 *
 * Both outcomes grant nothing, so an entitlement outage can never leak paid
 * inference. `feature` is the lib/featureGates.ts FeatureKey, passed through so
 * the client can open the right paywall copy without guessing from the path.
 */
export async function requireTier(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  min: Tier,
  feature?: string,
): Promise<Response | null> {
  if (min === 'free') return null;

  const tier = await resolveTier(supabase, userId);

  if (tier === null) {
    return jsonResponse({
      error: 'entitlement_unavailable',
      required: min,
      feature: feature ?? null,
      retryable: true,
      message: 'Could not verify your subscription right now. Please try again shortly.',
    }, 503);
  }

  if (TIER_RANK[tier] >= TIER_RANK[min]) return null;

  return jsonResponse({
    error: 'upgrade_required',
    required: min,
    current: tier,
    feature: feature ?? null,
    message: `This feature requires the ${TIER_LABEL[min]} plan.`,
  }, 403);
}
