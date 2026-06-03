/**
 * Avatar Engine
 *
 * Derives a visual avatar state from user stats.
 * No 3D — emoji composition with persona color glow.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnergyLevel = 'dormant' | 'warming' | 'active' | 'fire' | 'legend';
export type BodyStage   = 'beginner' | 'developing' | 'athletic' | 'elite';

export interface AvatarStats {
  streak: number;           // current streak days
  totalWorkouts: number;    // all-time completed workouts
  xp: number;               // current XP
  weightKg?: number;        // current body weight
  goalWeightKg?: number;    // target weight from profile
}

export interface AvatarState {
  energyLevel: EnergyLevel;
  bodyStage: BodyStage;
  title: string;
  description: string;
  emoji: string;            // primary display emoji
  color: string;            // glow / accent color
  motivationLine: string;
}

// ─── Energy Level ─────────────────────────────────────────────────────────────
// Based on current streak

function getEnergyLevel(streak: number): EnergyLevel {
  if (streak === 0)        return 'dormant';
  if (streak < 7)          return 'warming';
  if (streak < 30)         return 'active';
  if (streak < 90)         return 'fire';
  return 'legend';
}

const ENERGY_EMOJIS: Record<EnergyLevel, string> = {
  dormant:  '💤',
  warming:  '🌱',
  active:   '⚡',
  fire:     '🔥',
  legend:   '👑',
};

const ENERGY_COLORS: Record<EnergyLevel, string> = {
  dormant:  '#555566',
  warming:  '#39e08a',
  active:   '#dfff1f',
  fire:     '#ff8c3a',
  legend:   '#dfff1f',
};

// ─── Body Stage ───────────────────────────────────────────────────────────────
// Based on total workouts completed

function getBodyStage(totalWorkouts: number): BodyStage {
  if (totalWorkouts < 10)  return 'beginner';
  if (totalWorkouts < 30)  return 'developing';
  if (totalWorkouts < 60)  return 'athletic';
  return 'elite';
}

const STAGE_TITLES: Record<BodyStage, string> = {
  beginner:   'Just Getting Started',
  developing: 'Building Foundation',
  athletic:   'Athletic Build',
  elite:      'Elite Physique',
};

const STAGE_DESCRIPTIONS: Record<BodyStage, string> = {
  beginner:   'Every rep is building new habits. Keep showing up.',
  developing: 'You can see the changes. Your body is adapting.',
  athletic:   'Strength and shape are both visible now. Keep pushing.',
  elite:      'Elite-level consistency and results. Respect.',
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function getAvatarState(stats: AvatarStats): AvatarState {
  const energyLevel = getEnergyLevel(stats.streak);
  const bodyStage   = getBodyStage(stats.totalWorkouts);

  const emoji = ENERGY_EMOJIS[energyLevel];
  const color = ENERGY_COLORS[energyLevel];

  const title       = STAGE_TITLES[bodyStage];
  const description = STAGE_DESCRIPTIONS[bodyStage];

  const motivationLines: Record<EnergyLevel, string> = {
    dormant:  'The hardest session is the one you come back to. Start today.',
    warming:  `${stats.streak} day${stats.streak !== 1 ? 's' : ''} in. You've broken inertia. Keep going.`,
    active:   `${stats.streak}-day streak. This is becoming who you are.`,
    fire:     `${stats.streak} days straight. You're in elite territory now.`,
    legend:   `${stats.streak} days. A living legend. The gym is your second home.`,
  };

  return {
    energyLevel,
    bodyStage,
    title,
    description,
    emoji,
    color,
    motivationLine: motivationLines[energyLevel],
  };
}

/**
 * Returns what stats thresholds the avatar changes at next,
 * useful for showing progress indicators in the UI.
 */
export function getNextAvatarMilestones(stats: AvatarStats): {
  nextStreakMilestone: number;
  nextWorkoutMilestone: number;
  streakNeeded: number;
  workoutsNeeded: number;
} {
  const STREAK_MILESTONES = [1, 7, 30, 90];
  const WORKOUT_MILESTONES = [10, 30, 60];

  const nextStreak = STREAK_MILESTONES.find((m) => m > stats.streak) ?? 90;
  const nextWorkout = WORKOUT_MILESTONES.find((m) => m > stats.totalWorkouts) ?? 60;

  return {
    nextStreakMilestone:  nextStreak,
    nextWorkoutMilestone: nextWorkout,
    streakNeeded:         Math.max(0, nextStreak - stats.streak),
    workoutsNeeded:       Math.max(0, nextWorkout - stats.totalWorkouts),
  };
}
