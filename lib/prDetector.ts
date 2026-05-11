import { supabase } from '@/lib/supabase';

function epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface DetectedPR {
  exerciseName: string;
  weightKg: number;
  reps: number;
  oneRepMaxKg: number;
}

export async function detectAndSavePRs(
  userId: string,
  workoutLogId: string,
): Promise<DetectedPR[]> {
  // Fetch sets from this workout
  const { data: newSets, error } = await supabase
    .from('exercise_sets')
    .select('exercise_name, weight_kg, reps, is_warmup')
    .eq('workout_log_id', workoutLogId)
    .eq('user_id', userId);

  if (error || !newSets) return [];

  const workingSets = newSets.filter((s) => !s.is_warmup && s.weight_kg > 0 && s.reps > 0);

  const detectedPRs: DetectedPR[] = [];

  for (const set of workingSets) {
    const new1RM = epley1RM(set.weight_kg!, set.reps!);
    const exerciseName = set.exercise_name;

    // Get existing best 1RM for this exercise
    const { data: existing } = await supabase
      .from('personal_records')
      .select('one_rep_max_kg')
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
      .order('one_rep_max_kg', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prev1RM = existing?.one_rep_max_kg ?? 0;

    if (new1RM > prev1RM) {
      // New PR!
      await (supabase.from('personal_records') as any).insert({
        user_id: userId,
        exercise_name: exerciseName,
        weight_kg: set.weight_kg,
        reps: set.reps,
        one_rep_max_kg: new1RM,
        achieved_at: new Date().toISOString(),
      });

      detectedPRs.push({
        exerciseName,
        weightKg: set.weight_kg!,
        reps: set.reps!,
        oneRepMaxKg: new1RM,
      });

      // Award first_pr achievement if first PR ever
      if (prev1RM === 0) {
        await (supabase.from('user_achievements') as any)
          .upsert({ user_id: userId, achievement_key: 'first_pr' }, { onConflict: 'user_id,achievement_key', ignoreDuplicates: true });
      }
    }
  }

  return detectedPRs;
}
