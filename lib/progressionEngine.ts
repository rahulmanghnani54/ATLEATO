export interface ExerciseHistory {
  exerciseName: string;
  sessions: SessionData[];
}

export interface SessionData {
  date: string;
  sets: SetData[];
}

export interface SetData {
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe?: number;
  isWarmup: boolean;
}

export interface ProgressionSuggestion {
  exerciseName: string;
  currentWeightKg: number;
  suggestedWeightKg: number;
  suggestedReps: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export type ProgressionType = 'increase_weight' | 'increase_reps' | 'maintain' | 'deload';

// Increment sizes by muscle group — lower body lifts use larger jumps
const LOWER_BODY_EXERCISES = ['squat', 'deadlift', 'leg press', 'hack squat', 'lunge', 'leg curl', 'leg extension', 'calf'];
const LARGE_INCREMENT = 2.5;
const SMALL_INCREMENT = 1.25;

function isLowerBody(name: string): boolean {
  return LOWER_BODY_EXERCISES.some((kw) => name.toLowerCase().includes(kw));
}

function workingSetAvg(sets: SetData[]): { avgWeight: number; avgReps: number; avgRpe: number; count: number } {
  const working = sets.filter((s) => !s.isWarmup && s.weightKg > 0 && s.reps > 0);
  if (working.length === 0) return { avgWeight: 0, avgReps: 0, avgRpe: 7, count: 0 };
  const avgWeight = working.reduce((sum, s) => sum + s.weightKg, 0) / working.length;
  const avgReps = working.reduce((sum, s) => sum + s.reps, 0) / working.length;
  const avgRpe = working.reduce((sum, s) => sum + (s.rpe ?? 7), 0) / working.length;
  return { avgWeight, avgReps, avgRpe, count: working.length };
}

export function analyzeProgression(
  history: ExerciseHistory,
  targetRepsLow: number,
  targetRepsHigh: number,
): ProgressionSuggestion | null {
  const { sessions, exerciseName } = history;
  if (sessions.length === 0) return null;

  // Sort ascending (oldest first)
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-3); // last 3 sessions

  const lastSession = recent[recent.length - 1];
  const { avgWeight, avgReps, avgRpe, count } = workingSetAvg(lastSession.sets);
  if (count === 0) return null;

  const increment = isLowerBody(exerciseName) ? LARGE_INCREMENT : SMALL_INCREMENT;
  const currentWeight = avgWeight;

  // Check if all sets hit top of rep range at manageable RPE
  const hitTopRange = avgReps >= targetRepsHigh && avgRpe <= 8.5;
  // Check if user stayed in range for 2+ consecutive sessions
  const twoSessions = recent.length >= 2;
  const prevSession = twoSessions ? recent[recent.length - 2] : null;
  const prevStats = prevSession ? workingSetAvg(prevSession.sets) : null;
  const prevHitRange = prevStats ? prevStats.avgReps >= targetRepsLow && prevStats.avgRpe <= 9 : false;

  // Check if below rep range (failed session)
  const failedSession = avgReps < targetRepsLow && avgRpe >= 9;

  // Deload: RPE consistently >= 9.5 for last 2 sessions
  const prevHighRpe = prevStats ? prevStats.avgRpe >= 9.5 : false;
  if (avgRpe >= 9.5 && prevHighRpe) {
    return {
      exerciseName,
      currentWeightKg: currentWeight,
      suggestedWeightKg: Math.max(currentWeight - increment * 2, increment),
      suggestedReps: `${targetRepsLow}-${targetRepsHigh}`,
      confidence: 'high',
      reason: `RPE has been very high (${avgRpe.toFixed(1)}) for 2 sessions. Deload by ${increment * 2}kg to recover and rebuild.`,
    };
  }

  // Increase weight: hit top of range and RPE manageable, for 2 consecutive sessions
  if (hitTopRange && prevHitRange) {
    return {
      exerciseName,
      currentWeightKg: currentWeight,
      suggestedWeightKg: currentWeight + increment,
      suggestedReps: `${targetRepsLow}-${targetRepsHigh}`,
      confidence: 'high',
      reason: `You've hit ${Math.round(avgReps)} reps at RPE ${avgRpe.toFixed(1)} for 2+ sessions. Add ${increment}kg next time.`,
    };
  }

  // Increase weight with medium confidence: hit top of range once at low RPE
  if (hitTopRange && avgRpe <= 7) {
    return {
      exerciseName,
      currentWeightKg: currentWeight,
      suggestedWeightKg: currentWeight + increment,
      suggestedReps: `${targetRepsLow}-${targetRepsHigh}`,
      confidence: 'medium',
      reason: `Great session — ${Math.round(avgReps)} reps at RPE ${avgRpe.toFixed(1)}. Try ${increment}kg more, but aim to confirm over 2 sessions.`,
    };
  }

  // Maintain: in rep range, RPE reasonable
  if (avgReps >= targetRepsLow && avgReps <= targetRepsHigh && !failedSession) {
    return {
      exerciseName,
      currentWeightKg: currentWeight,
      suggestedWeightKg: currentWeight,
      suggestedReps: `${targetRepsLow}-${targetRepsHigh}`,
      confidence: 'medium',
      reason: `In the target range (${Math.round(avgReps)} reps, RPE ${avgRpe.toFixed(1)}). Keep the same weight and aim for the top of the range.`,
    };
  }

  // Failed session: stay at same weight or reduce
  if (failedSession) {
    return {
      exerciseName,
      currentWeightKg: currentWeight,
      suggestedWeightKg: currentWeight,
      suggestedReps: `${targetRepsLow}-${targetRepsHigh}`,
      confidence: 'high',
      reason: `Tough session (${Math.round(avgReps)} reps, RPE ${avgRpe.toFixed(1)}). Keep the same weight and focus on form and recovery.`,
    };
  }

  return null;
}

// Parse a reps string like "8-12" or "10" into [low, high]
export function parseRepsRange(repsStr: string): [number, number] {
  const parts = repsStr.split('-').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  if (parts.length === 2) return [parts[0], parts[1]];
  if (parts.length === 1) return [parts[0], parts[0]];
  return [8, 12]; // fallback
}
