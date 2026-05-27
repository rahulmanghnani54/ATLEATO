import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import Svg, { Circle } from 'react-native-svg';
import { useDailyNutrition } from '@/hooks/useDailyNutrition';
import { useWaterLog } from '@/hooks/useWaterLog';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { personaFromProgramId, nutritionTipOfTheDay, styleText } from '@/lib/personaTheme';
import type { MealType } from '@/types/index';

const MEALS: { key: MealType; label: string; time: string }[] = [
  { key: 'breakfast', label: 'BREAKFAST', time: '07:00' },
  { key: 'lunch',     label: 'LUNCH',     time: '12:30' },
  { key: 'snack',     label: 'SNACK',     time: '15:30' },
  { key: 'dinner',    label: 'DINNER',    time: '19:00' },
];

function MacroRing({ eaten, goal, size = 140, color = Colors.primary }: { eaten: number; goal: number; size?: number; color?: string }) {
  const r = 58, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(eaten / Math.max(goal, 1), 1);
  return (
    <Svg width={size} height={size} viewBox="0 0 140 140" style={{ transform: [{ rotate: '-90deg' }] }}>
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
  const [date, setDate] = useState(new Date());
  const profile = useAuthStore((s) => s.profile);
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

  // Persona-driven nutrition philosophy
  const persona = personaFromProgramId(profile?.selected_program);
  const nutritionTip = nutritionTipOfTheDay(persona);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header — persona-aware */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.monoLabel}>{format(date, 'EEE').toUpperCase()} · {persona.shortName} PROTOCOL</Text>
            <Text style={[styles.monoLabel, { color: persona.accent }]}>TDEE {goal}</Text>
          </View>
          <Text style={styles.headline}>
            {styleText(persona, persona.nutrition.headline)}
          </Text>
          <Text style={styles.philosophyLine}>
            {styleText(persona, persona.nutrition.style)}
          </Text>
        </View>

        {/* Persona nutrition tip of the day */}
        <View style={[styles.tipCard, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}>
          <Text style={[styles.tipLabel, { color: persona.accent }]}>
            ✦ {styleText(persona, `${persona.shortName} SAYS`)}
          </Text>
          <Text style={styles.tipText}>{nutritionTip}</Text>
        </View>

        {/* Big calorie ring + macros */}
        <View style={styles.ringSection}>
          <View style={styles.ringWrap}>
            <MacroRing eaten={consumed} goal={goal} color={persona.accent} />
            <View style={styles.ringCenter}>
              <Text style={styles.ringNum}>{consumed}</Text>
              <Text style={styles.ringMeta}>/ {goal} KCAL</Text>
            </View>
          </View>
          <View style={styles.macroStack}>
            {[
              { l: 'PROTEIN', v: protein, t: proteinGoal, c: Colors.macroProtein },
              { l: 'CARBS',   v: carbs,   t: carbsGoal,   c: Colors.primary },
              { l: 'FAT',     v: fat,     t: fatGoal,     c: Colors.macroFat },
            ].map((m) => (
              <View key={m.l} style={{ marginBottom: 10 }}>
                <View style={styles.macroLabelRow}>
                  <Text style={styles.macroMonoLabel}>{m.l}</Text>
                  <Text style={styles.macroNums}>
                    <Text style={[styles.macroVal, { color: m.c }]}>{m.v}</Text>
                    <Text style={styles.macroOf}>/{m.t}g</Text>
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min((m.v / Math.max(m.t, 1)) * 100, 100)}%` as any, backgroundColor: m.c }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Search row — quick-add to lunch by default; meal buttons below let user pick */}
        <TouchableOpacity style={styles.searchRow} onPress={() => setActiveMeal('lunch')} activeOpacity={0.7}>
          <View style={styles.searchInput}>
            <Text style={styles.searchIcon}>🔍</Text>
            <Text style={styles.searchPlaceholder}>Search Indian & global foods…</Text>
          </View>
        </TouchableOpacity>

        {/* Water tracker */}
        <View style={styles.waterCard}>
          <Text style={{ fontSize: 18 }}>💧</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.waterLabel}>WATER</Text>
            <View style={styles.waterBars}>
              {Array.from({ length: goalGlasses || 8 }).map((_, i) => (
                <View key={i} style={[styles.waterBar, { backgroundColor: i < glasses ? Colors.info : Colors.border }]} />
              ))}
            </View>
          </View>
          <Text style={styles.waterCount}>{glasses}<Text style={{ fontSize: 10, color: Colors.textSecondary }}>/{goalGlasses}</Text></Text>
          <TouchableOpacity onPress={() => addGlass()} style={styles.waterPlus}>
            <Text style={{ color: Colors.textSecondary, fontSize: 20 }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Meal cards */}
        {MEALS.map((meal) => {
          const mealKcal = Math.round(nutrition?.byMeal[meal.key] ?? 0);
          // Compute per-meal macro split proportional to its share of total calories
          const totalKcal = Math.max(1, Math.round(nutrition?.calories ?? 0));
          const share = mealKcal / totalKcal;
          const mP = Math.round((nutrition?.proteinG ?? 0) * share);
          const mC = Math.round((nutrition?.carbsG ?? 0)   * share);
          const mF = Math.round((nutrition?.fatG ?? 0)     * share);
          const macroLine = mealKcal > 0 ? `${mP}P · ${mC}C · ${mF}F` : '— · — · —';
          return (
            <View key={meal.key} style={styles.mealCard}>
              <TouchableOpacity
                style={styles.mealHeader}
                onPress={() => router.push({
                  pathname: '/add-food',
                  params: { mealType: meal.key, date: dateStr },
                } as any)}
                activeOpacity={0.7}
              >
                <View style={styles.mealTime}>
                  <Text style={[styles.mealTimeH, { color: Colors.primary }]}>{meal.time.split(':')[0]}</Text>
                  <Text style={styles.mealTimeM}>:{meal.time.split(':')[1]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mealLabel}>{meal.label}</Text>
                  <Text style={styles.mealMacro}>{macroLine}</Text>
                </View>
                <View style={styles.mealRight}>
                  <Text style={[styles.mealKcal, mealKcal > 0 && { color: Colors.primary }]}>
                    {mealKcal > 0 ? mealKcal : '—'}
                  </Text>
                  <Text style={styles.mealKcalUnit}>kcal</Text>
                </View>
                <Text style={styles.addPlus}>+</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* AI advice */}
        <View style={styles.aiCard}>
          <Text style={{ fontSize: 16 }}>✦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiLabel}>AI GAP ANALYSIS</Text>
            <Text style={styles.aiText}>
              {protein < proteinGoal * 0.8
                ? `Protein at ${Math.round((protein / Math.max(proteinGoal, 1)) * 100)}%. Add ${proteinGoal - protein}g protein to hit target.`
                : `Looking good! Protein on track.`}
            </Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14 },

  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, lineHeight: 32, letterSpacing: -0.6, marginTop: 6 },
  philosophyLine: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18, fontStyle: 'italic' },
  tipCard: {
    borderLeftWidth: 3, borderRadius: 4, padding: 12, marginBottom: 16,
  },
  tipLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, marginBottom: 5 },
  tipText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 18, fontStyle: 'italic' },

  ringSection: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  ringWrap: { width: 140, height: 140, position: 'relative', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text },
  ringMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, marginTop: 2 },
  macroStack: { flex: 1 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroMonoLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  macroNums: {},
  macroVal: { fontFamily: Fonts.display, fontSize: 16 },
  macroOf: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },

  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  barcodeBtn: {
    width: 44, height: 44, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },

  waterCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
  },
  waterLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  waterBars: { flexDirection: 'row', gap: 3, marginTop: 4 },
  waterBar: { flex: 1, height: 6, borderRadius: 1 },
  waterCount: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
  waterPlus: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  mealCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, marginBottom: 10,
  },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  mealTime: {
    width: 44, height: 44, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  mealTimeH: { fontFamily: Fonts.display, fontSize: 14, lineHeight: 16 },
  mealTimeM: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary },
  mealLabel: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 0.2 },
  mealMacro: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.6 },
  mealRight: { alignItems: 'flex-end' },
  mealKcal: { fontFamily: Fonts.display, fontSize: 18, color: Colors.textSecondary },
  mealKcalUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1 },
  addPlus: { fontSize: 22, color: Colors.primary, fontFamily: Fonts.display, paddingLeft: 4 },

  aiCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    padding: 14, marginTop: 4,
    backgroundColor: 'rgba(91,140,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(91,140,255,0.2)', borderRadius: 6,
  },
  aiLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.4, marginBottom: 4 },
  aiText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 18 },
});
