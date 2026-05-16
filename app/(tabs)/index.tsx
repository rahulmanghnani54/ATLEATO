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
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing, Typography } from '@/constants/theme';

// ── Calorie ring (SVG) ────────────────────────────────────────
function CalorieArc({ eaten, goal }: { eaten: number; goal: number }) {
  const r = 28, cx = 32, cy = 32;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(eaten / Math.max(goal, 1), 1);
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={Colors.primary}
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
  const hasCheckedInToday = !!todayRecovery;

  const goal = profile?.tdee ?? 2000;
  const proteinGoal = profile?.protein_g ?? 150;
  const carbsGoal = profile?.carbs_g ?? 200;
  const fatGoal = profile?.fat_g ?? 65;

  const consumed = Math.round(nutrition?.calories ?? 0);
  const protein = Math.round(nutrition?.proteinG ?? 0);
  const carbs = Math.round(nutrition?.carbsG ?? 0);
  const fat = Math.round(nutrition?.fatG ?? 0);

  const recoveryScore = recoveryCheckin?.recovery_score ?? null;
  const firstName = profile?.full_name?.split(' ')[0]?.toUpperCase() ?? 'THERE';
  const dayLabel = format(date, 'EEE').toUpperCase() + ' · WEEK 1';

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
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.dayLabel}>{dayLabel}</Text>
            <Text style={styles.greeting}>HOWDY, {firstName}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName.slice(0, 2)}</Text>
          </View>
        </View>

        {/* ── Today's workout hero ── */}
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => router.push('/workouts' as any)}
          activeOpacity={0.85}
        >
          <Tag color={Colors.accentInk}>TODAY · 60 MIN</Tag>
          <Text style={styles.heroTitle}>{"PUSH\nDAY 1"}</Text>
          <Text style={styles.heroSub}>5 lifts · 18 sets · CBum Classic</Text>
          <View style={styles.heroBtn}>
            <Text style={styles.heroBtnText}>▶  START SESSION</Text>
          </View>
          {/* decorative numeral */}
          <Text style={styles.heroDecor}>01</Text>
        </TouchableOpacity>

        {/* ── Stat strip ── */}
        <View style={styles.statStrip}>
          <StatCard label="STREAK" value="1" unit="days" />
          <StatCard
            label="RECOVERY"
            value={recoveryScore !== null ? String(recoveryScore) : '—'}
            unit="%"
          />
          <StatCard label="WEEK VOL" value="0" unit="k kg" />
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
                <CalorieArc eaten={consumed} goal={goal} />
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
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>UPCOMING</Text>
          <View style={styles.upcomingRow}>
            {[
              { d: 'WED', n: 'PULL · 1' },
              { d: 'THU', n: 'LEGS · 1' },
              { d: 'FRI', n: 'REST' },
            ].map((item) => (
              <View key={item.d} style={styles.upcomingCard}>
                <Text style={styles.upcomingDay}>{item.d}</Text>
                <Text style={styles.upcomingName}>{item.n}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  dayLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },
  greeting: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: -0.5, marginTop: 2 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.primary },

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
});
