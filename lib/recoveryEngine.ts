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
