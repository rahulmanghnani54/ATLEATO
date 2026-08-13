import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { calculateRecovery, type RecoveryInputs } from '@/lib/recoveryEngine';

// Time-limit any Supabase call so a stalled request can't leave a dashboard
// stat spinning forever (same pattern as useDashboardStats / useProgressStats).
async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    p as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your connection.`)), 8000),
    ),
  ]);
}

export function useTodayRecovery() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['recovery', user?.id, 'today'],
    queryFn: async () => {
      if (!user) return null;
      const today = new Date().toISOString().slice(0, 10);
      // The workout lobby hides its recovery block while this is pending, so a
      // stall must resolve to "no check-in" instead of hiding it forever.
      const { data, error } = await withTimeout(
        supabase
          .from('recovery_checkins')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle(),
        'Recovery check-in',
      ).catch(() => ({ data: null, error: null }));
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSubmitRecovery() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  return useMutation({
    mutationFn: async (inputs: RecoveryInputs) => {
      if (!user) throw new Error('Not authenticated');
      const result = calculateRecovery(inputs);
      const today = new Date().toISOString().slice(0, 10);

      const payload = {
        user_id: user.id,
        date: today,
        sleep_hours: inputs.sleepHours,
        sleep_quality: inputs.sleepQuality,
        soreness: inputs.soreness,
        energy: inputs.energy,
        stress: inputs.stress,
        recovery_score: result.recoveryScore,
        volume_modifier: result.volumeModifier,
      };

      const { error } = await (supabase.from('recovery_checkins') as any)
        .upsert(payload, { onConflict: 'user_id,date' });

      if (error) throw error;
      return result;
    },
    onSuccess: (_result, _inputs, _context) => {
      const today = new Date().toISOString().slice(0, 10);
      queryClient.invalidateQueries({ queryKey: ['recovery', user?.id, 'today'] });
      queryClient.invalidateQueries({ queryKey: ['recovery_checkins', user?.id, today] });
    },
  });
}
