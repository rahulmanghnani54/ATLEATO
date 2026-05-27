/**
 * Home Dashboard — Apple Fitness Glass aesthetic
 *
 * Top: greeting → 3-ring "Today Rings" card (move/protein/recovery)
 * Middle: gradient TODAY card (persona accent) + coach voice quote in a
 *         frosted-glass card + 3 icon cards (rank / chain / freezes)
 * Below: existing rich features in glass-style wrappers — nutrition macros,
 *        hydration, recovery, PR shelf, retention cards (chain calendar,
 *        leaderboard, tomorrow commitment, witness nudge).
 *
 * All existing data hooks and feature components are preserved — only the
 * presentation layer is re-skinned.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G } from 'react-native-svg';
import { format } from 'date-fns';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useRecoveryScore } from '@/hooks/useRecoveryScore';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useWorkoutStreak, useThisWeekVolume, useProgramSchedule, useProgramWeek } from '@/hooks/useDashboardStats';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts } from '@/constants/theme';
import { personaFromProgramId, quoteOfTheDay, styleText } from '@/lib/personaTheme';
import { MorningBriefCard } from '@/components/dashboard/MorningBriefCard';
import { StreakHero } from '@/components/dashboard/StreakHero';
import { StreakNudge } from '@/components/dashboard/StreakNudge';
import { PRShelf } from '@/components/dashboard/PRShelf';
import { TomorrowCommitmentCard } from '@/components/dashboard/TomorrowCommitmentCard';
import { WitnessNudgeCard } from '@/components/dashboard/WitnessNudgeCard';
import { ChainCalendarCard } from '@/components/dashboard/ChainCalendarCard';
import { LeaderboardCard } from '@/components/dashboard/LeaderboardCard';
import { TerritoryCard } from '@/components/dashboard/TerritoryCard';
import { useTrainedToday } from '@/hooks/useTrainedToday';
import { useSessionsThisWeek } from '@/hooks/useSessionsThisWeek';
import { useStreakFreezes } from '@/hooks/useStreakFreezes';
import { useGlobalLeaderboard } from '@/hooks/useGlobalLeaderboard';
import { registerPushTokenIfNeeded } from '@/lib/pushNotifications';

// ─────────────────────────────────────────────────────────────────────────────
// Three Apple-style concentric rings: MOVE (outer) / PROTEIN (middle) / RECOVERY (inner)
// ─────────────────────────────────────────────────────────────────────────────
function TodayRings({
  movePct, proteinPct, recoveryPct, accent,
}: {
  movePct: number; proteinPct: number; recoveryPct: number; accent: string;
}) {
  const ringConfigs = [
    { r: 44, w: 7, color: accent,    pct: movePct },
    { r: 33, w: 7, color: '#7be38c', pct: proteinPct },
    { r: 22, w: 7, color: '#5DD3FA', pct: recoveryPct },
  ];
  return (
    <Svg width={120} height={120} viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
      {ringConfigs.map((rc, i) => {
        const circ = 2 * Math.PI * rc.r;
        const dash = circ * Math.min(1, Math.max(0, rc.pct));
        return (
          <G key={i}>
            {/* Track */}
            <Circle cx={50} cy={50} r={rc.r}
              stroke={`${rc.color}26`} strokeWidth={rc.w} fill="none" />
            {/* Progress */}
            <Circle cx={50} cy={50} r={rc.r}
              stroke={rc.color} strokeWidth={rc.w} fill="none"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round" />
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Glass wrapper — pure-RN "fake glass" using stacked semi-transparent layers.
// Avoids expo-blur which crashes on Android Fabric (IllegalViewOperationException).
// Visually ~95% identical to a true backdrop blur on a dark gradient background.
// ─────────────────────────────────────────────────────────────────────────────
function GlassCard({
  children, style,
}: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[styles.glassWrap, style]}>
      <View style={styles.glassTint} />
      <View style={styles.glassContent}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
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
  const { freezes } = useStreakFreezes();
  const { data: leaderboardRows = [] } = useGlobalLeaderboard(100);
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

  // Prefer today's check-in; fall back to yesterday's score
  const recoveryScore = (todayRecovery as any)?.recovery_score ?? recoveryCheckin?.recovery_score ?? null;
  const firstNameRaw = profile?.full_name?.split(' ')[0] ?? 'there';
  const greetingTime = (() => {
    const h = date.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();
  const dayLabel = format(date, 'EEEE').toUpperCase() + ` · WEEK ${programWeek}`;

  // Persona drives accent + voice
  const persona = personaFromProgramId(profile?.selected_program);
  const todayQuote = quoteOfTheDay(persona);

  // Ring percentages
  const movePct     = weekVolume > 0 ? Math.min(1, weekVolume / 50) : 0;        // 50k weekly volume target
  const proteinPct  = proteinGoal > 0 ? Math.min(1, protein / proteinGoal) : 0;
  const recoveryPct = recoveryScore != null ? Math.min(1, recoveryScore / 100) : 0;

  // Today's workout
  const todaySchedule = schedule.find((d) => d.isToday);
  const todayWorkoutName = todaySchedule?.isRest ? 'REST DAY' : (todaySchedule?.name ?? 'LOADING…');
  const todayWorkout = todaySchedule?.workout;
  const todayDuration = todayWorkout?.estimatedMinutes ?? 60;
  const totalSets = (todayWorkout?.exercises ?? []).reduce((s, e) => s + e.sets, 0);

  // Leaderboard rank for icon card
  const myRank = leaderboardRows.find((r) => r.is_current_user)?.rank;

  useFocusEffect(useCallback(() => {
    refetch();
    refetchWater();
  }, [refetch, refetchWater]));

  // Register push token once per session so the user can receive
  // "Lifter #4729 took your park" alerts from the territory game.
  useEffect(() => {
    if (profile) registerPushTokenIfNeeded();
  }, [profile]);

  // Tap handlers
  const startTodayWorkout = () => {
    if (todaySchedule?.isRest) { router.push('/recovery-checkin' as any); return; }
    if (!todayWorkout)         { router.push('/(tabs)/workouts' as any);  return; }
    const dow = new Date().getDay();
    const programDay = dow === 0 ? 6 : dow - 1;
    router.push({
      pathname: '/workout-lobby',
      params: {
        programId: profile?.selected_program ?? 'cbum_evolved',
        dayIndex: String(programDay),
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      {/* Persona-tinted ambient gradient background */}
      <LinearGradient
        colors={[
          `${persona.accent}26`,
          `${persona.accent}0d`,
          '#0a0b0d',
        ]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Secondary glow from opposite corner */}
      <View style={styles.glowSpot} pointerEvents="none">
        <LinearGradient
          colors={['rgba(93,211,250,0.18)', 'transparent']}
          style={{ flex: 1, borderRadius: 200 }}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={nutritionLoading}
              onRefresh={() => { refetch(); refetchWater(); }}
              tintColor={persona.accent}
            />
          }
        >
          {/* ─────────────────────────────────────────────────────────────
              GREETING (no section header)
              ───────────────────────────────────────────────────────────── */}
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayLabel}>{dayLabel}</Text>
              <Text style={styles.greeting}>
                <Text style={{ fontWeight: '300' }}>{greetingTime}, </Text>
                <Text style={{ fontWeight: '800' }}>{firstNameRaw}</Text>
              </Text>
              <Text style={[styles.coachLine, { color: persona.accent }]}>
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

          {/* ═════════════════════════════════════════════════════════════
              SECTION 1 · TODAY  (primary action + urgent nudges)
              ═════════════════════════════════════════════════════════════ */}
          <SectionHeader label="TODAY" accent={persona.accent} />

          {/* TODAY gradient hero — biggest tap target */}
          <TouchableOpacity onPress={startTodayWorkout} activeOpacity={0.88}>
            <LinearGradient
              colors={[persona.accent, `${persona.accent}cc`]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <Text style={[styles.heroHead, { color: persona.ink }]}>
                {todaySchedule?.isRest
                  ? 'REST · RECOVER'
                  : `${todayWorkoutName} · ${todayDuration} MIN`}
              </Text>
              <Text style={[styles.heroTitle, { color: persona.ink }]}>
                {todaySchedule?.isRest ? 'Rest today.' : styleText(persona, persona.workoutCTA)}
              </Text>
              <Text style={[styles.heroSub, { color: persona.ink, opacity: 0.85 }]}>
                {todaySchedule?.isRest
                  ? 'Active recovery — sleep, hydrate, walk.'
                  : `${(todayWorkout?.exercises ?? []).length} lifts · ${totalSets} sets · coached by ${persona.shortName}`}
              </Text>
              <View style={[styles.heroPlay, { backgroundColor: persona.ink }]}>
                <Text style={[styles.heroPlayText, { color: persona.accent }]}>
                  ▶  {todaySchedule?.isRest ? 'CHECK IN' : 'START WORKOUT'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Streak Nudge — only shows when user is behind */}
          <View style={{ marginTop: 14 }}>
            <StreakNudge
              streak={streak}
              trainedToday={trainedToday}
              isRestDay={!!todaySchedule?.isRest}
              persona={persona}
              onTrainPress={startTodayWorkout}
            />
          </View>

          {/* Recovery check-in — only if not done today */}
          {!hasCheckedInToday && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/recovery-checkin' as any)}
            >
              <GlassCard style={{ marginTop: 14 }}>
                <Text style={[styles.miniLabel, { color: persona.accent }]}>⚠  DAILY CHECK-IN</Text>
                <Text style={styles.checkinTitle}>How did you sleep?</Text>
                <Text style={styles.checkinSub}>Log recovery to optimise today&rsquo;s training →</Text>
              </GlassCard>
            </TouchableOpacity>
          )}

          {/* ═════════════════════════════════════════════════════════════
              SECTION 2 · AT A GLANCE  (status snapshot)
              ═════════════════════════════════════════════════════════════ */}
          <SectionHeader label="AT A GLANCE" accent={persona.accent} />

          {/* Today Rings — the centrepiece status card */}
          <GlassCard style={styles.ringsCard}>
            <View style={styles.ringsInner}>
              <View style={{ position: 'relative', width: 120, height: 120 }}>
                <TodayRings
                  movePct={movePct}
                  proteinPct={proteinPct}
                  recoveryPct={recoveryPct}
                  accent={persona.accent}
                />
                <View style={styles.ringsCenter}>
                  <Text style={styles.ringsCenterNum}>
                    {recoveryScore != null ? recoveryScore : '—'}
                  </Text>
                  <Text style={styles.ringsCenterLabel}>SCORE</Text>
                </View>
              </View>
              <View style={styles.ringMeta}>
                <RingMetaRow color={persona.accent} bold={`${weekVolume.toFixed(1)}k`} small="kg this week" />
                <RingMetaRow color="#7be38c" bold={`${protein}g`} small={`/ ${proteinGoal}g protein`} />
                <RingMetaRow color="#5DD3FA" bold={`${streak} day`} small="streak" />
              </View>
            </View>
          </GlassCard>

          {/* Three icon cards: RANK / CHAIN / FREEZES */}
          <View style={styles.iconCardsRow}>
            <IconCard
              icon="🏆"
              label="RANK"
              value={myRank ? `#${myRank}` : '—'}
              accent={persona.accent}
              onPress={() => router.push('/leaderboard' as any)}
            />
            <IconCard
              icon="📅"
              label="CHAIN"
              value={`${sessionsThisWeek}/7`}
              accent={persona.accent}
              onPress={() => router.push('/streak-calendar' as any)}
            />
            <IconCard
              icon="🧊"
              label="FREEZES"
              value={String(freezes)}
              accent={persona.accent}
            />
          </View>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 3 · YOUR DAY  (live daily tracking)
              ═════════════════════════════════════════════════════════════ */}
          <SectionHeader label={`YOUR DAY · ${format(date, 'HH:mm')}`} accent={persona.accent} />
          <GlassCard>
            <View style={styles.macroTop}>
              <View>
                <Text style={styles.miniLabel}>CALORIES</Text>
                <View style={styles.macroCalRow}>
                  <Text style={styles.macroBigNum}>{consumed}</Text>
                  <Text style={styles.macroOfGoal}> / {goal}</Text>
                </View>
              </View>
              <View style={styles.calRingWrap}>
                <CalorieArc eaten={consumed} goal={goal} color={persona.accent} />
                <View style={styles.calRingCenter}>
                  <Text style={[styles.calRingPct, { color: persona.accent }]}>
                    {goal > 0 ? Math.round((consumed / goal) * 100) : 0}%
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.macroGrid}>
              {[
                { l: 'PROTEIN', v: protein, t: proteinGoal, c: '#7be38c' },
                { l: 'CARBS',   v: carbs,   t: carbsGoal,   c: persona.accent },
                { l: 'FAT',     v: fat,     t: fatGoal,     c: '#f5b942' },
              ].map((m) => (
                <View key={m.l} style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>{m.l}</Text>
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
          </GlassCard>

          {/* Hydration — paired with nutrition under YOUR DAY */}
          <GlassCard style={{ marginTop: 10 }}>
            <View style={styles.waterRow}>
              <Text style={styles.miniLabel}>WATER</Text>
              <View style={styles.waterBars}>
                {Array.from({ length: goalGlasses }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.waterBar, {
                      backgroundColor: i < glasses ? '#5DD3FA' : 'rgba(255,255,255,0.08)',
                    }]}
                  />
                ))}
              </View>
              <TouchableOpacity onPress={() => addGlass()} style={styles.waterAdd}>
                <Text style={styles.waterCount}>
                  {glasses}<Text style={{ fontSize: 10, color: Colors.textSecondary }}>/{goalGlasses}</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => addGlass()} style={styles.waterPlus}>
                <Text style={{ color: Colors.textSecondary, fontSize: 18 }}>+</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 4 · MOMENTUM  (motivation: streak, quote, PRs, plan)
              ═════════════════════════════════════════════════════════════ */}
          <SectionHeader label="MOMENTUM" accent={persona.accent} />

          {/* Streak Hero with freeze inventory */}
          <StreakHero days={streak} persona={persona} />

          {/* Coach voice quote */}
          <GlassCard style={{ marginTop: 14 }}>
            <View style={styles.quoteHead}>
              <View style={[styles.quoteAvatar, { backgroundColor: persona.accent }]}>
                <Text style={[styles.quoteAvatarText, { color: persona.ink }]}>
                  {persona.initials}
                </Text>
              </View>
              <Text style={[styles.quoteName, { color: persona.accent }]}>
                {styleText(persona, `${persona.shortName} SAYS`)}
              </Text>
            </View>
            <Text style={styles.quoteBody}>"{todayQuote}"</Text>
          </GlassCard>

          {/* PR Shelf */}
          <PRShelf persona={persona} />

          {/* Tomorrow Commitment — pre-commit for tomorrow's workout */}
          <TomorrowCommitmentCard persona={persona} />

          {/* ═════════════════════════════════════════════════════════════
              SECTION 5 · COMMUNITY  (chain, leaderboard, accountability)
              ═════════════════════════════════════════════════════════════ */}
          <SectionHeader label="COMMUNITY" accent={persona.accent} />

          {/* Territory — run-to-claim grid conquest */}
          <TerritoryCard persona={persona} />

          {/* Chain Calendar — Seinfeld "don't break the chain" strip */}
          <ChainCalendarCard persona={persona} />

          {/* Global Weekly Leaderboard — top 3 + your row */}
          <LeaderboardCard persona={persona} />

          {/* Witness Nudge — Sunday/Monday only when behind on weekly sessions */}
          <WitnessNudgeCard sessionsThisWeek={sessionsThisWeek} persona={persona} />

          {/* Morning Brief at the very bottom — quiet daily ritual */}
          <View style={{ marginTop: 14 }}>
            <MorningBriefCard persona={persona} />
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

