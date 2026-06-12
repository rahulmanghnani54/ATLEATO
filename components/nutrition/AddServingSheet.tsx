import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet, Button } from '@/components/ui';
import { calculateMacrosForServing, type FoodItem } from '@/lib/api/openFoodFacts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { MealType } from '@/types/index';

interface Props {
  visible: boolean;
  food: FoodItem;
  mealType: MealType;
  date: string;
  onClose: () => void;
  onLogged: () => void;
}

export function AddServingSheet({ visible, food, mealType, date, onClose, onLogged }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [serving, setServing] = useState(String(food.servingSizeG));
  const [loading, setLoading] = useState(false);

  const servingG = parseFloat(serving) || 0;
  const macros = servingG > 0 ? calculateMacrosForServing(food, servingG) : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  const handleLog = async () => {
    if (!user || servingG <= 0) return;
    setLoading(true);

    const payload = {
      user_id: user.id,
      date,
      meal_type: mealType,
      food_name: food.name,
      brand: food.brand ?? null,
      barcode: food.barcode ?? null,
      serving_size_g: servingG,
      calories: macros.calories,
      protein_g: macros.proteinG,
      carbs_g: macros.carbsG,
      fat_g: macros.fatG,
      fiber_g: food.fiber100g != null ? Math.round(food.fiber100g * servingG / 100 * 10) / 10 : null,
      sugar_g: null,
      sodium_mg: null,
    };

    // Bug-fix: previously the request could hang indefinitely on flaky
    // networks, leaving the spinner spinning forever. Race with a 10s
    // timeout so we always resolve to either success or actionable error.
    const insertPromise = (supabase.from('nutrition_logs') as any).insert(payload);
    const timeoutPromise = new Promise<{ error: any }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'Request timed out — check your connection.', code: 'TIMEOUT' } }), 10_000),
    );
    const { error } = await Promise.race([insertPromise, timeoutPromise]);
    setLoading(false);

    if (error) {
      console.error('Log food error:', error.message, error.code, error.details);
      Alert.alert('Failed to Log', `Could not save this food entry.\n\n${error.message}`);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['nutrition'] });
    onLogged();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={food.name}>
      <Text style={styles.brand}>{food.brand ?? 'Generic'}</Text>

      <Text style={styles.label}>Serving size (grams)</Text>
      <TextInput
        style={styles.input}
        value={serving}
        onChangeText={setServing}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />

      {/* Macro preview */}
      <View style={styles.macroRow}>
        {[
          { label: 'Calories', value: macros.calories, unit: 'kcal', color: Colors.primary },
          { label: 'Protein', value: macros.proteinG, unit: 'g', color: '#3b82f6' },
          { label: 'Carbs', value: macros.carbsG, unit: 'g', color: '#f59e0b' },
          { label: 'Fat', value: macros.fatG, unit: 'g', color: '#ef4444' },
        ].map((m) => (
          <View key={m.label} style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: m.color }]}>{m.value}{m.unit}</Text>
            <Text style={styles.macroLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Button
        label={`Log to ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`}
        onPress={handleLog}
        loading={loading}
        disabled={servingG <= 0}
        fullWidth
        style={styles.logBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  brand: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.md },
  label: { ...Typography.label, marginBottom: 6 },
  input: {
    height: 52, backgroundColor: Colors.background, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    fontFamily: 'Inter_400Regular', fontSize: 16, color: Colors.text, marginBottom: Spacing.md,
  },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.background, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  macroLabel: { ...Typography.caption, marginTop: 2 },
  logBtn: { marginTop: 4 },
});
