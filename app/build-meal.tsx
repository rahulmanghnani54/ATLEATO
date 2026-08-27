/**
 * /build-meal — Compose a custom meal from multiple ingredients, then log the
 * whole thing to a chosen meal slot in one go.
 *
 * Each ingredient keeps its own serving size (grams); the running total shows
 * the combined macros. On "Log meal", every ingredient is written as its own
 * nutrition_logs row (so the Eat tab + Home macros reflect each item and the
 * combined totals are correct).
 *
 * Routed in via:
 *   router.push({ pathname: '/build-meal', params: { mealType, date } })
 *
 * Bold Canvas notes — this is a construction utility, so clarity beats drama:
 *   - No <Crown>. The keyboard is in play the whole time (grams fields + the
 *     ingredient search), and a full-bleed dark hero would eat the room the
 *     result list needs. The hero is instead the running kcal total, which is
 *     the one number that changes as you build.
 *   - Ingredients and search results are borderless <ListRow>s; every figure is
 *     a tabular numeral so the column stays still while you edit grams.
 *   - The accent is spent ONCE, on the pinned "log meal" control. The selected
 *     meal chip therefore reads as an ink fill, not a second emerald.
 */
import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, X as XIcon } from 'lucide-react-native';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { calculateMacrosForServing, type FoodItem } from '@/lib/api/openFoodFacts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  BigStat, CanvasScreen, Hairline, ListRow, Section, StatRow,
} from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import type { MealType } from '@/types/index';

interface MealItem { food: FoodItem; grams: number; }

const MEALS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Matches Crown's own horizontal inset, so a pushed screen lines up with the tabs. */
const H_PAD = 22;

/** Placeholder rows while the first page of ingredient results is in flight. */
const SKELETON_ROWS = [0, 1, 2, 3];