/**
 * SectionHeader — Strava-style mono label with a hairline rule.
 * Separates the home into clear scannable groups (Today / At a glance /
 * Your day / Momentum / Community).
 */
function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={[styles.sectionHeaderBar, { backgroundColor: accent }]} />
      <Text style={[styles.sectionHeaderText, { color: accent }]}>{label}</Text>
      <View style={styles.sectionHeaderRule} />
    </View>
  );
}

function RingMetaRow({ color, bold, small }: { color: string; bold: string; small: string }) {
  return (
    <View style={styles.ringMetaRow}>
      <View style={[styles.ringMetaDot, { backgroundColor: color }]} />
      <Text style={styles.ringMetaText}>
        <Text style={{ fontFamily: Fonts.display, fontWeight: '800' }}>{bold}</Text>
        <Text style={{ color: Colors.textSecondary }}>  {small}</Text>
      </Text>
    </View>
  );
}

function IconCard({
  icon, label, value, accent, onPress,
}: {
  icon: string; label: string; value: string; accent: string;
  onPress?: () => void;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={{ flex: 1 }} onPress={onPress} activeOpacity={0.85}>
      <GlassCard style={styles.iconCard}>
        <Text style={styles.iconCardIcon}>{icon}</Text>
        <Text style={styles.iconCardLabel}>{label}</Text>
        <Text style={[styles.iconCardValue, { color: accent }]}>{value}</Text>
      </GlassCard>
    </Wrap>
  );
}

