/**
 * Branch deep-link install attribution for the referral reward.
 *
 * Flow:
 *   - A referrer shares a Branch link carrying their code (createReferralLink).
 *   - A friend taps it → installs → on first open Branch returns the link's
 *     params (deferred deep link), including the referrer code.
 *   - We call set_referrer(code) once to stamp the new user's profile.
 *   - install_referral_count() / claim_referral_reward() (migration 018) then
 *     count real installs and grant Pro at 10.
 *
 * FAIL-SAFE: react-native-branch is lazy-required in try/catch (same pattern as
 * react-native-callkeep in wakeupCalls.ts). Before the Branch key is configured
 * + a native rebuild ships, the module simply isn't present — every function
 * here no-ops and createReferralLink falls back to a plain ?ref= URL. The app
 * never crashes on a missing/incompatible native module.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

let branch: any = null;
try {
   
  branch = require('react-native-branch').default;
} catch {
  branch = null; // native module absent (no key / pre-rebuild / web) — degrade
}

const REFERRER_APPLIED_KEY = 'referrer_applied:v1';
const FALLBACK_BASE = 'https://atleato.com';

/** Pull the referrer code out of a Branch session params object (tolerant of shape). */
function extractCode(params: any): string | null {
  if (!params || params['+clicked_branch_link'] !== true) return null;
  const raw = params.referrer_code ?? params.ref ?? params.$canonical_identifier ?? null;
  if (!raw || typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length >= 4 ? code : null;
}

/**
 * Initialize Branch + subscribe to the first session. Call once after auth is
 * ready (so set_referrer has a logged-in user to stamp). Safe to call when
 * Branch isn't installed (no-op) or the user has already been attributed.
 */
export function initBranchReferral(): () => void {
  if (!branch) return () => {};

  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = branch.subscribe(async ({ error, params }: any) => {
      if (error || !params) return;
      const code = extractCode(params);
      if (!code) return;
      try {
        // Only attempt once per device — set_referrer is also idempotent
        // server-side (rejects 'already_set'), this just avoids noise.
        const applied = await AsyncStorage.getItem(REFERRER_APPLIED_KEY);
        if (applied) return;
        const { data } = await (supabase.rpc as any)('set_referrer', { p_code: code });
        if (data?.ok || data?.reason === 'already_set' || data?.reason === 'self_referral') {
          await AsyncStorage.setItem(REFERRER_APPLIED_KEY, '1');
        }
      } catch {
        // RPC failed (offline / not logged in yet) — leave unmarked, retry next launch
      }
    });
  } catch {
    return () => {};
  }
  return unsubscribe ?? (() => {});
}

/**
 * Create a shareable referral link carrying the user's code. Uses a Branch
 * link when available (enables deferred deep-link install attribution);
 * otherwise falls back to a plain ?ref= URL (still attributed on the web
 * waitlist path, just not for native installs).
 */
export async function createReferralLink(code: string): Promise<string> {
  const fallback = `${FALLBACK_BASE}?ref=${encodeURIComponent(code)}`;
  if (!branch) return fallback;
  try {
    const buo = await branch.createBranchUniversalObject(`referral/${code}`, {
      title: 'Atleato — Train Under a Legend',
      contentDescription: 'Join me on Atleato. An AI coach that actually calls your phone.',
      contentMetadata: { customMetadata: { referrer_code: code } },
    });
    const { url } = await buo.generateShortUrl(
      { feature: 'referral', channel: 'app-share', campaign: 'install-referral' },
      { referrer_code: code, ref: code },
    );
    return url || fallback;
  } catch {
    return fallback;
  }
}
