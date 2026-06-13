/**
 * Nutrition Tab — Direction C (migrated 2026-06-13)
 *
 * Structure:
 *   HeroBlock — persona gradient + day + "kcal eaten / goal"
 *   3-up Stat row — protein / carbs / fat (with target/eaten ratio)
 *   MacroRing card — single big radial ring (kept, persona-tinted)
 *   RowCard list — Search foods, Photo scan, Water, then 4 meals, then AI gap analysis
 *   AnchorCTA — "LOG A MEAL →"
 *
 * v0 backup at nutrition-v0.tsx.bak.
 */
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import Svg, { Circle } from 'react-native-svg';
import {
  Search, Camera, Droplets, UtensilsCrossed,
  Sun, Pizza, Cookie, Moon, Sparkles,
} from 'lucide-react-native';

import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { personaFromProgramId, nutritionTipOfTheDay } from '@/lib/personaTheme';
import { HeroBlock, Stat, RowCard, AnchorCTA } from '@/components/ui/c';
import type { MealType } from '@/types/index';

const MEALS: { key: MealType; label: string; time: string; Icon: any }[] = [
  { key: 'breakfast', label: 'Breakfast', time: '07:00', Icon: Sun },
  { key: 'lunch',     label: 'Lunch',     time: '12:30', Icon: Pizza },
  { key: 'snack',     label: 'Snack',     time: '15:30', Icon: Cookie },
  { key: 'dinner',    label: 'Dinner',    time: '19:00', Icon: Moon },
];

// ─── Macro ring (kept — persona-tinted) ──────────────────────────────────────
function MacroRing({ eaten, goal, color }: { eaten: number; goal: number; color: string }) {
  const r = 58, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(eaten / Math.max(goal, 1), 1);
  return (
    <Svg width={140} height={140} viewBox="0 0 140 140" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={11} fill="none" />
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={color} strokeWidth={11} fill="none"
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
      />
    </Svg>
  );
}

