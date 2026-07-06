import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

type WaterLogInsert = Database['public']['Tables']['water_logs']['Insert'];

const GLASS_ML = 250;
const DAILY_GOAL_ML = 2000;

export function useWaterLog(date: Date) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const dateStr = format(date, 'yyyy-MM-dd');
  const queryKey = ['water', user?.id, dateStr];

  const { data: totalMl = 0, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return 0;
      const { data: rawData } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', user.id)
        .eq('date', dateStr);
      const data = rawData as Pick<Database['public']['Tables']['water_logs']['Row'], 'amount_ml'>[] | null;
      return (data ?? []).reduce((sum, r) => sum + r.amount_ml, 0);
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const addGlass = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const payload: WaterLogInsert = {
        user_id: user.id,
        date: dateStr,
        amount_ml: GLASS_ML,
      };
      // 8s cap so a stalled insert (auth-lock, network) can't leave the button
      // spinning with no outcome.
      const { error } = (await Promise.race([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('water_logs') as any).insert(payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timed out — check your connection.')), 8000),
        ),
      ])) as { error: any };
      if (error) throw error;
    },
    // Optimistic: bump the count instantly so the button always FEELS like it
    // worked; roll back + surface the error if the write actually fails.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<number>(queryKey) ?? 0;
      queryClient.setQueryData<number>(queryKey, prev + GLASS_ML);
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(queryKey, ctx.prev);
      if (__DEV__) console.warn('[useWaterLog] insert failed:', err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const glasses = Math.floor(totalMl / GLASS_ML);
  const goalGlasses = Math.floor(DAILY_GOAL_ML / GLASS_ML);

  return {
    totalMl, glasses, goalGlasses, isLoading, refetch,
    addGlass: addGlass.mutate,
    addGlassIsPending: addGlass.isPending,
    addGlassError: addGlass.isError,
  };
}
