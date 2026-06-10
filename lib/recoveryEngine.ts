export interface RecoveryInputs {
  sleepHours: number;     // 0–12
  sleepQuality: number;   // 1–5
  soreness: number;       // 1–5 (1=none, 5=very sore)
  energy: number;         // 1–5
  stress: number;         // 1–5 (1=none, 5=very stressed)
}

export interface RecoveryResult {
  recoveryScore: number;  // 0–100
  volumeModifier: number; // 0.60–1.20
  label: string;          // 'Poor' | 'Low' | 'Moderate' | 'Good' | 'Excellent'
  recommendation: string;
}

// Weights must sum to 1.0
const WEIGHTS = {
  sleepHours: 0.30,
  sleepQuality: 0.25,
  energy: 0.20,
  soreness: 0.15,
  stress: 0.10,
};

function normalizeSleepHours(h: number): number {
  // 7–9h is optimal (100), below 5 or above 11 is bad (0)
  if (h >= 7 && h <= 9) return 100;
  if (h < 5) return Math.max(0, (h / 5) * 60);
  if (h > 9) return Math.max(0, 100 - ((h - 9) / 3) * 40);
  // 5–7: linear ramp
  return 60 + ((h - 5) / 2) * 40;
}

function normalizeQuality(v: number): number {
  return ((v - 1) / 4) * 100;
}

function normalizeEnergy(v: number): number {
  return ((v - 1) / 4) * 100;
}

// Soreness and stress are inverse: 1 = good (100), 5 = bad (0)
function normalizeInverse(v: number): number {
  return ((5 - v) / 4) * 100;
}

export function calculateRecovery(inputs: RecoveryInputs): RecoveryResult {
  const rawScore =
    normalizeSleepHours(inputs.sleepHours) * WEIGHTS.sleepHours +
    normalizeQuality(inputs.sleepQuality) * WEIGHTS.sleepQuality +
    normalizeEnergy(inputs.energy) * WEIGHTS.energy +
    normalizeInverse(inputs.soreness) * WEIGHTS.soreness +
    normalizeInverse(inputs.stress) * WEIGHTS.stress;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  let volumeModifier: number;
  let label: string;
  let recommendation: string;

  if (score >= 85) {
    volumeModifier = 1.20;
    label = 'Excellent';
    recommendation = "You're fully recovered. Push hard today — add volume or weight.";
  } else if (score >= 70) {
    volumeModifier = 1.10;
    label = 'Good';
    recommendation = "Feeling good. Stick to your plan and push when it feels right.";
  } else if (score >= 50) {
    volumeModifier = 1.00;
    label = 'Moderate';
    recommendation = "Average recovery. Train as planned but don't force PRs today.";
  } else if (score >= 35) {
    volumeModifier = 0.80;
    label = 'Low';
    recommendation = "Feeling rough. Drop volume by ~20% and prioritize form over load.";
  } else {
    volumeModifier = 0.60;
    label = 'Poor';
    recommendation = "Poor recovery. Consider active recovery or rest — forced training today risks injury.";
  }

  return { recoveryScore: score, volumeModifier, label, recommendation };
}

/** Maps a 0–100 recovery score to the human-readable label returned by calculateRecovery(). */
export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  if (score >= 35) return 'Low';
  return 'Poor';
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 §5 ADD #3 — ADAPTIVE REAL-LIFE MODE
//
// The existing recovery engine handles "I'm tired today." But the V2 plan
// correctly noted that fitness apps fail when life happens — illness,
// travel, missed days. Most apps respond with guilt mechanics ("you broke
// your streak!"). Atleato responds by adapting WITHOUT guilt.
//
// Inputs: lifestyle disruption flags + day-gap since last workout.
// Output: a context-aware program adjustment + a sane coach message.
// ═══════════════════════════════════════════════════════════════════════════

export type LifeContext =
  | 'normal'
  | 'illness'        // user marked themselves sick / off
  | 'travel'         // away from usual gym
  | 'busy_week'     // self-flagged "too much going on"
  | 'sleep_debt'     // multi-day sub-5h sleep streak
  | 'returning';     // returning after 4+ day gap

