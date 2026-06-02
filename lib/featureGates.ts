/**
 * Feature Gating — pure lookup for which tier can access what.
 *
 * Usage:
 *   import { canAccess, getMaxCoaches, getRequiredTier } from '@/lib/featureGates';
 *   if (!canAccess('ai_form_coach')) router.push('/paywall?feature=ai_form_coach');
 */

let _getTier: () => 'free' | 'pro' | 'legend' = () => 'free';

/** Called once by subscriptionManager after it initializes */
export function _setTierProvider(fn: () => 'free' | 'pro' | 'legend') {
  _getTier = fn;
}

export type FeatureKey =
  | 'ai_form_coach'
  | 'reward_chests'
  | 'physique_photos'
  | 'custom_ringtone'
  | 'unlimited_freezes'
  | 'snooze_recalls'
  | 'territory_heatmap'
  | 'video_review'
  | 'voice_customization';

type Tier = 'free' | 'pro' | 'legend';

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, legend: 2 };

const FEATURE_TIER: Record<FeatureKey, Tier> = {
  ai_form_coach:      'pro',
  reward_chests:       'pro',
  physique_photos:     'pro',
  custom_ringtone:     'pro',
  unlimited_freezes:   'pro',
  snooze_recalls:      'legend',
  territory_heatmap:   'legend',
  video_review:        'legend',
  voice_customization: 'legend',
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_form_coach:      'AI Form Coach',
  reward_chests:       'Reward Chests & Leaderboards',
  physique_photos:     'Physique Progress Photos',
  custom_ringtone:     'Custom Ringtone Picker',
  unlimited_freezes:   'Unlimited Streak Freezes',
  snooze_recalls:      '5-Min Snooze Re-Calls',
  territory_heatmap:   'Territory Heatmap & Analytics',
  video_review:        'Advanced Form AI & Video Review',
  voice_customization: 'Coach Voice Customization',
};

const COACH_LIMITS: Record<Tier, number> = { free: 1, pro: 3, legend: 5 };

export function canAccess(feature: FeatureKey): boolean {
  return TIER_RANK[_getTier()] >= TIER_RANK[FEATURE_TIER[feature]];
}

export function getMaxCoaches(): number {
  return COACH_LIMITS[_getTier()];
}

export function getRequiredTier(feature: FeatureKey): Tier {
  return FEATURE_TIER[feature];
}

export function getFeatureLabel(feature: FeatureKey): string {
  return FEATURE_LABELS[feature];
}

export function getUserTier(): Tier {
  return _getTier();
}
