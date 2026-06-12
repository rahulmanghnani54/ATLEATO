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
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Dumbbell, Lightbulb, MapPin, Flame, Trophy, Activity } from 'lucide-react-native';

import { HeroBlock, Stat, RowCard, AnchorCTA } from '@/components/ui/c';
import { Colors, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak, useThisWeekVolume, useProgramSchedule } from '@/hooks/useDashboardStats';
import { personaFromProgramId } from '@/lib/personaTheme';

export default function Dashboard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const { data: streak = 0, refetch: refetchStreak } = useWorkoutStreak();
  const { data: weekKg = 0, refetch: refetchWeek } = useThisWeekVolume();
  const { data: schedule } = useProgramSchedule();
  const today = schedule?.find((d) => d.isToday);

  // Re-fetch streak + volume when the user returns to this tab
  useFocusEffect(
    useCallback(() => {
      refetchStreak();
      refetchWeek();
    }, [refetchStreak, refetchWeek]),
  );

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'Athlete';
  const todayLabel = today?.isRest
    ? `Day ${streak || 1} · Rest`
    : `Day ${streak || 1} · ${today?.workout?.focus ?? 'Train'}`;

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
            onRefresh={() => { refetchStreak(); refetchWeek(); }}
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

        {/* ── 3. ROW CARDS ─────────────────────────────────────────── */}
        <SafeAreaView edges={['left', 'right']} style={styles.rows}>
          {!today?.isRest && (
            <RowCard
              icon={<Dumbbell size={22} color={persona.accent} />}
              iconTintColor={persona.accent}
              title={today?.workout?.name ?? "Today's Workout"}
              meta={`${today?.workout?.exercises?.length ?? 6} exercises · ${today?.workout?.estimatedMinutes ?? 55} min`}
              onPress={() => router.push('/workout-lobby' as any)}
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
            icon={<MapPin size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Defend Your Territory"
            meta="See your cells · run to claim more"
            onPress={() => router.push('/(tabs)/territory' as any)}
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
          router.push((today?.isRest ? '/workout-picker' : '/workout-lobby') as any)
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
});
