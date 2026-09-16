/**
 * The one decision every gated screen makes at mount: let the lifter in, or
 * send them to the paywall.
 *
 * Why this is not just `canAccess()`: featureGates answers from whatever tier
 * provider is installed, and until subscriptionManager.initBilling() has run
 * that provider says 'free'. Every gated screen used to call canAccess()
 * synchronously in a mount effect, which is correct once the app has been up
 * for a moment and wrong on a COLD START that lands directly on the screen — a
 * notification deep link, a Branch link, an App Link. Verified on a Pixel 8
 * release build: a Legend account opened straight into /technique saw
 * "Unlock AI Form Coach". A false negative here locks a paying customer out of
 * what they bought, so the gate waits for the tier to be hydrated first.
 *
 * "Hydrated" (see whenTierHydrated in subscriptionManager) means either the
 * cache vouches for a paid tier on its own, or the server has answered — a
 * cache that merely reads 'free' does not count, because that is also what an
 * expired-but-renewed subscription looks like before its first sync. The
 * timeout keeps the gate fail-closed: if the server never answers (offline,
 * signed out, boot never reached initBilling), the screen is gated on whatever
 * tier is present rather than left open forever.
 */
import { canAccess, type FeatureKey } from './featureGates';
import { whenTierHydrated } from './subscriptionManager';

export type GateDecision = 'allow' | 'paywall' | 'skip';

/** Longer than any realistic boot, shorter than a lifter's patience. */
export const GATE_HYDRATION_TIMEOUT_MS = 3000;

export interface GateOptions {
  /**
   * `false` means this mount is not a paid path (e.g. technique's review mode,
   * or an exercise with no camera profile) — the gate stays out of the way.
   */
  enabled?: boolean;
  timeoutMs?: number;
  /** Test seam: the hydration promise to wait on. Defaults to the real one. */
  hydration?: Promise<void>;
}

export async function decideFeatureGate(
  feature: FeatureKey,
  opts: GateOptions = {},
): Promise<GateDecision> {
  if (opts.enabled === false) return 'skip';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, opts.timeoutMs ?? GATE_HYDRATION_TIMEOUT_MS);
  });
  try {
    await Promise.race([opts.hydration ?? whenTierHydrated(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return canAccess(feature) ? 'allow' : 'paywall';
}
