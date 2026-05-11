import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format, isToday } from 'date-fns';
import { CalorieRing, MacroBar, DateNavigator, Card, SkeletonLoader } from '@/components/ui';
import { RecoveryBadge } from '@/components/ui/RecoveryBadge';
import { WaterTracker } from '@/components/dashboard/WaterTracker';
import { TodayWorkoutCard } from '@/components/dashboard/TodayWorkoutCard';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useRecoveryScore } from '@/hooks/useRecoveryScore';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function Dashboard() {
  const router = useRouter();
  const [date, setDate] = useState(new Date());
  const profile = useAuthStore((s) => s.profile);
  const { data: nutrition, isLoading: nutritionLoading, refetch } = useDailyNutrition(date);
  const { glasses, goalGlasses, totalMl, addGlass, isLoading: waterLoading, refetch: refetchWater } = useWaterLog(date);
  const { data: recoveryCheckin } = useRecoveryScore();
  const { data: todayRecovery } = useTodayRecovery();
  const hasCheckedInToday = !!todayRecovery;

  const goal = profile?.tdee ?? 2000;
  const proteinGoal = profile?.protein_g ?? 150;
  const carbsGoal = profile?.carbs_g ?? 200;
  const fatGoal = profile?.fat_g ?? 65;

  const consumed = Math.round(nutrition?.calories ?? 0);
  const protein = Math.round(nutrition?.proteinG ?? 0);
  const carbs = Math.round(nutrition?.carbsG ?? 0);
  const fat = Math.round(nutrition?.fatG ?? 0);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Refresh data when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchWater();
    }, [refetch, refetchWater])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={nutritionLoading || waterLoading}
            onRefresh={() => { refetch(); refetchWater(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.greetingRow}>
            <Text style={styles.greeting}>
              {greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
            </Text>
            {recoveryCheckin?.recovery_score != null && (
              <RecoveryBadge score={recoveryCheckin.recovery_score} size="sm" />
            )}
          </View>
          <DateNavigator date={date} onDateChange={setDate} />
        </View>

        {/* Calorie Ring + Macros */}
        <Card style={styles.calorieCard}>
          <View style={styles.ringRow}>
            <CalorieRing consumed={consumed} goal={goal} size={160} />
            <View style={styles.macros}>
              {nutritionLoading ? (
                <>
                  <SkeletonLoader height={14} style={{ marginBottom: 12 }} />
                  <SkeletonLoader height={14} style={{ marginBottom: 12 }} />
                  <SkeletonLoader height={14} />
                </>
              ) : (
                <>
                  <MacroBar label="Protein" consumed={protein} goal={proteinGoal} color="#3b82f6" />
                  <MacroBar label="Carbs" consumed={carbs} goal={carbsGoal} color="#f59e0b" />
                  <MacroBar label="Fat" consumed={fat} goal={fatGoal} color="#ef4444" />
                </>
              )}
            </View>
          </View>

          {/* Summary row */}
          <View style={styles.summaryRow}>
            {[
              { label: 'Eaten', value: consumed, color: Colors.primary },
              { label: 'Goal', value: goal, color: Colors.textSecondary },
              { label: 'Remaining', value: Math.max(goal - consumed, 0), color: Colors.success },
            ].map((item) => (
              <View key={item.label} style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
                <Text style={styles.summaryLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Recovery check-in prompt */}
        {!hasCheckedInToday && (
          <TouchableOpacity onPress={() => router.push('/recovery-checkin' as any)}>
            <Card style={styles.checkinCard}>
              <View style={styles.checkinRow}>
                <Text style={styles.checkinEmoji}>🌅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkinTitle}>Morning Check-In</Text>
                  <Text style={styles.checkinSub}>Log your recovery to optimise today's training</Text>
                </View>
                <Text style={styles.checkinArrow}>›</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* Today's Workout */}
        <TodayWorkoutCard />

        {/* Water Tracker */}
        <Card style={styles.section}>
          <WaterTracker
            glasses={glasses}
            goalGlasses={goalGlasses}
            totalMl={totalMl}
            onAddGlass={addGlass}
          />
        </Card>

        {/* Meal breakdown summary */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isToday(date) ? "Today's Meals" : format(date, 'MMM d') + "'s Meals"}
          </Text>
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => {
            const kcal = Math.round(nutrition?.byMeal[meal] ?? 0);
            return (
              <View key={meal} style={styles.mealRow}>
                <Text style={styles.mealName}>
                  {meal.charAt(0).toUpperCase() + meal.slice(1)}
                </Text>
                <Text style={[styles.mealKcal, kcal === 0 && styles.mealEmpty]}>
                  {kcal > 0 ? `${kcal} kcal` : 'Not logged'}
                </Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: { marginBottom: 4 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  greeting: { ...Typography.h3 },
  calorieCard: { padding: Spacing.md },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  macros: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  summaryLabel: { ...Typography.caption, marginTop: 2 },
  section: { padding: Spacing.md },
  sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.sm },
  mealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mealName: { ...Typography.body },
  mealKcal: { ...Typography.bodyMedium, color: Colors.text },
  mealEmpty: { color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
  checkinCard: { padding: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  checkinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkinEmoji: { fontSize: 24 },
  checkinTitle: { ...Typography.bodyMedium },
  checkinSub: { ...Typography.caption, color: Colors.textSecondary },
  checkinArrow: { fontSize: 22, color: Colors.textTertiary, fontFamily: 'Inter_400Regular' },
});
