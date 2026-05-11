import { useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { BottomSheet } from '@/components/ui';
import { useFoodSearch } from '@/hooks/useFoodSearch';
import { type FoodItem } from '@/lib/api/openFoodFacts';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { MealType } from '@/types/index';
import { AddServingSheet } from './AddServingSheet';

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
  const { data: results = [], isFetching } = useFoodSearch(query);

  const handleScanBarcode = async () => {
    // Expo Camera barcode scanning is handled in the parent screen
    // For now, show an informational message
    Alert.alert('Barcode Scan', 'Open the camera and point at a barcode to scan food.');
  };

  const handleFoodLogged = () => {
    setSelectedFood(null);
    setQuery('');
    onFoodLogged();
    onClose();
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Add Food">
        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search foods..."
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.scanBtn} onPress={handleScanBarcode}>
            <Text style={styles.scanIcon}>📷</Text>
          </TouchableOpacity>
        </View>

        {isFetching && query.length >= 2 && (
          <ActivityIndicator color={Colors.primary} style={styles.loader} />
        )}

        {results.length === 0 && query.length >= 2 && !isFetching && (
          <Text style={styles.empty}>No results found. Try a different search.</Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.result} onPress={() => setSelectedFood(item)}>
              <View style={styles.resultBody}>
                <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                {item.brand && <Text style={styles.brand} numberOfLines={1}>{item.brand}</Text>}
              </View>
              <Text style={styles.kcal}>{Math.round(item.calories100g)} kcal/100g</Text>
            </TouchableOpacity>
          )}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
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
    </>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: {
    flex: 1, height: 48, backgroundColor: Colors.background, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text,
  },
  scanBtn: {
    width: 48, height: 48, backgroundColor: Colors.background, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  scanIcon: { fontSize: 22 },
  loader: { marginVertical: Spacing.md },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginVertical: Spacing.lg },
  list: { maxHeight: 300 },
  result: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  resultBody: { flex: 1, marginRight: Spacing.sm },
  foodName: { ...Typography.bodyMedium },
  brand: { ...Typography.caption, marginTop: 2 },
  kcal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
});
