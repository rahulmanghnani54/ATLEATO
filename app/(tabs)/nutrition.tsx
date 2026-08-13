/**
 * Nutrition Tab — Bold Canvas (migrated 2026-08-13, was Direction C)
 *
 * Structure:
 *   Crown      — dark full-bleed hero: calories remaining as the hero numeral,
 *                persona radial tint, intake pills, calorie rail
 *   StatRow    — protein / carbs / fat, each over a slim macro-token rail
 *   Section    — quick log + today's meals as borderless ListRows
 *   Section    — the coach's tip + gap analysis
 *   Anchor CTA — "BUILD A MEAL →" in the persona accent
 *
 * v0 backup at nutrition-v0.tsx.bak.
 */
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react-native';

import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useAuthStore } from '@/stores/authStore';
import { Fonts } from '@/constants/theme';
import { personaAccent, personaFromProgramId, nutritionTipOfTheDay } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import {
  BigStat, CanvasScreen, Crown, Hairline, ListRow, Section, StatRow, TAB_BAR_SPACE,
} from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import type { MealType } from '@/types/index';

const MEALS: { key: MealType; label: string; time: string }[] = [
  { key: 'breakfast', label: 'Breakfast', time: '07:00' },
  { key: 'lunch',     label: 'Lunch',     time: '12:30' },
  { key: 'snack',     label: 'Snack',     time: '15:30' },
  { key: 'dinner',    label: 'Dinner',    time: '19:00' },
];

/** Breathing room between the last scroll row and the top of the anchored CTA. */
const CTA_GAP = 16;

/**
 * Slim progress rail. Bold Canvas has no gauge widgets — the ratio rides as a
 * 4px pill directly under the numeral it belongs to, so the numeral stays the
 * only thing the eye lands on.
 */
