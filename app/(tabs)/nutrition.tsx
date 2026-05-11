import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { DateNavigator, Card } from '@/components/ui';
import { FoodSearchModal } from '@/components/nutrition/FoodSearchModal';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { MealType } from '@/types/index';

const MEALS: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
  { key: 'snack', label: 'Snacks', icon: '🍎' },
];

export default function Nutrition() {
  const [date, setDate] = useState(new Date());
  const [activeMeal, setActiveMeal] = useState<MealType | null>(null);
  const profile = useAuthStore((s) => s.profile);
  const { data: nutrition, refetch } = useDailyNutrition(date);
  const dateStr = format(date, 'yyyy-MM-dd');
  const goal = profile?.tdee ?? 2000;
  const consumed = Math.round(nutrition?.calories ?? 0);
  const remaining = Math.max(goal - consumed, 0);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <DateNavigator date={date} onDateChange={setDate} />

        {/* Daily summary bar */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: Colors.primary }]}>{consumed}</Text>
              <Text style={styles.summaryLabel}>Eaten</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: Colors.success }]}>{remaining}</Text>
              <Text style={styles.summaryLabel}>Remaining</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNum}>{goal}</Text>
              <Text style={styles.summaryLabel}>Goal</Text>
            </View>
          </View>
          {/* Macro mini-bars */}
          <View style={styles.macroRow}>
            {[
              { label: 'P', value: Math.round(nutrition?.proteinG ?? 0), goal: profile?.protein_g ?? 150, color: '#3b82f6' },
              { label: 'C', value: Math.round(nutrition?.carbsG ?? 0), goal: profile?.carbs_g ?? 200, color: '#f59e0b' },
              { label: 'F', value: Math.round(nutrition?.fatG ?? 0), goal: profile?.fat_g ?? 65, color: '#ef4444' },
            ].map((m) => (
              <View key={m.label} style={styles.macroItem}>
                <Text style={styles.macroLabel}>{m.label}</Text>
                <View style={styles.macroTrack}>
                  <View style={[styles.macroFill, { width: `${Math.min((m.value / (m.goal ?? 1)) * 100, 100)}%` as any, backgroundColor: m.color }]} />
                </View>
                <Text style={[styles.macroVal, { color: m.color }]}>{m.value}g</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Meal sections */}
        {MEALS.map((meal) => {
          const mealKcal = Math.round(nutrition?.byMeal[meal.key] ?? 0);
          return (
            <Card key={meal.key} style={styles.mealCard}>
              <TouchableOpacity
                style={styles.mealHeader}
                onPress={() => setActiveMeal(meal.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.mealIcon}>{meal.icon}</Text>
                <Text style={styles.mealLabel}>{meal.label}</Text>
                <Text style={[styles.mealKcal, mealKcal > 0 && { color: Colors.primary }]}>
                  {mealKcal > 0 ? `${mealKcal} kcal` : 'Add food'}
                </Text>
                <Text style={styles.addBtn}>+</Text>
              </TouchableOpacity>
            </Card>
          );
        })}
      </ScrollView>

      {/* Food search modal */}
      {activeMeal && (
        <FoodSearchModal
          visible={!!activeMeal}
          onClose={() => setActiveMeal(null)}
          mealType={activeMeal}
          date={dateStr}
          onFoodLogged={() => { refetch(); setActiveMeal(null); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  summaryCard: { padding: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: Spacing.md },
  summaryItem: { alignItems: 'center' },
  summaryNum: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text },
  summaryLabel: Typography.caption,
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  macroRow: { gap: Spacing.sm },
  macroItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  macroLabel: { width: 16, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  macroTrack: { flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },
  macroVal: { width: 36, fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  mealCard: { padding: Spacing.md },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mealIcon: { fontSize: 20 },
  mealLabel: { ...Typography.bodyMedium, flex: 1 },
  mealKcal: { ...Typography.caption, color: Colors.textSecondary },
  addBtn: { fontSize: 22, color: Colors.primary, fontFamily: 'Inter_700Bold', paddingLeft: 4 },
});
