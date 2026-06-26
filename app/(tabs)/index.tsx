/**
 * Home Dashboard — Direction C (Nike/Telegram aesthetic)
 *
 * The reference screen for the v1 theme migration. Every other tab/screen
 * should follow this pattern:
 *   HeroBlock (edge-to-edge persona gradient + day/name)
 *   3-up Stat row (the user's headline metrics)
 *   2–3 RowCard rows (Lucide icons + title + meta, tappable)
 *   AnchorCTA pinned to bottom (persona-colored primary action)
 *
 * v0 of this file backed up to index-v0.tsx.bak in case we want the
 * Apple-Glass version back.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Dumbbell, Lightbulb, Flame, Trophy, Activity } from 'lucide-react-native';

import { HeroBlock, Stat, RowCard, AnchorCTA } from '@/components/ui/c';
import { Colors, Spacing, Fonts, Radius } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak, useThisWeekVolume, useProgramSchedule } from '@/hooks/useDashboardStats';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { personaFromProgramId } from '@/lib/personaTheme';

export default function Dashboard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const { data: streak = 0, refetch: refetchStreak } = useWorkoutStreak();
  const { data: weekKg = 0, refetch: refetchWeek } = useThisWeekVolume();
  const { data: schedule } = useProgramSchedule();
  const today = schedule?.find((d) => d.isToday);

  // Today's nutrition (eaten) vs the profile's goals — surfaced on Home so the
  // user sees their daily macros + targets at a glance, tap to log.
  const [todayDate] = useState(() => new Date());
  const { data: nutrition, refetch: refetchNutrition } = useDailyNutrition(todayDate);
  const calEaten = Math.round(nutrition?.calories ?? 0);
  const calGoal = profile?.tdee ?? 2000;
  const macros = [
    { label: 'PROTEIN', eaten: Math.round(nutrition?.proteinG ?? 0), goal: profile?.protein_g ?? 150, color: '#3b82f6' },
    { label: 'CARBS',   eaten: Math.round(nutrition?.carbsG ?? 0),   goal: profile?.carbs_g ?? 200,   color: '#f59e0b' },
    { label: 'FAT',     eaten: Math.round(nutrition?.fatG ?? 0),     goal: profile?.fat_g ?? 65,      color: '#ef4444' },
  ];

  // Re-fetch streak + volume + nutrition when the user returns to this tab
  useFocusEffect(
    useCallback(() => {
      refetchStreak();
      refetchWeek();
      refetchNutrition();
    }, [refetchStreak, refetchWeek, refetchNutrition]),
  );

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Athlete';
  const todayLabel = today?.isRest
    ? `Day ${streak || 1} · Rest`
    : `Day ${streak || 1} · ${today?.workout?.focus ?? 'Train'}`;

  // Open the lobby for TODAY's workout. The lobby/session address workouts by
  // ARRAY index, so we must pass programId + today's dayIndex — otherwise the
  // lobby defaults to schedule[0] and shows a different day than Home displays.
  const openTodayWorkout = () => {
    router.push({
      pathname: '/workout-lobby',
      params: {
        programId: profile?.selected_program ?? 'cbum_evolved',
        dayIndex: String(today?.dayIndex ?? 0),
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor={persona.accent}
            colors={[persona.accent]}
            refreshing={false}
            onRefresh={() => { refetchStreak(); refetchWeek(); refetchNutrition(); }}
          />
        }
      >
        {/* ── 1. HERO BLOCK ────────────────────────────────────────── */}
        <HeroBlock
          accent={persona.accent}
          day={todayLabel}
          name={`Let's go,\n${firstName}.`}
        />

        {/* ── 2. STATS ROW (3-up) ─────────────────────────────────── */}
        <View style={styles.statsRow}>
          <Stat
            value={String(streak)}
            label="Day streak"
            accent
            accentColor={persona.accent}
          />
          <Stat
            value={weekKg >= 1 ? `${weekKg.toFixed(1)}k` : '0'}
            label="Week kg"
          />
          <Stat
            value={today?.isRest ? 'REST' : 'GO'}
            label={today?.isRest ? 'Today' : 'Train day'}
          />
        </View>

        {/* ── 2b. DAILY MACROS + GOALS ─────────────────────────────── */}
        <TouchableOpacity
          style={styles.macrosCard}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/nutrition' as any)}
        >
          <View style={styles.macrosHead}>
            <Text style={styles.macrosTitle}>Today's macros</Text>
            <Text style={[styles.macrosKcal, { color: persona.accent }]}>
              {calEaten} / {calGoal} kcal
            </Text>
          </View>
          <View style={styles.macrosRow}>
            {macros.map((m) => (
              <View key={m.label} style={styles.macroCol}>
                <Text style={styles.macroVal}>
                  {m.eaten}
                  <Text style={styles.macroGoal}>/{m.goal}g</Text>
                </Text>
                <View style={styles.macroTrack}>
                  <View
                    style={[
                      styles.macroFill,
                      { width: `${Math.min(100, (m.eaten / Math.max(m.goal, 1)) * 100)}%` as any, backgroundColor: m.color },
                    ]}
                  />
                </View>
                <Text style={styles.macroLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* ── 3. ROW CARDS ─────────────────────────────────────────── */}
        <SafeAreaView edges={['left', 'right']} style={styles.rows}>
          {!today?.isRest && (
            <RowCard
              icon={<Dumbbell size={22} color={persona.accent} />}
              iconTintColor={persona.accent}
              title={today?.workout?.name ?? "Today's Workout"}
              meta={`${today?.workout?.exercises?.length ?? 6} exercises · ${today?.workout?.estimatedMinutes ?? 55} min`}
              onPress={openTodayWorkout}
            />
          )}

          <RowCard
            icon={<Lightbulb size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Today's Tip"
            meta={`From ${persona.shortName} — expires at midnight`}
            onPress={() => router.push('/daily-tip' as any)}
          />

          <RowCard
            icon={<Activity size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Recovery check-in"
            meta="2 min · adjusts today's volume"
            onPress={() => router.push('/recovery-checkin' as any)}
          />

          <RowCard
            icon={<Trophy size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Legend progress"
            meta={`Level ${Math.floor((streak || 0) / 7) + 1} · ${streak % 7} of 7 to next freeze`}
            onPress={() => router.push('/legend-progress' as any)}
          />

          <RowCard
            icon={<Flame size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Streak calendar"
            meta={`${streak}-day streak · view full year`}
            onPress={() => router.push('/streak-calendar' as any)}
          />
        </SafeAreaView>

        {/* breathing room above the anchored CTA */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── 4. ANCHOR CTA ────────────────────────────────────────── */}
      <AnchorCTA
        label={today?.isRest ? 'PLAN TOMORROW →' : `${persona.workoutCTA} →`}
        accent={persona.accent}
        accentInk={persona.ink}
        onPress={() =>
          today?.isRest ? router.push('/workout-picker' as any) : openTodayWorkout()
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,                    // off-ladder 10
    paddingHorizontal: Spacing.md + 2,      // off-ladder 18
    paddingTop: Spacing.md - 2,             // off-ladder 14
    marginBottom: Spacing.sm + 2,           // off-ladder 10
  },
  rows: {
    paddingHorizontal: Spacing.md + 2,      // off-ladder 18
    paddingTop: Spacing.xs,
  },
  macrosCard: {
    marginHorizontal: Spacing.md + 2,
    marginBottom: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 12,
  },
  macrosHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macrosTitle: { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text },
  macrosKcal: { fontFamily: Fonts.display, fontSize: 15 },
  macrosRow: { flexDirection: 'row', gap: 14 },
  macroCol: { flex: 1, gap: 6 },
  macroVal: { fontFamily: Fonts.display, fontSize: 15, color: Colors.text },
  macroGoal: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary },
  macroTrack: { height: 5, backgroundColor: Colors.raised, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },
  macroLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1 },
});
