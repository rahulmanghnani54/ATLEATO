/**
 * /add-food — Full-screen Add Food page (replaces the bottom-sheet modal).
 *
 * Routed in via:
 *   router.push({ pathname: '/add-food', params: { mealType, date } })
 *
 * Functionally identical to the old FoodSearchModal but rendered as a
 * normal screen so it doesn't slide up / "bounce". After logging or
 * cancelling, we router.back() to wherever we came from (Eat tab).
 */
import { useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { type FoodItem } from '@/lib/api/openFoodFacts';
import { AddServingSheet } from '@/components/nutrition/AddServingSheet';
import { CustomFoodSheet } from '@/components/nutrition/CustomFoodSheet';
import { Colors, Spacing, Radius, Typography, Fonts } from '@/constants/theme';
import type { MealType } from '@/types/index';

export default function AddFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealType: MealType; date: string }>();
  const mealType = (params.mealType ?? 'snack') as MealType;
  const date = params.date ?? new Date().toISOString().slice(0, 10);

  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const { data: results = [], isFetching } = useFoodSearch(query);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  const handleCustomFoodCreated = (food: FoodItem) => {
    setCustomSheetOpen(false);
    queryClient.invalidateQueries({ queryKey: ['food-search'] });
    setSelectedFood(food);
  };

  const handleFoodLogged = () => {
    setSelectedFood(null);
    setQuery('');
    // Invalidate daily nutrition so the Eat tab refreshes immediately.
    // NOTE: useDailyNutrition's key is ['nutrition', userId, date] — the old
    // 'daily-nutrition' key matched nothing, leaving the Eat tab stale.
    queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    router.back();
  };

  const mealLabel = mealType.toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* While the serving popup is open, fully unmount the search UI so there's
          nothing rendered behind it — guarantees the popup never looks like it's
          "floating" over the food list, independent of the sheet's backdrop. */}
      {!selectedFood && (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.close}>← cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>ADD TO {mealLabel}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search any food — sushi, pizza, biryani, chicken…"
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status / empty / loading messaging */}
        {query.length < 2 && (
          <Text style={styles.hint}>
            🌍 Indian + 200+ global dishes + 1.2M packaged foods. Start typing — partial matches work.
          </Text>
        )}

        {isFetching && query.length >= 2 && (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        )}

        {results.length === 0 && query.length >= 2 && !isFetching && (
          <View style={styles.emptyState}>
            <Text style={styles.empty}>No matches for &quot;{query}&quot;.</Text>
            <Text style={styles.emptySub}>
              Add it as a custom food — saved on your device, shows up first next time.
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => setCustomSheetOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyAddBtnText}>+  ADD &quot;{query}&quot; AS CUSTOM FOOD</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => {
            const isCustom = item.brand === 'MY FOOD';
            return (
              <TouchableOpacity
                style={styles.result}
                onPress={() => setSelectedFood(item)}
                activeOpacity={0.7}
              >
                <View style={styles.resultBody}>
                  <View style={styles.foodNameRow}>
                    <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                    {isCustom && (
                      <View style={styles.myFoodTag}>
                        <Text style={styles.myFoodTagText}>MY FOOD</Text>
                      </View>
                    )}
                  </View>
                  {!isCustom && item.brand && (
                    <Text style={styles.brand} numberOfLines={1}>{item.brand}</Text>
                  )}
                </View>
                <View style={styles.kcalBadge}>
                  <Text style={styles.kcalNum}>{Math.round(item.calories100g)}</Text>
                  <Text style={styles.kcalUnit}>kcal/100g</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            results.length > 0 ? (
              <TouchableOpacity
                style={styles.addCustomFooter}
                onPress={() => setCustomSheetOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.addCustomFooterText}>
                  +  Don&apos;t see it? Add a custom food
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      </KeyboardAvoidingView>
      )}

      {/* Serving picker (small bottom sheet — keeps this) */}
      {selectedFood && (
        <AddServingSheet
          visible={!!selectedFood}
          food={selectedFood}
          mealType={mealType}
          date={date}
          onClose={() => setSelectedFood(null)}
          onLogged={handleFoodLogged}
        />
      )}

      {/* Custom food creator (small bottom sheet) */}
      <CustomFoodSheet
        visible={customSheetOpen}
        onClose={() => setCustomSheetOpen(false)}
        initialName={query}
        onCreated={handleCustomFoodCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 1.4 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: 16, marginBottom: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    flex: 1, height: 50,
    fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text,
  },
  clearBtn: { padding: 6 },
  clearBtnText: { fontSize: 14, color: Colors.textSecondary },

  hint: {
    fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary,
    textAlign: 'center', marginVertical: Spacing.md, lineHeight: 18,
    paddingHorizontal: 24,
  },
  loader: { marginVertical: Spacing.md },

  emptyState: { paddingHorizontal: Spacing.md, marginBottom: Spacing.md, marginHorizontal: 16 },
  empty: {
    fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text,
    textAlign: 'center', marginTop: Spacing.lg,
  },
  emptySub: {
    fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary,
    textAlign: 'center', marginTop: 6, lineHeight: 17,
  },
  emptyAddBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary,
    borderRadius: 4, paddingVertical: 14, alignItems: 'center',
  },
  emptyAddBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accentInk, letterSpacing: 0.6 },

  resultsList: { paddingHorizontal: 16 },

  result: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  resultBody: { flex: 1, marginRight: Spacing.sm },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foodName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  myFoodTag: {
    backgroundColor: Colors.primary, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  myFoodTagText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.accentInk, letterSpacing: 0.8 },
  brand: { ...Typography.caption, marginTop: 2, color: Colors.textSecondary },
  kcalBadge: { alignItems: 'flex-end' },
  kcalNum: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.primary },
  kcalUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.5 },

  addCustomFooter: {
    marginTop: 8, paddingVertical: 12, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  addCustomFooterText: {
    fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.primary, letterSpacing: 0.3,
  },
});