export default function Nutrition() {
  const router = useRouter();
  const [date] = useState(new Date());
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const { data: nutrition, refetch } = useDailyNutrition(date);
  const { glasses, goalGlasses, addGlass } = useWaterLog(date);
  const dateStr = format(date, 'yyyy-MM-dd');

  const goal = profile?.tdee ?? 2000;
  const proteinGoal = profile?.protein_g ?? 150;
  const carbsGoal = profile?.carbs_g ?? 200;
  const fatGoal = profile?.fat_g ?? 65;

  const consumed = Math.round(nutrition?.calories ?? 0);
  const protein = Math.round(nutrition?.proteinG ?? 0);
  const carbs = Math.round(nutrition?.carbsG ?? 0);
  const fat = Math.round(nutrition?.fatG ?? 0);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const weekday = format(date, 'EEE').toUpperCase();
  const remaining = Math.max(0, goal - consumed);
  const tip = nutritionTipOfTheDay(persona);
  const gap = protein < proteinGoal * 0.8
    ? `Protein at ${Math.round((protein / Math.max(proteinGoal, 1)) * 100)}%. Eat ${proteinGoal - protein}g more.`
    : `Protein on track. Keep eating clean.`;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO ─────────────────────────────────────────── */}
        <HeroBlock
          accent={persona.accent}
          day={`${weekday} · ${persona.shortName} Protocol`}
          name={consumed >= goal
            ? `Done.\n${consumed} kcal.`
            : `${remaining}\nkcal to go.`}
        />

        {/* ── 2. STATS ────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <Stat
            value={`${protein}`}
            label={`Protein / ${proteinGoal}g`}
            accent
            accentColor={persona.accent}
          />
          <Stat value={`${carbs}`} label={`Carbs / ${carbsGoal}g`} />
          <Stat value={`${fat}`} label={`Fat / ${fatGoal}g`} />
        </View>

        {/* ── 3. MACRO RING ───────────────────────────────────── */}
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <View style={styles.ringCard}>
            <View style={styles.ringWrap}>
              <MacroRing eaten={consumed} goal={goal} color={persona.accent} />
              <View style={styles.ringCenter}>
                <Text style={styles.ringNum}>{consumed}</Text>
                <Text style={styles.ringMeta}>of {goal}</Text>
              </View>
            </View>
            <View style={styles.ringRight}>
              <Text style={styles.ringTitle}>Today's intake</Text>
              <Text style={styles.ringSub}>
                {consumed >= goal ? 'Target reached.' : `${remaining} kcal remaining for today.`}
              </Text>
            </View>
          </View>

          {/* ── 4. QUICK ADD ROWS ─────────────────────────────── */}
          <RowCard
            icon={<Search size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Search foods"
            meta="Type a food name to log it"
            onPress={() => router.push({ pathname: '/add-food', params: { mealType: 'lunch', date: dateStr } } as any)}
          />
          <RowCard
            icon={<Camera size={22} color={persona.accent} />}
            iconTintColor={persona.accent}
            title="Photo scan"
            meta="Snap a plate · AI estimates macros"
            onPress={() => router.push('/food-photo-scan' as any)}
          />

          {/* ── 5. WATER ─────────────────────────────────────── */}
          <RowCard
            icon={<Droplets size={22} color="#5DD3FA" />}
            iconTintColor="#5DD3FA"
            title="Water"
            meta={`${glasses} / ${goalGlasses} glasses today`}
            onPress={() => addGlass()}
          />

          {/* ── 6. MEALS ─────────────────────────────────────── */}
          <Text style={styles.groupHead}>Meals</Text>
          {MEALS.map((meal) => {
            const mealKcal = Math.round(nutrition?.byMeal[meal.key] ?? 0);
            const meta = mealKcal > 0
              ? `${meal.time} · ${mealKcal} kcal logged`
              : `${meal.time} · tap to log`;
            return (
              <RowCard
                key={meal.key}
                icon={<meal.Icon size={22} color={mealKcal > 0 ? persona.accent : Colors.textSecondary} />}
                iconTintColor={mealKcal > 0 ? persona.accent : Colors.textSecondary}
                title={meal.label}
                meta={meta}
                onPress={() => router.push({
                  pathname: '/add-food',
                  params: { mealType: meal.key, date: dateStr },
                } as any)}
              />
            );
          })}

          {/* ── 7. AI COACH ──────────────────────────────────── */}
          <Text style={styles.groupHead}>{persona.shortName} says</Text>
          <View style={styles.tipCard}>
            <View style={styles.tipHead}>
              <Sparkles size={16} color={persona.accent} />
              <Text style={[styles.tipKicker, { color: persona.accent }]}>Tip</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipHead}>
              <Sparkles size={16} color={persona.accent} />
              <Text style={[styles.tipKicker, { color: persona.accent }]}>Gap analysis</Text>
            </View>
            <Text style={styles.tipText}>{gap}</Text>
          </View>
        </SafeAreaView>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── 8. ANCHOR CTA ───────────────────────────────────── */}
      <AnchorCTA
        label="LOG A MEAL →"
        accent={persona.accent}
        accentInk={persona.ink}
        onPress={() => router.push({
          pathname: '/add-food',
          params: { mealType: 'lunch', date: dateStr },
        } as any)}
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
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingTop: Spacing.md - 2,
    marginBottom: Spacing.sm + 2,
  },

  body: {
    paddingHorizontal: Spacing.md + 2,
    paddingTop: Spacing.xs,
  },

  // Macro ring card — bigger visual centerpiece
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  ringWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNum: { ...Typography.statNum, fontSize: 32 },
  ringMeta: { ...Typography.statLabel, marginTop: 2 },
  ringRight: { flex: 1 },
  ringTitle: { ...Typography.sectionTitle, marginBottom: 4 },
  ringSub: { ...Typography.cardMeta, lineHeight: 19 },

  // Group section heads (between RowCards)
  groupHead: {
    ...Typography.sectionTitle,
    fontSize: 16,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // AI tip cards
  tipCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    padding: Spacing.md - 2,
    marginBottom: Spacing.sm + 2,
  },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipKicker: { ...Typography.cardMeta, fontSize: 11, letterSpacing: 0.3 },
  tipText: { ...Typography.cardMeta, color: Colors.text, lineHeight: 19 },
});