export default function BuildMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealType?: MealType; date?: string }>();
  const date = params.date ?? new Date().toISOString().slice(0, 10);
  const [mealType, setMealType] = useState<MealType>((params.mealType as MealType) ?? 'lunch');
  const [query, setQuery] = useState('');
  const { data: results = [], isFetching } = useFoodSearch(query);
  const [items, setItems] = useState<MealItem[]>([]);
  const [logging, setLogging] = useState(false);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const totals = items.reduce(
    (acc, it) => {
      const m = calculateMacrosForServing(it.food, it.grams);
      return {
        calories: acc.calories + m.calories,
        proteinG: Math.round((acc.proteinG + m.proteinG) * 10) / 10,
        carbsG: Math.round((acc.carbsG + m.carbsG) * 10) / 10,
        fatG: Math.round((acc.fatG + m.fatG) * 10) / 10,
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const addItem = (food: FoodItem) => {
    setItems((prev) => [...prev, { food, grams: food.servingSizeG || 100 }]);
    setQuery('');
  };
  const setGrams = (idx: number, grams: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, grams } : it)));
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const logMeal = async () => {
    if (!user || items.length === 0 || logging) return;
    setLogging(true);
    const rows = items.map((it) => {
      const m = calculateMacrosForServing(it.food, it.grams);
      return {
        user_id: user.id, date, meal_type: mealType,
        food_name: it.food.name, brand: it.food.brand ?? null, barcode: it.food.barcode ?? null,
        serving_size_g: it.grams,
        calories: m.calories, protein_g: m.proteinG, carbs_g: m.carbsG, fat_g: m.fatG,
        fiber_g: it.food.fiber100g != null ? Math.round((it.food.fiber100g * it.grams) / 100 * 10) / 10 : null,
        sugar_g: null, sodium_mg: null,
      };
    });
    // Timeout-guarded insert (same pattern as single-food logging).
    const insertPromise = (supabase.from('nutrition_logs') as any).insert(rows);
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'Request timed out — check your connection.' } }), 15_000),
    );
    const { error } = await Promise.race([insertPromise, timeoutPromise]);
    setLogging(false);
    if (error) { Alert.alert('Failed to log meal', error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    router.back();
  };

  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const disabled = items.length === 0 || logging;

  return (
    <CanvasScreen scroll={false} topInset tabBar={false} contentStyle={styles.body}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.topBar}>
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            scaleTo={0.92}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={styles.backBtn}
          >
            <ArrowLeft size={19} color={tokens.text} />
          </PressableScale>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollBody}
        >
          {/* Running total — the hero. Ticks as ingredients are added or resized. */}
          <Text style={styles.eyebrow}>Build a meal</Text>
          <BigStat value={totals.calories} unit="kcal" label="Running total" size={54} />

          {items.length > 0 && (
            <StatRow style={styles.macros}>
              <View>
                <BigStat value={totals.proteinG} unit="g" label="Protein" size={27} />
                {/* A colour KEY, not a progress rail — a built meal has no goal
                    to fill, so the swatch only names which macro this is. */}
                <View style={[styles.swatch, { backgroundColor: tokens.macroProtein }]} />
              </View>
              <View>
                <BigStat value={totals.carbsG} unit="g" label="Carbs" size={27} />
                <View style={[styles.swatch, { backgroundColor: tokens.macroCarbs }]} />
              </View>
              <View>
                <BigStat value={totals.fatG} unit="g" label="Fat" size={27} />
                <View style={[styles.swatch, { backgroundColor: tokens.macroFat }]} />
              </View>
            </StatRow>
          )}

          {/* Meal-type chips — wrapped, never a horizontal ScrollView: chip
              glyphs drop out of a release build inside one. */}
          <Section label="Log to">
            <View style={styles.chipsRow}>
              {MEALS.map((m) => {
                const on = mealType === m;
                return (
                  <PressableScale
                    key={m}
                    onPress={() => setMealType(m)}
                    haptic="light"
                    scaleTo={0.95}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, on && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextActive]} numberOfLines={1}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Section>

          {/* Current meal items */}
          <Section
            label="Ingredients"
            right={
              items.length > 0 ? (
                <Text style={styles.sectionCount}>{items.length}</Text>
              ) : null
            }
          >
            {items.map((it, idx) => {
              const m = calculateMacrosForServing(it.food, it.grams);
              return (
                <ListRow
                  key={`${it.food.name}-${idx}`}
                  title={it.food.name}
                  subtitle={`${m.calories} kcal · ${m.proteinG}P ${m.carbsG}C ${m.fatG}F`}
                  last={idx === items.length - 1}
                  right={
                    <View style={styles.trailing}>
                      <View style={styles.gramsBox}>
                        <TextInput
                          style={styles.gramsInput}
                          value={String(it.grams)}
                          onChangeText={(t) => setGrams(idx, parseFloat(t) || 0)}
                          keyboardType="decimal-pad"
                          selectionColor={tokens.accent}
                          selectTextOnFocus
                          accessibilityLabel={`Grams of ${it.food.name}`}
                        />
                        <Text style={styles.gramsUnit}>g</Text>
                      </View>
                      <PressableScale
                        onPress={() => removeItem(idx)}
                        haptic="light"
                        scaleTo={0.88}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${it.food.name}`}
                        style={styles.removeBtn}
                      >
                        <XIcon size={16} color={tokens.textTertiary} />
                      </PressableScale>
                    </View>
                  }
                />
              );
            })}

            {items.length === 0 && (
              <Text style={styles.emptyHint}>
                Search below and tap foods to add them to this meal.
              </Text>
            )}
          </Section>

          {/* Add-ingredient search */}
          <Section label="Add ingredient">
            <View style={styles.searchRow}>
              <Search size={18} color={tokens.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search a food to add…"
                placeholderTextColor={tokens.textTertiary}
                selectionColor={tokens.accent}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <PressableScale
                  onPress={() => setQuery('')}
                  haptic="light"
                  scaleTo={0.9}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.clearBtn}
                >
                  <XIcon size={15} color={tokens.textSecondary} />
                </PressableScale>
              )}
            </View>

            {isFetching && query.length >= 2 && (
              <View style={styles.loading}>
                {/* A hairline shimmer always marks the fetch. Full placeholder
                    rows only when there is nothing cached to keep on screen —
                    otherwise they'd shove the previous results down mid-typing. */}
                <Skeleton height={3} radius={999} />
                {results.length === 0 && (
                  <View>
                    {SKELETON_ROWS.map((i) => (
                      <View key={i}>
                        <View style={styles.skeletonRow}>
                          <View style={styles.skeletonText}>
                            <Skeleton height={14} width={i % 2 === 0 ? '72%' : '54%'} radius={4} />
                            <Skeleton height={10} width="32%" radius={4} />
                          </View>
                          <Skeleton height={22} width={44} radius={4} />
                        </View>
                        <Hairline />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {results.map((item, idx) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={item.brand ? item.brand : undefined}
                onPress={() => addItem(item)}
                last={idx === results.length - 1}
                right={
                  <View style={styles.kcalBadge}>
                    <Text style={styles.kcalNum}>{Math.round(item.calories100g)}</Text>
                    <Text style={styles.kcalUnit}>kcal/100g</Text>
                  </View>
                }
              />
            ))}
          </Section>
        </ScrollView>

        {/* Log button — in flow, so it reserves its own room and nothing can
            scroll underneath it. */}
        <Hairline style={styles.footerRule} />
        <View style={styles.footer}>
          <PressableScale
            onPress={logMeal}
            disabled={disabled}
            haptic="heavy"
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            // The hairline is load-bearing: brand emerald is 2.54:1 on white, so
            // this outline is what gives the control an identifiable edge.
            style={styles.logBtn}
          >
            {logging ? (
              <ActivityIndicator color={tokens.accentInk} />
            ) : (
              <Text style={styles.logBtnText}>
                LOG MEAL TO {mealLabel.toUpperCase()}{items.length > 0 ? `  ·  ${items.length} item${items.length > 1 ? 's' : ''}` : ''}
              </Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: H_PAD },
  scrollBody: { paddingBottom: 28 },

  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginBottom: 18 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },

  eyebrow: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.7,
    textTransform: 'uppercase', color: t.textTertiary, marginBottom: 12,
  },

  macros: { marginTop: 26 },
  swatch: { height: 3, width: 20, marginTop: 9 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: t.surfaceAlt, borderRadius: 999,
    paddingHorizontal: 15, paddingVertical: 9,
  },
  // Ink, not emerald: the accent is spent once, on the log control.
  chipActive: { backgroundColor: t.text },
  chipText: { fontFamily: Fonts.bodySemi, fontSize: 12.5, color: t.textSecondary, letterSpacing: -0.1 },
  chipTextActive: { color: t.bg },

  sectionCount: {
    fontFamily: Fonts.displayBold, fontSize: 13, color: t.textTertiary,
    letterSpacing: -0.3, fontVariant: ['tabular-nums'],
  },

  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gramsBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gramsInput: {
    width: 58, height: 38, textAlign: 'center',
    backgroundColor: t.surfaceAlt, borderRadius: 19,
    fontFamily: Fonts.displayMedium, fontSize: 15, color: t.text,
    letterSpacing: -0.2, fontVariant: ['tabular-nums'],
  },
  gramsUnit: { fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.2, color: t.textTertiary },
  removeBtn: { padding: 6 },

  emptyHint: {
    fontFamily: Fonts.body, fontSize: 13.5, color: t.textTertiary,
    lineHeight: 20, paddingVertical: 4,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.surfaceAlt, borderRadius: 27,
    paddingHorizontal: 18, height: 54,
  },
  searchInput: {
    flex: 1, height: 54,
    fontFamily: Fonts.body, fontSize: 15, color: t.text,
  },
  clearBtn: { padding: 4 },

  loading: { marginTop: 18, gap: 20 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  skeletonText: { flex: 1, gap: 8 },

  kcalBadge: { alignItems: 'flex-end', gap: 2 },
  kcalNum: {
    fontFamily: Fonts.displayBold, fontSize: 21, lineHeight: 22,
    letterSpacing: -0.95, color: t.text, fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.2, color: t.textTertiary,
  },

  footerRule: { marginHorizontal: -H_PAD },
  footer: { paddingTop: 16 },
  logBtn: {
    backgroundColor: t.accent,
    borderWidth: 1, borderColor: t.accentLine,
    borderRadius: 29, minHeight: 58,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  logBtnText: {
    fontFamily: Fonts.bodySemi, fontSize: 12, color: t.accentInk, letterSpacing: 1.2,
    textAlign: 'center',
  },
});
