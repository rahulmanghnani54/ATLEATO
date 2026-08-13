/**
 * /add-food — Full-screen Add Food page (replaces the bottom-sheet modal).
 *
 * Routed in via:
 *   router.push({ pathname: '/add-food', params: { mealType, date } })
 *
 * Functionally identical to the old FoodSearchModal but rendered as a
 * normal screen so it doesn't slide up / "bounce". After logging or
 * cancelling, we router.back() to wherever we came from (Eat tab).
 *
 * Bold Canvas notes — this is a search-and-log utility, so clarity beats drama:
 *   - No <Crown>. The keyboard opens on mount (autoFocus), so a full-bleed dark
 *     hero would eat the space the result list needs. The hero is instead a
 *     light "Add to / <Meal>" pair, same as the pushed profile screen.
 *   - Results are borderless <ListRow>s; the calorie figure is the right-aligned
 *     tabular numeral, the only number the eye has to find.
 *   - The accent is spent once, on the "add as custom food" action — and the
 *     empty-state CTA and the list footer are mutually exclusive states.
 */
import { useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react-native';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { type FoodItem } from '@/lib/api/openFoodFacts';
import { AddServingSheet } from '@/components/nutrition/AddServingSheet';
import { CustomFoodSheet } from '@/components/nutrition/CustomFoodSheet';
import { CanvasScreen, Hairline, ListRow } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import type { MealType } from '@/types/index';

/** Matches Crown's own horizontal inset, so a pushed screen lines up with the tabs. */
const H_PAD = 22;

/** Placeholder rows while the very first page of results is in flight. */
const SKELETON_ROWS = [0, 1, 2, 3, 4];

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

  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

  const mealTitle = mealType.charAt(0).toUpperCase() + mealType.slice(1);

  return (
    <CanvasScreen scroll={false} topInset tabBar={false} contentStyle={styles.body}>
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

        <Text style={styles.eyebrow}>Add to</Text>
        <Text style={styles.hero} numberOfLines={1}>{mealTitle}</Text>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <Search size={18} color={tokens.textTertiary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search any food — sushi, pizza, biryani, chicken…"
            placeholderTextColor={tokens.textTertiary}
            selectionColor={tokens.accent}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <PressableScale
              haptic="light"
              scaleTo={0.9}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={styles.clearBtn}
              onPress={() => setQuery('')}
            >
              <X size={15} color={tokens.textSecondary} />
            </PressableScale>
          )}
        </View>

        {/* Status / empty / loading messaging */}
        {query.length < 2 && (
          <Text style={styles.hint}>
            🌍 Indian + 200+ global dishes + 1.2M packaged foods. Start typing — partial matches work.
          </Text>
        )}

        {isFetching && query.length >= 2 && (
          <View style={styles.loading}>
            {/* A hairline-thin shimmer always marks the fetch. Full placeholder
                rows only when there is nothing cached to keep on screen —
                otherwise they'd shove the previous results down mid-typing. */}
            <Skeleton height={3} radius={999} />
            {results.length === 0 && (
              <View style={styles.skeletonList}>
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

        {results.length === 0 && query.length >= 2 && !isFetching && (
          <View style={styles.emptyState}>
            <Text style={styles.empty}>No matches for &quot;{query}&quot;.</Text>
            <Text style={styles.emptySub}>
              Add it as a custom food — saved on your device, shows up first next time.
            </Text>
            <PressableScale
              style={styles.emptyAddBtn}
              onPress={() => setCustomSheetOpen(true)}
              haptic="medium"
              scaleTo={0.97}
              accessibilityRole="button"
            >
              <Text style={styles.emptyAddBtnText}>+  ADD &quot;{query}&quot; AS CUSTOM FOOD</Text>
            </PressableScale>
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
              <ListRow
                title={item.name}
                subtitle={!isCustom && item.brand ? item.brand : undefined}
                onPress={() => setSelectedFood(item)}
                right={
                  <View style={styles.trailing}>
                    {isCustom && (
                      <View style={styles.myFoodTag}>
                        <Text style={styles.myFoodTagText}>MY FOOD</Text>
                      </View>
                    )}
                    <View style={styles.kcalBadge}>
                      <Text style={styles.kcalNum}>{Math.round(item.calories100g)}</Text>
                      <Text style={styles.kcalUnit}>kcal/100g</Text>
                    </View>
                  </View>
                }
              />
            );
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            results.length > 0 ? (
              // The last row's own hairline is this footer's top rule — no border here.
              <PressableScale
                style={styles.addCustomFooter}
                onPress={() => setCustomSheetOpen(true)}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="button"
              >
                <Text style={styles.addCustomFooterText}>
                  +  Don&apos;t see it? Add a custom food
                </Text>
              </PressableScale>
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
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: H_PAD },

  topBar: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginBottom: 18 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },

  eyebrow: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.7,
    textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10,
  },
  hero: {
    fontFamily: Fonts.displayBold, fontSize: 34, lineHeight: 37,
    // -0.045em at 34px.
    letterSpacing: -1.53, color: t.text,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 22, marginBottom: 6,
    backgroundColor: t.surfaceAlt, borderRadius: 27,
    paddingHorizontal: 18, height: 54,
  },
  searchInput: {
    flex: 1, height: 54,
    fontFamily: Fonts.body, fontSize: 15, color: t.text,
  },
  clearBtn: { padding: 4 },

  hint: {
    fontFamily: Fonts.body, fontSize: 13, color: t.textTertiary,
    marginTop: 22, lineHeight: 21,
  },
  loading: { marginTop: 18, gap: 20 },
  skeletonList: { gap: 0 },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15,
  },
  skeletonText: { flex: 1, gap: 8 },

  emptyState: { marginTop: 30 },
  empty: {
    fontFamily: Fonts.displayBold, fontSize: 27, lineHeight: 31,
    letterSpacing: -1.2, color: t.text,
  },
  emptySub: {
    fontFamily: Fonts.body, fontSize: 13.5, color: t.textSecondary,
    marginTop: 10, lineHeight: 20,
  },
  emptyAddBtn: {
    marginTop: 24, backgroundColor: t.accent,
    // Brand emerald is only 2.54:1 on white — a fill needs its own hairline.
    borderWidth: 1, borderColor: t.accentLine,
    borderRadius: 27, paddingVertical: 17, alignItems: 'center',
  },
  emptyAddBtnText: {
    fontFamily: Fonts.bodySemi, fontSize: 12, color: t.accentInk, letterSpacing: 1.2,
  },

  resultsList: { paddingTop: 12, paddingBottom: 28 },

  trailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  myFoodTag: {
    backgroundColor: t.surfaceAlt, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  myFoodTagText: {
    fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.3, color: t.textTertiary,
  },
  kcalBadge: { alignItems: 'flex-end', gap: 2 },
  kcalNum: {
    fontFamily: Fonts.displayBold, fontSize: 21, lineHeight: 22,
    letterSpacing: -0.95, color: t.text, fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.2, color: t.textTertiary,
  },

  addCustomFooter: { marginTop: 4, paddingVertical: 18, alignItems: 'center' },
  addCustomFooterText: {
    fontFamily: Fonts.bodySemi, fontSize: 13, color: t.accentText, letterSpacing: 0.2,
  },
});
