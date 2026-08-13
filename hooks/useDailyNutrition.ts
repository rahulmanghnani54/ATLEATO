import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

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

type NutritionLogRow = Database['public']['Tables']['nutrition_logs']['Row'];
type NutritionLogPartial = Pick<
  NutritionLogRow,
  'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'meal_type'
>;

export interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  byMeal: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  };
}

const EMPTY: DailyTotals = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  byMeal: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
};

export function useDailyNutrition(date: Date) {
  const user = useAuthStore((s) => s.user);
  const dateStr = format(date, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['nutrition', user?.id, dateStr],
    queryFn: async (): Promise<DailyTotals> => {
      if (!user) return EMPTY;

      // Home renders Skeletons off this query's pending state, so a timeout must
      // RESOLVE (as no rows → EMPTY, i.e. zeros) rather than reject: an unsettled
      // promise is an eternal skeleton, and a rejection here would only be
      // re-thrown as an unhandled query error. A genuine Postgrest `error` still
      // throws below so `retry: 1` gets its second attempt.
      const { data: rawData, error } = await withTimeout(
        supabase
          .from('nutrition_logs')
          .select('calories, protein_g, carbs_g, fat_g, meal_type')
          .eq('user_id', user.id)
          .eq('date', dateStr),
        'Nutrition',
      ).catch(() => ({ data: null, error: null }));

      if (error) throw error;
      const data = rawData as NutritionLogPartial[] | null;
      if (!data || data.length === 0) return EMPTY;

      const totals = data.reduce(
        (acc, row) => ({
          calories: acc.calories + (row.calories ?? 0),
          proteinG: acc.proteinG + (row.protein_g ?? 0),
          carbsG: acc.carbsG + (row.carbs_g ?? 0),
          fatG: acc.fatG + (row.fat_g ?? 0),
          byMeal: {
            ...acc.byMeal,
            [row.meal_type]:
              (acc.byMeal[row.meal_type as keyof typeof acc.byMeal] ?? 0) +
              (row.calories ?? 0),
          },
        }),
        { ...EMPTY, byMeal: { ...EMPTY.byMeal } }
      );

      return totals;
    },
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });
}
