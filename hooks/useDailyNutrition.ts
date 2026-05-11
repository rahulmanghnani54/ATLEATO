import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

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

      const { data: rawData, error } = await supabase
        .from('nutrition_logs')
        .select('calories, protein_g, carbs_g, fat_g, meal_type')
        .eq('user_id', user.id)
        .eq('date', dateStr);

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
  });
}
