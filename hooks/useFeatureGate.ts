/**
 * Mount-time feature gate for a paid screen. Replaces the eight copies of
 *
 *   useEffect(() => { if (!canAccess(f)) router.replace('/paywall?feature=f'); }, []);
 *
 * with one that waits for the tier to be hydrated first — see
 * lib/featureGateDecision.ts for why the synchronous form sent paying users
 * to the paywall on a cold start.
 *
 * Mount-only on purpose, like the gates it replaces: `enabled` and `onAllow`
 * are mount-time facts, and a gate that re-ran on every render could bounce a
 * screen the lifter is in the middle of using.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import type { FeatureKey } from '@/lib/featureGates';
import { decideFeatureGate } from '@/lib/featureGateDecision';

export interface UseFeatureGateOptions {
  /** `false` = this mount is not a paid path; nothing is checked. */
  enabled?: boolean;
  /** Runs once, only when the gate lets the lifter through. */
  onAllow?: () => void;
}

export function useFeatureGate(feature: FeatureKey, opts: UseFeatureGateOptions = {}): void {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    decideFeatureGate(feature, { enabled: opts.enabled }).then((decision) => {
      if (!alive) return;
      if (decision === 'paywall') router.replace(`/paywall?feature=${feature}` as any);
      else if (decision === 'allow') opts.onAllow?.();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