export interface AdaptiveContextInput {
  daysSinceLastWorkout: number;
  recoveryScore: number;          // most recent score from calculateRecovery()
  sleepDebtNights: number;        // consecutive nights < 5h sleep
  userFlag?: 'sick' | 'travel' | 'busy' | null;  // user can self-flag in /recovery-checkin
}

export interface AdaptiveResult {
  context: LifeContext;
  volumeModifier: number;         // applied AFTER the recovery-engine modifier
  programAdjustment: string;      // human-readable change
  coachMessage: string;           // shown to user; no guilt, no streak-shaming
  shouldOfferDeload: boolean;
  shouldOfferRestDay: boolean;
}

export function adaptToLife(input: AdaptiveContextInput): AdaptiveResult {
  // Priority order: illness > travel > sleep debt > returning > busy > normal
  // Each higher-priority context overrides milder ones.

  if (input.userFlag === 'sick') {
    return {
      context: 'illness',
      volumeModifier: 0.0,        // train zero — illness compounds
      programAdjustment: 'Today off. Hydrate. Sleep. Streak stays — illness is not a missed day.',
      coachMessage: "Sick? Don't train. The body adapts in recovery, not while fighting an infection. We'll resume the day after symptoms clear. Your streak is preserved.",
      shouldOfferDeload: false,
      shouldOfferRestDay: true,
    };
  }

  if (input.userFlag === 'travel') {
    return {
      context: 'travel',
      volumeModifier: 0.65,
      programAdjustment: 'Travel mode: 45-min full-body session. No gym needed — bodyweight + hotel-room work.',
      coachMessage: "On the road. Today's a 4-exercise bodyweight session that takes 35 min. Squats, push-ups, rows on a sturdy table, plank. No gym, no excuses, no guilt.",
      shouldOfferDeload: false,
      shouldOfferRestDay: false,
    };
  }

  if (input.sleepDebtNights >= 3 || input.userFlag === 'busy') {
    return {
      context: input.userFlag === 'busy' ? 'busy_week' : 'sleep_debt',
      volumeModifier: 0.70,
      programAdjustment: 'Compressed: only the top 3 compound lifts. 40-min session, no accessories.',
      coachMessage: input.userFlag === 'busy'
        ? "Busy week. Today's a 40-min priority session — just the lifts that move the needle. Skip the accessories. We'll catch up next week."
        : "Multi-night sleep debt. Volume drops 30% so we preserve the lifts without dipping into recovery. Sleep tonight = full session tomorrow.",
      shouldOfferDeload: false,
      shouldOfferRestDay: false,
    };
  }

  if (input.daysSinceLastWorkout >= 4) {
    return {
      context: 'returning',
      volumeModifier: 0.75,
      programAdjustment: 'Return week: -25% volume, +1 warmup set per lift. Easing back, not punishing.',
      coachMessage: `Welcome back — ${input.daysSinceLastWorkout} days off. Today is a re-entry session: lighter loads, more warmup, no PR attempts. We don't punish missed days; we restart well. Tomorrow we ramp.`,
      shouldOfferDeload: false,
      shouldOfferRestDay: false,
    };
  }

  // Normal day — defer entirely to the recovery-score-based modifier
  return {
    context: 'normal',
    volumeModifier: 1.0,
    programAdjustment: 'Standard programmed session.',
    coachMessage: '',
    shouldOfferDeload: false,
    shouldOfferRestDay: false,
  };
}

/**
 * Compose the recovery-engine modifier with the adaptive-context modifier.
 * Both are multiplicative — e.g., recovery 0.8 × travel 0.65 = 0.52 final.
 * Floor at 0.0 (zero training) and ceiling at 1.2 to prevent over-prescription.
 */
export function combinedVolumeModifier(
  recovery: RecoveryResult,
  adaptive: AdaptiveResult,
): number {
  return Math.max(0, Math.min(1.2, recovery.volumeModifier * adaptive.volumeModifier));
}
