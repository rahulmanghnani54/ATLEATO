import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  analyzeProgression,
  parseRepsRange,
  type ExerciseHistory,
  type ProgressionSuggestion,
} from '@/lib/progressionEngine';
import type { Exercise } from '@/constants/experts';

// Fetch the last N sessions of exercise_sets for a given exercise
export function useExerciseHistory(exerciseName: string, limit = 5) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['exercise_history', user?.id, exerciseName],
    queryFn: async (): Promise<ExerciseHistory> => {
      if (!user) return { exerciseName, sessions: [] };

      // Get exercise sets grouped by workout log
      const { data, error } = await supabase
        .from('exercise_sets')
        .select('set_number, reps, weight_kg, rpe, is_warmup, workout_log_id, workout_logs(date)')
        .eq('user_id', user.id)
        .eq('exercise_name', exerciseName)
        .order('workout_log_id', { ascending: false })
        .limit(limit * 10); // fetch enough rows for up to N sessions

      if (error) throw error;

      // Group by workout_log_id → session
      const sessionMap = new Map<string, { date: string; sets: any[] }>();
      for (const row of data ?? []) {
        const logId = row.workout_log_id;
        const date = (row as any).workout_logs?.date ?? '';
        if (!sessionMap.has(logId)) sessionMap.set(logId, { date, sets: [] });
        sessionMap.get(logId)!.sets.push({
          setNumber: row.set_number,
          reps: row.reps ?? 0,
          weightKg: row.weight_kg ?? 0,
          rpe: row.rpe ?? undefined,
          isWarmup: row.is_warmup,
        });
      }

      const sessions = Array.from(sessionMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-limit);

      return { exerciseName, sessions };
    },
    enabled: !!user && !!exerciseName,
    staleTime: 5 * 60 * 1000,
  });
}

// Compute a suggestion for one exercise using history
export function useProgressionSuggestion(exercise: Exercise): ProgressionSuggestion | null {
  const { data: history } = useExerciseHistory(exercise.name);
  if (!history || history.sessions.length === 0) return null;
  const [low, high] = parseRepsRange(exercise.reps);
  return analyzeProgression(history, low, high);
}

// Save a progression suggestion to Supabase
export function useSaveProgression() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      exerciseName: string;
      currentWeight: number;
      suggestedWeight: number;
      reason: string;
      programId: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase.from('progression_suggestions') as any).insert({
        user_id: user.id,
        exercise_name: params.exerciseName,
        program_id: params.programId,
        suggested_weight_kg: params.suggestedWeight,
        current_weight_kg: params.currentWeight,
        reason: params.reason,
        date: new Date().toISOString().slice(0, 10),
        applied: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progression_suggestions'] });
    },
  });
}

// Fetch all pending progression suggestions for the user
export function usePendingProgressions(programId: string) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['progression_suggestions', user?.id, programId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('progression_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .eq('program_id', programId)
        .eq('applied', false)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
