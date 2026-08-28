/**
 * Feature gating is the paywall. A false negative locks a paying customer out of
 * what they bought (refund + churn); a false positive gives the product away.
 * So every tier is asserted against every gated feature, not a sample.
 */
import {
  _setTierProvider,
  canAccess,
  getFeatureLabel,
  getMaxCoaches,
  getRequiredTier,
  getUserTier,
  type FeatureKey,
} from '@/lib/featureGates';

type Tier = 'free' | 'pro' | 'legend';

// _setTierProvider is the module's own injection point (subscriptionManager calls
// it at boot). Driving the gates through it is the real code path, not a mock.
function asTier(tier: Tier) {
  _setTierProvider(() => tier);
}

const PRO_FEATURES: FeatureKey[] = [
  'ai_form_coach',
  'reward_chests',
  'physique_photos',
  'custom_ringtone',
  'unlimited_freezes',
  'food_scan',
];

const LEGEND_FEATURES: FeatureKey[] = [
  'snooze_recalls',
  'territory_heatmap',
  'video_review',
  'voice_customization',
];

const ALL_FEATURES: FeatureKey[] = [...PRO_FEATURES, ...LEGEND_FEATURES];

afterEach(() => {
  // Leave the module in its shipped default so test order cannot matter.
  _setTierProvider(() => 'free');
});

describe('featureGates — free tier', () => {
  beforeEach(() => asTier('free'));

  it.each(ALL_FEATURES)('denies %s', (feature) => {
    expect(canAccess(feature)).toBe(false);
  });

  it('reports its own tier as free', () => {
    expect(getUserTier()).toBe('free');
  });

  it('allows exactly one coach', () => {
    expect(getMaxCoaches()).toBe(1);
  });
});

describe('featureGates — pro tier', () => {
  beforeEach(() => asTier('pro'));

  it.each(PRO_FEATURES)('grants %s', (feature) => {
    expect(canAccess(feature)).toBe(true);
  });

  it.each(LEGEND_FEATURES)('still denies legend-only %s', (feature) => {
    expect(canAccess(feature)).toBe(false);
  });

  it('allows three coaches', () => {
    expect(getMaxCoaches()).toBe(3);
  });
});

describe('featureGates — legend tier', () => {
  beforeEach(() => asTier('legend'));

  it.each(ALL_FEATURES)('grants %s', (feature) => {
    expect(canAccess(feature)).toBe(true);
  });

  it('allows five coaches', () => {
    expect(getMaxCoaches()).toBe(5);
  });
});

describe('featureGates — tier is strictly ordered', () => {
  it('never grants a feature to a tier below its requirement', () => {
    const rank: Record<Tier, number> = { free: 0, pro: 1, legend: 2 };
    for (const tier of ['free', 'pro', 'legend'] as Tier[]) {
      asTier(tier);
      for (const feature of ALL_FEATURES) {
        const required = getRequiredTier(feature);
        expect(canAccess(feature)).toBe(rank[tier] >= rank[required]);
      }
    }
  });

  it('coach limit never decreases as tier increases', () => {
    asTier('free');
    const free = getMaxCoaches();
    asTier('pro');
    const pro = getMaxCoaches();
    asTier('legend');
    const legend = getMaxCoaches();
    expect(pro).toBeGreaterThan(free);
    expect(legend).toBeGreaterThan(pro);
  });
});

describe('featureGates — downgrade path', () => {
  it('legend → pro revokes exactly the legend-only features', () => {
    asTier('legend');
    expect(LEGEND_FEATURES.every(canAccess)).toBe(true);

    asTier('pro');
    expect(LEGEND_FEATURES.some(canAccess)).toBe(false);
    // ...and does NOT touch what pro still paid for.
    expect(PRO_FEATURES.every(canAccess)).toBe(true);
  });

  it('pro → free revokes every paid feature and drops the coach limit', () => {
    asTier('pro');
    expect(PRO_FEATURES.every(canAccess)).toBe(true);
    expect(getMaxCoaches()).toBe(3);

    asTier('free');
    expect(ALL_FEATURES.some(canAccess)).toBe(false);
    expect(getMaxCoaches()).toBe(1);
  });

  it('legend → free in one step revokes everything (no stale pro access)', () => {
    asTier('legend');
    asTier('free');
    expect(ALL_FEATURES.some(canAccess)).toBe(false);
  });

  it('re-upgrade restores access — a lapse is not permanent', () => {
    asTier('legend');
    asTier('free');
    expect(canAccess('video_review')).toBe(false);
    asTier('legend');
    expect(canAccess('video_review')).toBe(true);
  });

  it('reads the provider live, so a mid-session downgrade takes effect at once', () => {
    let tier: Tier = 'legend';
    _setTierProvider(() => tier);
    expect(canAccess('territory_heatmap')).toBe(true);
    tier = 'free';
    expect(canAccess('territory_heatmap')).toBe(false);
  });
});

describe('featureGates — paywall copy', () => {
  it('every gated feature names the tier that unlocks it', () => {
    for (const feature of PRO_FEATURES) expect(getRequiredTier(feature)).toBe('pro');
    for (const feature of LEGEND_FEATURES) expect(getRequiredTier(feature)).toBe('legend');
  });

  it('every gated feature has a human label for the paywall', () => {
    for (const feature of ALL_FEATURES) {
      expect(typeof getFeatureLabel(feature)).toBe('string');
      expect(getFeatureLabel(feature).length).toBeGreaterThan(0);
    }
  });
});