function CalorieArc({ eaten, goal, color }: { eaten: number; goal: number; color: string }) {
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

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0b0d' },
  glowSpot: {
    position: 'absolute',
    top: -120, right: -140,
    width: 360, height: 360,
    opacity: 0.7,
  },
  scroll: { padding: 18, paddingBottom: 40 },

  // Greeting
  greetingRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 18,
  },
  dayLabel: {
    fontFamily: Fonts.mono, fontSize: 10,
    color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 4,
  },
  greeting: {
    fontFamily: Fonts.body, fontSize: 26, color: Colors.text,
    letterSpacing: -0.6, lineHeight: 30,
  },
  coachLine: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, marginTop: 6, opacity: 0.9 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 13, fontWeight: '700' },

  // Glass card base
  glassWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  glassContent: { padding: 18 },

  // Rings card
  ringsCard: { marginBottom: 14 },
  ringsInner: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringsCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  ringsCenterNum: {
    fontFamily: Fonts.display, fontWeight: '800',
    fontSize: 28, color: Colors.text, letterSpacing: -0.5,
  },
  ringsCenterLabel: {
    fontFamily: Fonts.mono, fontSize: 8,
    color: Colors.textTertiary, letterSpacing: 1.6, marginTop: 2,
  },
  ringMeta: { flex: 1 },
  ringMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ringMetaDot: { width: 8, height: 8, borderRadius: 4 },
  ringMetaText: { fontSize: 13, color: Colors.text },

  // Section label (legacy — used by YOUR DAY sub-labels)
  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.8,
    color: Colors.textTertiary, marginBottom: 8, marginTop: 16,
  },

  // Section header (Strava-style block divider with accent bar + rule)
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginTop: 28, marginBottom: 14,
  },
  sectionHeaderBar: { width: 3, height: 12, borderRadius: 1.5 },
  sectionHeaderText: {
    fontFamily: Fonts.mono, fontSize: 11,
    letterSpacing: 2.2, fontWeight: '700',
  },
  sectionHeaderRule: {
    flex: 1, height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Today hero (gradient)
  heroCard: { borderRadius: 18, padding: 20, overflow: 'hidden' },
  heroHead: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4, opacity: 0.8 },
  heroTitle: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 30, letterSpacing: -0.7, marginTop: 6 },
  heroSub: { fontFamily: Fonts.body, fontSize: 12, marginTop: 6 },
  heroPlay: {
    marginTop: 16, alignSelf: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: 100,
  },
  heroPlayText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 0.8, fontWeight: '700' },

  // Quote
  quoteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quoteAvatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  quoteAvatarText: { fontFamily: Fonts.display, fontSize: 10, fontWeight: '800' },
  quoteName: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },
  quoteBody: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 19, fontStyle: 'italic' },

  // Icon cards row
  iconCardsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  iconCard: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  iconCardIcon: { fontSize: 22 },
  iconCardLabel: {
    fontFamily: Fonts.mono, fontSize: 8,
    color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 6,
  },
  iconCardValue: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 18, marginTop: 2 },

  // Mini label (used in macro card, hydration, recovery)
  miniLabel: {
    fontFamily: Fonts.mono, fontSize: 9,
    color: Colors.textTertiary, letterSpacing: 1.2,
  },

  // Recovery check-in CTA
  checkinTitle: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 22, color: Colors.text, marginTop: 8, letterSpacing: -0.4 },
  checkinSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 6 },

  // Macro card
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  macroCalRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  macroBigNum: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 38, color: Colors.text, letterSpacing: -0.8 },
  macroOfGoal: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  calRingWrap: { width: 64, height: 64, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  calRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  calRingPct: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 14 },
  macroGrid: { flexDirection: 'row', gap: 12 },
  macroValue: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 20, marginTop: 4 },
  macroGoalText: { fontFamily: Fonts.body, fontWeight: '400', fontSize: 10, color: Colors.textSecondary },
  macroTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2, marginTop: 4, overflow: 'hidden',
  },
  macroFill: { height: '100%', borderRadius: 2 },

  // Hydration
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waterBars: { flex: 1, flexDirection: 'row', gap: 3 },
  waterBar: { flex: 1, height: 6, borderRadius: 1 },
  waterAdd: { paddingHorizontal: 4 },
  waterCount: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 16, color: Colors.text },
  waterPlus: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
