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
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { X as XIcon } from 'lucide-react-native';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { calculateMacrosForServing, type FoodItem } from '@/lib/api/openFoodFacts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, Fonts } from '@/constants/theme';
import type { MealType } from '@/types/index';

interface MealItem { food: FoodItem; grams: number; }

const MEALS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.close}>← cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>BUILD A MEAL</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Meal-type chips */}
        <View style={styles.chipsRow}>
          {MEALS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, mealType === m && styles.chipActive]}
              onPress={() => setMealType(m)}
            >
              <Text style={[styles.chipText, mealType === m && styles.chipTextActive]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Running total */}
          {items.length > 0 && (
            <View style={styles.totalCard}>
              <Text style={styles.totalKcal}>{totals.calories} <Text style={styles.totalKcalUnit}>kcal</Text></Text>
              <View style={styles.totalMacros}>
                <Text style={[styles.totalMacro, { color: '#3b82f6' }]}>{totals.proteinG}g P</Text>
                <Text style={[styles.totalMacro, { color: '#f59e0b' }]}>{totals.carbsG}g C</Text>
                <Text style={[styles.totalMacro, { color: '#ef4444' }]}>{totals.fatG}g F</Text>
              </View>
            </View>
          )}

          {/* Current meal items */}
          {items.map((it, idx) => {
            const m = calculateMacrosForServing(it.food, it.grams);
            return (
              <View key={`${it.food.name}-${idx}`} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.food.name}</Text>
                  <Text style={styles.itemMacros}>{m.calories} kcal · {m.proteinG}P {m.carbsG}C {m.fatG}F</Text>
                </View>
                <View style={styles.gramsBox}>
                  <TextInput
                    style={styles.gramsInput}
                    value={String(it.grams)}
                    onChangeText={(t) => setGrams(idx, parseFloat(t) || 0)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Text style={styles.gramsUnit}>g</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={10} style={styles.removeBtn}>
                  <XIcon size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}

          {items.length === 0 && (
            <Text style={styles.emptyHint}>Search below and tap foods to add them to this meal.</Text>
          )}

          {/* Add-ingredient search */}
          <Text style={styles.sectionLabel}>ADD INGREDIENT</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search a food to add…"
              placeholderTextColor={Colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {isFetching && query.length >= 2 && <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />}

          {results.map((item) => (
            <TouchableOpacity key={item.id} style={styles.result} onPress={() => addItem(item)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                {item.brand && <Text style={styles.resultBrand} numberOfLines={1}>{item.brand}</Text>}
              </View>
              <Text style={styles.resultKcal}>{Math.round(item.calories100g)}<Text style={styles.resultKcalUnit}> kcal/100g</Text></Text>
            </TouchableOpacity>
          ))}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Log button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.logBtn, (items.length === 0 || logging) && { opacity: 0.4 }]}
            onPress={logMeal}
            disabled={items.length === 0 || logging}
            activeOpacity={0.85}
          >
            {logging ? (
              <ActivityIndicator color={Colors.accentInk} />
            ) : (
              <Text style={styles.logBtnText}>
                LOG MEAL TO {mealLabel.toUpperCase()}{items.length > 0 ? `  ·  ${items.length} item${items.length > 1 ? 's' : ''}` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 1.4 },

  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: Spacing.sm },
  chip: {
    flex: 1, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1,
    borderColor: Colors.border, alignItems: 'center',
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: 'rgba(224,90,38,0.10)' },
  chipText: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary },

  totalCard: {
    marginHorizontal: 16, marginBottom: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalKcal: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text },
  totalKcalUnit: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary },
  totalMacros: { flexDirection: 'row', gap: 12 },
  totalMacro: { fontFamily: Fonts.bodyBold, fontSize: 14 },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  itemName: { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text },
  itemMacros: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  gramsBox: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  gramsInput: {
    width: 56, height: 38, textAlign: 'center',
    backgroundColor: Colors.raised, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text,
  },
  gramsUnit: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary },
  removeBtn: { padding: 4 },

  emptyHint: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textTertiary,
    textAlign: 'center', marginVertical: Spacing.lg, paddingHorizontal: 24,
  },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.6, marginTop: Spacing.md, marginBottom: 8, marginHorizontal: 16,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  searchInput: { flex: 1, height: 48, fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text },
  clearBtn: { fontSize: 14, color: Colors.textSecondary, padding: 4 },

  result: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  resultName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  resultBrand: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resultKcal: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.primary },
  resultKcalUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg },
  logBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center' },
  logBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 0.6 },
});
