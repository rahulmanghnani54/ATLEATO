import { useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { BottomSheet } from '@/components/ui';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { type FoodItem } from '@/lib/api/openFoodFacts';
import { Spacing, Radius, Typography, Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import type { MealType } from '@/types/index';
import { AddServingSheet } from './AddServingSheet';
import { CustomFoodSheet } from './CustomFoodSheet';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  visible: boolean;
  onClose: () => void;
  mealType: MealType;
  date: string;
  onFoodLogged: () => void;
}

export function FoodSearchModal({ visible, onClose, mealType, date, onFoodLogged }: Props) {
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const { data: results = [], isFetching } = useFoodSearch(query);
  const { height: screenHeight } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // After a custom food is created, jump straight into the serving picker for it
  // and invalidate the search so it shows up at the top in future queries.
  const handleCustomFoodCreated = (food: FoodItem) => {
    setCustomSheetOpen(false);
    queryClient.invalidateQueries({ queryKey: ['food-search'] });
    setSelectedFood(food);
  };

  const handleFoodLogged = () => {
    setSelectedFood(null);
    setQuery('');
    onFoodLogged();
    onClose();
  };

  const handleClose = () => {
    setQuery('');
    setSelectedFood(null);
    onClose();
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={handleClose} title="Add Food">
        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search any food — sushi, pizza, biryani, chicken…"
            placeholderTextColor={tokens.textTertiary}
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

        {/* Status messages */}
        {query.length < 2 && (
          <Text style={styles.hint}>
            🌍 Indian + 200+ global dishes + 1.2M packaged foods. Start typing — partial matches work.
          </Text>
        )}

        {isFetching && query.length >= 2 && (
          <ActivityIndicator color={tokens.accent} style={styles.loader} />
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

        {/* Results — NOTE: no flex:1, only maxHeight so Yoga gives it a real height */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isCustom = item.brand === 'MY FOOD';
            return (
              <TouchableOpacity style={styles.result} onPress={() => setSelectedFood(item)} activeOpacity={0.7}>
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
          style={{ maxHeight: screenHeight * 0.42 }}
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
      </BottomSheet>

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

      <CustomFoodSheet
        visible={customSheetOpen}
        onClose={() => setCustomSheetOpen(false)}
        initialName={query}
        onCreated={handleCustomFoodCreated}
      />
    </>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md,
      backgroundColor: t.bgAlt, borderRadius: Radius.md, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: Spacing.md,
    },
    searchInput: {
      flex: 1, height: 50,
      fontFamily: 'Inter_400Regular', fontSize: 15, color: t.text,
    },
    clearBtn: { padding: 6 },
    clearBtnText: { fontSize: 14, color: t.textSecondary },
    hint: {
      fontFamily: Fonts.body, fontSize: 12, color: t.textSecondary,
      textAlign: 'center', marginVertical: Spacing.md, lineHeight: 18,
    },
    loader: { marginVertical: Spacing.md },
    empty: {
      fontFamily: Fonts.bodySemi, fontSize: 14, color: t.text,
      textAlign: 'center', marginTop: Spacing.lg,
    },
    emptySub: {
      fontFamily: Fonts.body, fontSize: 12, color: t.textSecondary,
      textAlign: 'center', marginTop: 6, lineHeight: 17,
    },
    emptyState: { paddingHorizontal: Spacing.sm, marginBottom: Spacing.md },
    emptyAddBtn: {
      marginTop: Spacing.md, backgroundColor: t.accent,
      // The emerald fill is under 3:1 on the light page, so the deep-tone
      // hairline is what gives the button an identifiable boundary.
      borderWidth: 1, borderColor: t.accentLine,
      borderRadius: 4, paddingVertical: 14, alignItems: 'center',
    },
    emptyAddBtnText: { fontFamily: Fonts.display, fontSize: 12, color: t.accentInk, letterSpacing: 0.6 },

    result: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    resultBody: { flex: 1, marginRight: Spacing.sm },
    foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    foodName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.text },
    myFoodTag: {
      backgroundColor: t.accent, borderRadius: 3,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    myFoodTagText: { fontFamily: Fonts.mono, fontSize: 8, color: t.accentInk, letterSpacing: 0.8 },
    brand: { ...Typography.caption, marginTop: 2, color: t.textSecondary },
    kcalBadge: { alignItems: 'flex-end' },
    // Emerald AS TEXT needs the AA-safe deep tone, not the fill emerald.
    kcalNum: { fontFamily: 'Inter_700Bold', fontSize: 15, color: t.accentText },
    kcalUnit: { fontFamily: Fonts.mono, fontSize: 9, color: t.textTertiary, letterSpacing: 0.5 },

    addCustomFooter: {
      marginTop: 8, paddingVertical: 12, alignItems: 'center',
      borderTopWidth: 1, borderTopColor: t.border,
    },
    addCustomFooterText: {
      fontFamily: Fonts.bodySemi, fontSize: 12, color: t.accentText, letterSpacing: 0.3,
    },
  });
