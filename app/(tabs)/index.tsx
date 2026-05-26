import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { format } from 'date-fns';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useRecoveryScore } from '@/hooks/useRecoveryScore';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useWorkoutStreak, useThisWeekVolume, useProgramSchedule, useProgramWeek } from '@/hooks/useDashboardStats';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing, Typography } from '@/constants/theme';
import { personaFromProgramId, quoteOfTheDay, styleText } from '@/lib/personaTheme';
import { MorningBriefCard } from '@/components/dashboard/MorningBriefCard';
import { StreakHero } from '@/components/dashboard/StreakHero';
import { StreakNudge } from '@/components/dashboard/StreakNudge';
import { PRShelf } from '@/components/dashboard/PRShelf';
import { TomorrowCommitmentCard } from '@/components/dashboard/TomorrowCommitmentCard';
import { WitnessNudgeCard } from '@/components/dashboard/WitnessNudgeCard';
import { ChainCalendarCard } from '@/components/dashboard/ChainCalendarCard';
import { LeaderboardCard } from '@/components/dashboard/LeaderboardCard';
import { useTrainedToday } from '@/hooks/useTrainedToday';
import { useSessionsThisWeek } from '@/hooks/useSessionsThisWeek';

// ── Calorie ring (SVG) ────────────────────────────────────────
function CalorieArc({ eaten, goal, color = Colors.primary }: { eaten: number; goal: number; color?: string }) {
  const r = 28, cx = 32, cy = 32;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(eaten / Math.max(goal, 1), 1);
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={color}
        strokeWidth={6} fill="none"
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Mono tag chip ─────────────────────────────────────────────
function Tag({ children, color }: { children: string; color?: string }) {
  return (
    <View style={[styles.tag, color ? { borderColor: color } : {}]}>
      <Text style={[styles.tagText, color ? { color } : {}]}>{children}</Text>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
    </View>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [date] = useState(new Date());
  const profile = useAuthStore((s) => s.profile);
  const { data: nutrition, isLoading: nutritionLoading, refetch } = useDailyNutrition(date);
  const { glasses, goalGlasses, addGlass, refetch: refetchWater } = useWaterLog(date);
  const { data: recoveryCheckin } = useRecoveryScore();
  const { data: todayRecovery } = useTodayRecovery();
  const { data: streak = 0 } = useWorkoutStreak();
  const { data: trainedToday = false } = useTrainedToday();
  const { data: sessionsThisWeek = 0 } = useSessionsThisWeek();
  const { data: weekVolume = 0 } = useThisWeekVolume();
  const { data: schedule = [] } = useProgramSchedule();
  const programWeek = useProgramWeek();
  const hasCheckedInToday = !!todayRecovery;

  const goal = profile?.tdee ?? 2000;
  const proteinGoal = profile?.protein_g ?? 150;
  const carbsGoal = profile?.carbs_g ?? 200;
  const fatGoal = profile?.fat_g ?? 65;

  const consumed = Math.round(nutrition?.calories ?? 0);
  const protein = Math.round(nutrition?.proteinG ?? 0);
  const carbs = Math.round(nutrition?.carbsG ?? 0);
  const fat = Math.round(nutrition?.fatG ?? 0);

  // Prefer today's check-in; fall back to yesterday's score from useRecoveryScore
  const recoveryScore = (todayRecovery as any)?.recovery_score ?? recoveryCheckin?.recovery_score ?? null;
  const firstNameRaw = profile?.full_name?.split(' ')[0] ?? 'there';
  const firstName = firstNameRaw.toUpperCase();
  const dayLabel = format(date, 'EEE').toUpperCase() + ` · WEEK ${programWeek}`;

  // ── Persona theme (drives accent color, greeting, quote, vibe) ─────────────
  const persona = personaFromProgramId(profile?.selected_program);
  const greeting = persona.greeting(firstNameRaw);
  const todayQuote = quoteOfTheDay(persona);

  // Today's workout from program schedule
  const todaySchedule = schedule.find((d) => d.isToday);
  const todayWorkoutName = todaySchedule?.isRest ? 'REST DAY' : (todaySchedule?.name ?? 'LOADING…');
  const todayWorkout = todaySchedule?.workout;
  const todayDuration = todayWorkout?.estimatedMinutes ?? 60;
  const todayExercises = todayWorkout?.exercises ?? [];
  const totalSets = todayExercises.reduce((s, e) => s + e.sets, 0);
  const upcomingDays = schedule.filter((d) => !d.isToday).slice(0, 3);

  useFocusEffect(useCallback(() => {
    refetch();
    refetchWater();
  }, [refetch, refetchWater]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={nutritionLoading}
            onRefresh={() => { refetch(); refetchWater(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Header (persona-aware greeting) ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.coachStripe}>
              <View style={[styles.coachDot, { backgroundColor: persona.accent }]} />
              <Text style={[styles.coachStripeText, { color: persona.accent }]}>
                {persona.shortName} · {persona.vibe}
              </Text>
            </View>
            <Text style={styles.dayLabel}>{dayLabel}</Text>
            <Text style={styles.greeting}>{styleText(persona, greeting)}</Text>
            <Text style={[styles.coachMotivation, { color: persona.accent }]}>
              {styleText(persona, persona.motivation)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.avatar, { borderColor: persona.accent }]}
            onPress={() => router.push('/profile' as any)}
            activeOpacity={0.75}
          >
            <Text style={[styles.avatarText, { color: persona.accent }]}>{persona.initials}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Morning Brief: 30-second ritual with your coach ── */}
        <MorningBriefCard persona={persona} />

        {/* ── Streak Hero: visible flame, big number, milestone progress ── */}
        <StreakHero days={streak} persona={persona} />

        {/* ── Streak Nudge: "don't break the chain" (only shows when applicable) ── */}
        <StreakNudge
          streak={streak}
          trainedToday={trainedToday}
          isRestDay={!!todaySchedule?.isRest}
          persona={persona}
          onTrainPress={() => {
            if (!todayWorkout) return;
            const dow = new Date().getDay();
            const programDay = dow === 0 ? 6 : dow - 1;
            router.push({
              pathname: '/workout-lobby',
              params: {
                programId: profile?.selected_program ?? 'cbum_evolved',
                dayIndex: String(programDay),
              },
            } as any);
          }}
        />

        {/* ── Today's workout hero (persona accent) ── */}
        <TouchableOpacity
          style={[styles.heroCard, { backgroundColor: persona.accent }]}
          onPress={() => {
            if (todaySchedule?.isRest || !todayWorkout) return;
            const dow = new Date().getDay(); // 0=Sun
            const programDay = dow === 0 ? 6 : dow - 1;
            router.push({
              pathname: '/workout-lobby',
              params: {
                programId: profile?.selected_program ?? 'cbum_evolved',
                dayIndex: String(programDay),
              },
            } as any);
          }}
          activeOpacity={todaySchedule?.isRest ? 1 : 0.85}
        >
          <View style={[styles.tag, { borderColor: persona.ink }]}>
            <Text style={[styles.tagText, { color: persona.ink }]}>
              {todaySchedule?.isRest ? 'REST · RECOVER' : `TODAY · ${todayDuration} MIN`}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: persona.ink }]} numberOfLines={2}>
            {todayWorkoutName.replace(' ', '\n')}
          </Text>
          <Text style={[styles.heroSub, { color: persona.ink, opacity: 0.75 }]}>
            {todaySchedule?.isRest
              ? 'Active recovery or full rest'
              : `${todayExercises.length} lifts · ${totalSets} sets · COACHED BY ${persona.shortName}`
            }
          </Text>
          {!todaySchedule?.isRest && (
            <View style={[styles.heroBtn, { borderColor: persona.ink }]}>
              <Text style={[styles.heroBtnText, { color: persona.ink }]}>
                ▶  {styleText(persona, persona.workoutCTA)}
              </Text>
            </View>
          )}
          {/* decorative — workout focus short label */}
          <Text style={[styles.heroDecor, { color: persona.ink, opacity: 0.15 }]}>
            {String(schedule.findIndex((d) => d.isToday) + 1).padStart(2, '0')}
          </Text>
        </TouchableOpacity>

        {/* ── Coach's daily quote ── */}
        <View style={[styles.quoteCard, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}>
          <Text style={[styles.quoteAttrib, { color: persona.accent }]}>
            ✦ {styleText(persona, `${persona.shortName} SAYS`)}
          </Text>
          <Text style={styles.quoteText}>"{todayQuote}"</Text>
        </View>

        {/* ── PR Shelf — your top trophies, in coach's color ── */}
        <PRShelf persona={persona} />

        {/* ── Chain Calendar — Seinfeld "don't break the chain" 6-week strip ── */}
        <ChainCalendarCard persona={persona} />

        {/* ── Global Leaderboard — anonymous weekly ranks (top 3 + you) ── */}
        <LeaderboardCard persona={persona} />

        {/* ── Tomorrow's Commitment — pre-commit for tomorrow's workout ── */}
        <TomorrowCommitmentCard persona={persona} />

        {/* ── Witness Nudge — Sunday/Monday only, if behind on weekly sessions ── */}
        <WitnessNudgeCard sessionsThisWeek={sessionsThisWeek} persona={persona} />

        {/* ── Stat strip (streak now lives in StreakHero above) ── */}
        <View style={styles.statStrip}>
          <StatCard
            label="RECOVERY"
            value={recoveryScore !== null ? String(recoveryScore) : '—'}
            unit="%"
          />
          <StatCard label="WEEK VOL" value={weekVolume > 0 ? String(weekVolume) : '0'} unit="k kg" />
          <StatCard label="WEEK" value={String(programWeek)} unit="of program" />
        </View>

        {/* ── Recovery ── */}
        {!hasCheckedInToday ? (
          <TouchableOpacity
            style={styles.checkinCard}
            onPress={() => router.push('/recovery-checkin' as any)}
            activeOpacity={0.85}
          >
            <Tag color={Colors.warning}>⚠ DAILY CHECK-IN</Tag>
            <Text style={styles.checkinTitle}>HOW DID YOU{'\n'}SLEEP?</Text>
            <Text style={styles.checkinSub}>Log your recovery to optimise today's training →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RECOVERY · TODAY</Text>
            <View style={styles.recoveryCard}>
              <View style={styles.recoveryLeft}>
                <Text style={styles.recoveryScore}>
                  <Text style={{ color: Colors.primary, fontFamily: Fonts.display, fontSize: 56 }}>
                    {recoveryScore ?? '—'}
                  </Text>
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary }}> /100</Text>
                </Text>
                <Text style={styles.recoveryTip}>
                  {(recoveryScore ?? 0) >= 75
                    ? 'Train hard — volume +5%'
                    : (recoveryScore ?? 0) >= 50
                    ? 'Normal training today'
                    : 'Deload — take it easy'}
                </Text>
              </View>
              <View style={styles.recoveryRight}>
                <Text style={styles.recoverySubLabel}>VS YESTERDAY</Text>
                <Text style={styles.recoveryDelta}>—</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Nutrition / Macros ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NUTRITION · {format(date, 'HH:mm')}</Text>
          <View style={styles.macroCard}>
            <View style={styles.macroTop}>
              <View>
                <Text style={styles.macroMonoLabel}>CALORIES</Text>
                <View style={styles.macroCalRow}>
                  <Text style={styles.macroBigNum}>{consumed}</Text>
                  <Text style={styles.macroOfGoal}> / {goal}</Text>
                </View>
              </View>
              <View style={styles.ringWrap}>
                <CalorieArc eaten={consumed} goal={goal} color={persona.accent} />
                <View style={styles.ringCenter}>
                  <Text style={styles.ringPct}>
                    {goal > 0 ? Math.round((consumed / goal) * 100) : 0}%
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.macroGrid}>
              {[
                { l: 'PROTEIN', v: protein, t: proteinGoal, c: Colors.macroProtein },
                { l: 'CARBS', v: carbs, t: carbsGoal, c: Colors.primary },
                { l: 'FAT', v: fat, t: fatGoal, c: Colors.macroFat },
              ].map((m) => (
                <View key={m.l} style={{ flex: 1 }}>
                  <Text style={styles.macroMonoLabel}>{m.l}</Text>
                  <Text style={[styles.macroValue, { color: m.c }]}>
                    {m.v}<Text style={styles.macroGoalText}>/{m.t}g</Text>
                  </Text>
                  <View style={styles.macroTrack}>
                    <View style={[styles.macroFill, {
                      width: `${Math.min((m.v / Math.max(m.t, 1)) * 100, 100)}%` as any,
                      backgroundColor: m.c,
                    }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Water tracker ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HYDRATION</Text>
          <View style={styles.waterCard}>
            <View style={styles.waterRow}>
              <Text style={styles.waterLabel}>WATER</Text>
              <View style={styles.waterBars}>
                {Array.from({ length: goalGlasses }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.waterBar, { backgroundColor: i < glasses ? Colors.info : Colors.border }]}
                  />
                ))}
              </View>
              <TouchableOpacity onPress={() => addGlass()} style={styles.waterAddBtn}>
                <Text style={styles.waterCount}>{glasses}<Text style={{ fontSize: 10, color: Colors.textSecondary }}>/{goalGlasses}</Text></Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => addGlass()} style={styles.waterPlus}>
                <Text style={{ color: Colors.textSecondary, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Upcoming ── */}
        {upcomingDays.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>UPCOMING</Text>
            <View style={styles.upcomingRow}>
              {upcomingDays.map((item) => (
                <View key={item.dayLabel} style={[styles.upcomingCard, item.isRest && styles.upcomingCardRest]}>
                  <Text style={styles.upcomingDay}>{item.dayLabel}</Text>
                  <Text style={[styles.upcomingName, item.isRest && { color: Colors.textTertiary }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  coachStripe: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  coachDot: { width: 6, height: 6, borderRadius: 3 },
  coachStripeText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.8 },
  dayLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },
  greeting: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: -0.5, marginTop: 4, lineHeight: 26 },
  coachMotivation: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.6, marginTop: 6, opacity: 0.9 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 14 },

  // Coach quote card
  quoteCard: {
    borderLeftWidth: 3, borderRadius: 4,
    padding: 14, marginBottom: 14,
  },
  quoteAttrib: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 6 },
  quoteText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },

  // Tag chip
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10,11,13,0.12)',
    borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0,
  },
  tagText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accentInk, letterSpacing: 0.8 },

  // Hero card
  heroCard: {
    backgroundColor: Colors.primary, borderRadius: 8, padding: 20,
    marginBottom: 14, overflow: 'hidden', position: 'relative',
  },
  heroTitle: {
    fontFamily: Fonts.display, fontSize: 38, color: Colors.accentInk,
    lineHeight: 36, marginTop: 14, letterSpacing: -1,
  },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.accentInk, marginTop: 10, opacity: 0.8 },
  heroBtn: {
    marginTop: 18, backgroundColor: Colors.accentInk,
    alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 4,
  },
  heroBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.primary, letterSpacing: 0.8 },
  heroDecor: {
    position: 'absolute', right: -10, top: -20,
    fontFamily: Fonts.display, fontSize: 180, color: 'rgba(10,11,13,0.07)', lineHeight: 180,
  },

  // Stat strip
  statStrip: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 12,
  },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 6 },
  statValue: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text },
  statUnit: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },

  // Check-in card
  checkinCard: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
  },
  checkinTitle: { fontFamily: Fonts.display, fontSize: 24, color: Colors.text, marginTop: 10, letterSpacing: -0.5, lineHeight: 26 },
  checkinSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 8 },

  // Section
  section: { marginBottom: 14 },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 8 },

  // Recovery card
  recoveryCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'flex-end',
  },
  recoveryLeft: { flex: 1 },
  recoveryScore: { flexDirection: 'row', alignItems: 'baseline' },
  recoveryTip: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  recoveryRight: { alignItems: 'flex-end' },
  recoverySubLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  recoveryDelta: { fontFamily: Fonts.display, fontSize: 16, color: Colors.good, marginTop: 4 },

  // Macro card
  macroCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16,
  },
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  macroMonoLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  macroCalRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  macroBigNum: { fontFamily: Fonts.display, fontSize: 42, color: Colors.text },
  macroOfGoal: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  ringWrap: { width: 64, height: 64, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontFamily: Fonts.display, fontSize: 14, color: Colors.primary },
  macroGrid: { flexDirection: 'row', gap: 12 },
  macroValue: { fontFamily: Fonts.display, fontSize: 22, marginTop: 4 },
  macroGoalText: { fontSize: 10, color: Colors.textSecondary, fontFamily: Fonts.body },
  macroTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden',
  },
  macroFill: { height: '100%', borderRadius: 2 },

  // Water card
  waterCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 14,
  },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waterLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, width: 48 },
  waterBars: { flex: 1, flexDirection: 'row', gap: 3 },
  waterBar: { flex: 1, height: 6, borderRadius: 1 },
  waterAddBtn: { paddingHorizontal: 4 },
  waterCount: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
  waterPlus: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // Upcoming
  upcomingRow: { flexDirection: 'row', gap: 8 },
  upcomingCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 12,
  },
  upcomingDay: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  upcomingName: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, marginTop: 4 },
  upcomingCardRest: { opacity: 0.5 },
});