function Track({
  value, goal, color, rail,
}: { value: number; goal: number; color: string; rail: string }) {
  const pct = Math.min(Math.max(value / Math.max(goal, 1), 0), 1);
  return (
    <View style={[rails.rail, { backgroundColor: rail }]}>
      <View style={[rails.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const rails = StyleSheet.create({
  rail: { height: 4, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 999 },
});

export default function Nutrition() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(themed);

  // The anchored CTA is absolutely positioned, so it reserves nothing in the
  // scroll content, and its height grows with the OS font scale — measure it
  // rather than pay a guessed constant that goes wrong at large text sizes.
  const [ctaBlockHeight, setCtaBlockHeight] = useState(0);
  const onCtaLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setCtaBlockHeight((prev) => (prev === h ? prev : h));
  }, []);
  // The measured block is button + its own bottom padding, and that padding is
  // the same TAB_BAR_SPACE + inset CanvasScreen already reserves — so only the
  // overhang above it, plus a gap, is new.
  const bottomSpace =
    Math.max(0, ctaBlockHeight - (TAB_BAR_SPACE + insets.bottom)) + CTA_GAP;

  const [date] = useState(new Date());
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is dark in BOTH schemes, so its tint always takes the dark-tuned
  // persona accent — the light one disappears against ink.
  const crownTint = personaAccent(persona, 'dark').accent;

  const { data: nutrition, isLoading, refetch } = useDailyNutrition(date);
  const { glasses, goalGlasses, addGlass, addGlassIsPending } = useWaterLog(date);
  const handleAddWater = () => {
    if (addGlassIsPending) return;
    addGlass(undefined, {
      onError: () => Alert.alert('Could not save water', 'Check your connection and try again.'),
    });
  };
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

  const hitTarget = consumed >= goal;
  const pctOfGoal = Math.round((consumed / Math.max(goal, 1)) * 100);

  const openBuildMeal = () => router.push({
    pathname: '/build-meal',
    params: { mealType: 'lunch', date: dateStr },
  } as any);

  return (
    <View style={styles.root}>
      {/* The tab bar is a FLOATING pill — it insets nothing, so the kit's
          reserve is required, not a double-count. bottomSpace is the extra room
          for the anchored CTA that sits above it. */}
      <CanvasScreen bottomSpace={bottomSpace}>
        {/* ── 1. CROWN — calories remaining is the hero ──────────────── */}
        <Crown
          eyebrow={`${weekday} · ${persona.shortName} protocol`}
          title={hitTarget ? 'Done.' : remaining.toLocaleString('en-US')}
          accentLine={hitTarget ? `${consumed.toLocaleString('en-US')} kcal.` : 'kcal to go.'}
          meta={hitTarget
            ? 'Target reached for today.'
            : `${consumed.toLocaleString('en-US')} of ${goal.toLocaleString('en-US')} kcal logged today.`}
          pills={[`${pctOfGoal}% of target`, `${glasses}/${goalGlasses} glasses`, persona.vibe]}
          accent={crownTint}
        >
          <View style={styles.crownRail}>
            <Track value={consumed} goal={goal} color={crownTint} rail={tokens.crownLine} />
          </View>
        </Crown>

        <View style={styles.body}>
          {/* ── 2. MACROS ───────────────────────────────────────────── */}
          <Section label="Macros today" style={styles.firstSection}>
            {isLoading ? (
              <View style={styles.macroRow}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.macroCell}>
                    <Skeleton height={30} width="70%" radius={6} />
                    <Skeleton height={8} width="88%" radius={4} />
                    <Skeleton height={4} width="100%" radius={999} />
                  </View>
                ))}
              </View>
            ) : (
              <StatRow>
                <View style={styles.macro}>
                  <BigStat value={protein} unit="g" label={`Protein / ${proteinGoal}`} size={30} />
                  <Track value={protein} goal={proteinGoal} color={tokens.macroProtein} rail={tokens.border} />
                </View>
                <View style={styles.macro}>
                  <BigStat value={carbs} unit="g" label={`Carbs / ${carbsGoal}`} size={30} />
                  <Track value={carbs} goal={carbsGoal} color={tokens.macroCarbs} rail={tokens.border} />
                </View>
                <View style={styles.macro}>
                  <BigStat value={fat} unit="g" label={`Fat / ${fatGoal}`} size={30} />
                  <Track value={fat} goal={fatGoal} color={tokens.macroFat} rail={tokens.border} />
                </View>
              </StatRow>
            )}
          </Section>

          {/* ── 3. QUICK LOG ────────────────────────────────────────── */}
          <Section label="Quick log">
            <ListRow
              title="Search foods"
              subtitle="Type a food name to log it"
              onPress={() => router.push({ pathname: '/add-food', params: { mealType: 'lunch', date: dateStr } } as any)}
            />
            <ListRow
              title="Photo scan"
              subtitle="Snap a plate · AI estimates macros"
              onPress={() => router.push('/food-photo-scan' as any)}
            />
            <ListRow
              title="Build a meal"
              subtitle="Add several ingredients · log as one meal"
              onPress={openBuildMeal}
            />
            <ListRow
              title="Water"
              subtitle="Tap to add a glass · 250 ml each"
              value={`${glasses} / ${goalGlasses}`}
              onPress={handleAddWater}
              last
            />
          </Section>

          {/* ── 4. MEALS ────────────────────────────────────────────── */}
          <Section label="Today's meals">
            {MEALS.map((meal, i) => {
              const mealKcal = Math.round(nutrition?.byMeal[meal.key] ?? 0);
              return (
                <ListRow
                  key={meal.key}
                  title={meal.label}
                  subtitle={mealKcal > 0 ? `${meal.time} · logged` : `${meal.time} · tap to log`}
                  value={mealKcal > 0 ? `${mealKcal} kcal` : '—'}
                  onPress={() => router.push({
                    pathname: '/add-food',
                    params: { mealType: meal.key, date: dateStr },
                  } as any)}
                  last={i === MEALS.length - 1}
                />
              );
            })}
          </Section>

          {/* ── 5. AI COACH ─────────────────────────────────────────── */}
          <Section label={`${persona.shortName} says`}>
            <View style={styles.coach}>
              <View style={styles.coachHead}>
                <Sparkles size={14} color={pa.accentText} />
                <Text style={[styles.kicker, { color: pa.accentText }]}>Tip</Text>
              </View>
              <Text style={styles.coachText}>{tip}</Text>

              <Hairline style={styles.coachRule} />

              <View style={styles.coachHead}>
                <Sparkles size={14} color={pa.accentText} />
                <Text style={[styles.kicker, { color: pa.accentText }]}>Gap analysis</Text>
              </View>
              <Text style={styles.coachText}>{gap}</Text>
            </View>
          </Section>
        </View>
      </CanvasScreen>

      {/* ── 6. ANCHOR CTA ─────────────────────────────────────────── */}
      {/* Clears the floating tab pill, which draws over anything pinned to the
          safe-area edge alone. */}
      {/* Padded rather than offset, so onLayout reports the whole occupied
          block (button + clearance) in one number. */}
      <View
        style={[styles.ctaWrap, { paddingBottom: insets.bottom + TAB_BAR_SPACE }]}
        pointerEvents="box-none"
        onLayout={onCtaLayout}
      >
        <PressableScale
          onPress={openBuildMeal}
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel="Build a meal"
          // The fill is the coach's colour, so the boundary hairline takes the
          // persona's text-safe tone rather than tokens.accentLine — same job
          // (a legible edge on a light page), matching hue.
          style={[styles.cta, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        >
          <Text style={[styles.ctaLabel, { color: pa.ink }]}>BUILD A MEAL →</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const themed = (t: SemanticTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },

  crownRail: { marginTop: 20 },

  // Matches the Crown's own 22px gutter so the body reads as one column.
  body: { paddingHorizontal: 22 },
  firstSection: { marginTop: 26 },

  macro: { gap: 10 },
  // Skeleton stand-in for <StatRow> — same three columns, same rhythm.
  macroRow: { flexDirection: 'row', gap: 14 },
  macroCell: { flex: 1, gap: 9 },

  coach: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    padding: 20,
  },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  coachRule: { marginVertical: 18 },
  kicker: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  coachText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: t.text,
  },

  ctaWrap: { position: 'absolute', left: 22, right: 22, bottom: 0 },
  cta: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 13,
    letterSpacing: 1.4,
  },
});
