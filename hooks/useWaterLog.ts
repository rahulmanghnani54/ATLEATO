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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('water_logs') as any).insert(payload);
      if (error) throw error;
    },
    onError: (err: Error) => {
      console.warn('[useWaterLog] insert failed:', err.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const glasses = Math.floor(totalMl / GLASS_ML);
  const goalGlasses = Math.floor(DAILY_GOAL_ML / GLASS_ML);

  return { totalMl, glasses, goalGlasses, isLoading, addGlass: addGlass.mutate, refetch };
}
