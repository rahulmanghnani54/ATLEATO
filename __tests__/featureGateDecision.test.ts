/**
 * The cold-start paywall. A gated screen used to call canAccess() the instant
 * it mounted; on a cold start straight into that screen the tier provider had
 * not been installed yet, so a Legend account was shown "Unlock AI Form Coach"
 * (seen on a Pixel 8 release build, 2026-09-16). decideFeatureGate waits for
 * the tier to be hydrated first. These tests drive it through the module's own
 * seams — _setTierProvider for the tier, `hydration` for the boot signal — so
 * the sequence "screen mounts, THEN billing hydrates" is what is asserted.
 */
jest.mock('@/lib/subscriptionManager', () => ({
  // The real one is a module-level promise resolved by initBilling(); every
  // test below injects its own so this never resolves by accident.
  whenTierHydrated: () => new Promise<void>(() => {}),
}));

import { _setTierProvider } from '@/lib/featureGates';
import { decideFeatureGate } from '@/lib/featureGateDecision';

type Tier = 'free' | 'pro' | 'legend';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  // What boot looks like before initBilling: the default provider says free.
  _setTierProvider(() => 'free');
});

describe('decideFeatureGate', () => {
  it('does not decide before the tier is hydrated', async () => {
    const boot = deferred();
    let decided: string | null = null;
    void decideFeatureGate('ai_form_coach', { hydration: boot.promise }).then((d) => {
      decided = d;
    });
    await flush();
    expect(decided).toBeNull();
    boot.resolve();
    await flush();
    expect(decided).not.toBeNull();
  });

  it('cold start on a paid account: allows once hydration installs the real tier', async () => {
    const boot = deferred();
    const pending = decideFeatureGate('ai_form_coach', { hydration: boot.promise });
    // initBilling lands AFTER the screen mounted — the case that used to paywall.
    let tier: Tier = 'legend';
    _setTierProvider(() => tier);
    boot.resolve();
    await expect(pending).resolves.toBe('allow');
    tier = 'free'; // keep the linter honest about the mutable tier
  });

  it('cold start on a free account: paywall once hydrated', async () => {
    const boot = deferred();
    const pending = decideFeatureGate('ai_form_coach', { hydration: boot.promise });
    boot.resolve();
    await expect(pending).resolves.toBe('paywall');
  });

  it('fails closed when boot never hydrates: decides on the tier present after the timeout', async () => {
    const never = new Promise<void>(() => {});
    await expect(
      decideFeatureGate('ai_form_coach', { hydration: never, timeoutMs: 20 }),
    ).resolves.toBe('paywall');
  });

  it('a paid tier already present is still allowed after the timeout', async () => {
    _setTierProvider(() => 'pro');
    const never = new Promise<void>(() => {});
    await expect(
      decideFeatureGate('ai_form_coach', { hydration: never, timeoutMs: 20 }),
    ).resolves.toBe('allow');
  });

  it('enabled: false skips without waiting on anything', async () => {
    const never = new Promise<void>(() => {});
    let decided: string | null = null;
    void decideFeatureGate('ai_form_coach', { enabled: false, hydration: never }).then((d) => {
      decided = d;
    });
    await flush();
    expect(decided).toBe('skip');
  });

  it('respects the rank table: legend passes a legend-only feature, pro does not', async () => {
    const boot = deferred();
    boot.resolve();
    _setTierProvider(() => 'pro');
    await expect(decideFeatureGate('video_review', { hydration: boot.promise })).resolves.toBe('paywall');
    _setTierProvider(() => 'legend');
    await expect(decideFeatureGate('video_review', { hydration: boot.promise })).resolves.toBe('allow');
  });
});
