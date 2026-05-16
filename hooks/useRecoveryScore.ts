import { useQuery } from '@tanstack/react-query';
import { subDays, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

type RecoveryCheckinRow = Database['public']['Tables']['recovery_checkins']['Row'];

export function useRecoveryScore() {
  const user = useAuthStore((s) => s.user);
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['recovery_checkins', user?.id, yesterday],
    queryFn: async (): Promise<RecoveryCheckinRow | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('recovery_checkins')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', yesterday)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}
