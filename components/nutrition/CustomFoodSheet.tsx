/**
 * CustomFoodSheet
 *
 * Bottom-sheet form for adding a user's own food to the local database.
 * Shown when search has no results, or via "+ Add custom food" CTA.
 *
 * Auto-calculates calories from macros if the user only fills protein/carbs/fat
 * (4P + 4C + 9F per gram). Or accepts an explicit calorie value if provided.
 *
 * On save: persists via `addCustomFood`, then bubbles the new FoodItem up so
 * the caller can immediately open the serving picker for it.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { BottomSheet } from '@/components/ui';
import { addCustomFood } from '@/lib/customFoods';
import { type FoodItem } from '@/lib/api/openFoodFacts';
import { Colors, Fonts, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialName?: string;          // pre-fill from the search query
  onCreated: (food: FoodItem) => void;
}

export function CustomFoodSheet({ visible, onClose, initialName = '', onCreated }: Props) {
  const [name, setName]       = useState(initialName);
  const [calories, setCals]   = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs]     = useState('');
  const [fat, setFat]         = useState('');
  const [serving, setServing] = useState('');
  const [saving, setSaving]   = useState(false);

  // Live-derived calories from macros (4P + 4C + 9F per g) — shown as hint
  const calcFromMacros = useMemo(() => {
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs)   || 0;
    const f = parseFloat(fat)     || 0;
    return Math.round(p * 4 + c * 4 + f * 9);
  }, [protein, carbs, fat]);

  const reset = () => {
    setName(''); setCals(''); setProtein(''); setCarbs(''); setFat(''); setServing('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      Alert.alert('Name required', 'Give your food a name (at least 2 characters).');
      return;
    }
    const calsNum     = parseFloat(calories) || calcFromMacros;
    const proteinNum  = parseFloat(protein)  || 0;
    const carbsNum    = parseFloat(carbs)    || 0;
    const fatNum      = parseFloat(fat)      || 0;
    const servingNum  = parseFloat(serving)  || 100;
    if (calsNum <= 0) {
      Alert.alert('Calories required', 'Enter calories per 100g, or any of protein/carbs/fat.');
      return;
    }

    setSaving(true);
    try {
      const food = await addCustomFood({
        name:         trimmedName,
        calories100g: calsNum,
        protein100g:  proteinNum,
        carbs100g:    carbsNum,
        fat100g:      fatNum,
        servingSizeG: servingNum,
      });
      reset();
      onCreated(food);
    } catch {
      Alert.alert('Save failed', 'Could not save the food. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Add Custom Food">
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.helper}>
          All values are per 100g. Calories will auto-calculate from macros if you leave it blank.
        </Text>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grandma's Chicken Curry"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            maxLength={80}
          />
        </View>

        {/* Calories */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>CALORIES (per 100g)</Text>
            {calcFromMacros > 0 && !calories && (
              <Text style={styles.hint}>auto: {calcFromMacros} kcal</Text>
            )}
          </View>
          <TextInput
            style={styles.input}
            value={calories}
            onChangeText={setCals}
            placeholder={calcFromMacros > 0 ? `e.g. ${calcFromMacros}` : 'e.g. 180'}
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
            maxLength={6}
          />
        </View>

        {/* Macros row */}
        <View style={styles.macroRow}>
          <View style={[styles.field, styles.macroField]}>
            <Text style={styles.label}>PROTEIN g</Text>
            <TextInput
              style={styles.input}
              value={protein}
              onChangeText={setProtein}
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
          <View style={[styles.field, styles.macroField]}>
            <Text style={styles.label}>CARBS g</Text>
            <TextInput
              style={styles.input}
              value={carbs}
              onChangeText={setCarbs}
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
          <View style={[styles.field, styles.macroField]}>
            <Text style={styles.label}>FAT g</Text>
            <TextInput
              style={styles.input}
              value={fat}
              onChangeText={setFat}
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
        </View>

        {/* Serving size (optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>DEFAULT SERVING (g, optional)</Text>
          <TextInput
            style={styles.input}
            value={serving}
            onChangeText={setServing}
            placeholder="100"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveText}>{saving ? 'SAVING…' : 'SAVE FOOD'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tinyNote}>
          Your custom foods are saved on this device and appear at the top of search results.
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary,
    marginBottom: 16, lineHeight: 17, fontStyle: 'italic',
  },
  field: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  label: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.4, marginBottom: 4,
  },
  hint: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary, letterSpacing: 1 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: Fonts.body, fontSize: 14, color: Colors.text,
  },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroField: { flex: 1 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.8 },
  saveBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center',
  },
  saveText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 0.8 },

  tinyNote: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 14, fontStyle: 'italic', letterSpacing: 0.4,
  },
});
