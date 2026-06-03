/**
 * /food-photo-scan — AI-powered food macro estimator (PRO feature).
 *
 * Flow: camera/gallery → upload → loading → results → portion adjust → log
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccess } from '@/lib/featureGates';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FoodMatch {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  confidence: number;
}

type Step = 'capture' | 'analyzing' | 'results' | 'logging';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? Colors.success : pct >= 45 ? Colors.warning : Colors.textSecondary;
  return (
    <View style={[badgeStyles.wrap, { borderColor: color }]}>
      <Text style={[badgeStyles.text, { color }]}>{pct}% match</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: Radius.xs, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.8 },
});

function MacroRow({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={macroRowStyles.row}>
      <Text style={macroRowStyles.label}>{label}</Text>
      <Text style={[macroRowStyles.value, { color }]}>
        {value}<Text style={macroRowStyles.unit}>{unit}</Text>
      </Text>
    </View>
  );
}
const macroRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  label: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.2 },
  value: { fontFamily: Fonts.display, fontSize: 18 },
  unit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FoodPhotoScan() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [matches, setMatches] = useState<FoodMatch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [multiplier, setMultiplier] = useState('1.0');
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!canAccess('food_scan')) {
      router.replace('/paywall?feature=food_scan' as any);
    }
  }, []);

  // ── image capture / pick ────────────────────────────────────────────────

  const captureImage = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to continue.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: false,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to continue.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: false,
      });
    }

    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setImageUri(uri);
    await analyzeImage(uri);
  };

  const promptCapture = () => {
    Alert.alert('Add food photo', 'Choose source', [
      { text: 'Take Photo', onPress: () => captureImage('camera') },
      { text: 'Photo Library', onPress: () => captureImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── call edge function ──────────────────────────────────────────────────

  const analyzeImage = async (uri: string) => {
    setStep('analyzing');
    try {
      // Convert image to base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.functions.invoke('analyze-food-photo', {
        body: { image_base64: base64 },
      });

      if (error) throw error;

      const result = data as { matches: FoodMatch[] };
      if (!result?.matches?.length) throw new Error('No matches returned');

      setMatches(result.matches);
      setSelectedIndex(0);
      setMultiplier('1.0');
      setStep('results');
    } catch (err) {
      Alert.alert(
        'Analysis failed',
        'Could not identify the food. Please try again with a clearer photo.',
        [{ text: 'OK', onPress: () => setStep('capture') }],
      );
    }
  };

  // ── log to nutrition ────────────────────────────────────────────────────

  const handleLog = async () => {
    if (!user?.id) return;
    const food = matches[selectedIndex];
    const mult = Math.max(0.1, parseFloat(multiplier) || 1);
    setLogging(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase.from('nutrition_logs') as any).insert({
        user_id: user.id,
        date: today,
        meal_type: 'snack',
        food_name: food.food_name,
        serving_size: food.serving_size,
        calories: Math.round(food.calories * mult),
        protein_g: Math.round(food.protein * mult),
        carbs_g: Math.round(food.carbs * mult),
        fat_g: Math.round(food.fat * mult),
        source: 'ai_photo_scan',
      });
      if (error) throw error;
      Alert.alert('Logged!', `${food.food_name} added to today's nutrition.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save to nutrition log. Please try again.');
    } finally {
      setLogging(false);
    }
  };

  // ── derived ─────────────────────────────────────────────────────────────

  const selectedFood = matches[selectedIndex];
  const mult = Math.max(0.1, parseFloat(multiplier) || 1);

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.closeBtn}>← back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI FOOD SCANNER</Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      </View>

      {/* ── CAPTURE step ─────────────────────────────────────────── */}
      {step === 'capture' && (
        <View style={styles.captureContainer}>
          <View style={styles.previewBox}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.cameraIcon}>📷</Text>
                <Text style={styles.captureHint}>Snap or upload a food photo</Text>
                <Text style={styles.captureSubHint}>Works best for whole plates, single items, or packaged food</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={promptCapture} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>TAP TO SCAN FOOD</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ANALYZING step ────────────────────────────────────────── */}
      {step === 'analyzing' && (
        <View style={styles.analyzingContainer}>
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.thumbImage} resizeMode="cover" />
          )}
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 24 }} />
          <Text style={styles.analyzingTitle}>ANALYZING PHOTO</Text>
          <Text style={styles.analyzingSubtitle}>Estimating macros from your food photo…</Text>
        </View>
      )}

      {/* ── RESULTS step ──────────────────────────────────────────── */}
      {step === 'results' && selectedFood && (
        <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
          {/* Thumbnail */}
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.resultThumb} resizeMode="cover" />
          )}

          {/* Match selector */}
          <Text style={styles.sectionLabel}>AI DETECTED</Text>
          {matches.map((match, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.matchCard, idx === selectedIndex && styles.matchCardSelected]}
              onPress={() => setSelectedIndex(idx)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.matchName, idx === selectedIndex && { color: Colors.primary }]}>
                  {match.food_name}
                </Text>
                <Text style={styles.matchServing}>{match.serving_size}</Text>
              </View>
              <View style={styles.matchRight}>
                <ConfidenceBadge value={match.confidence} />
                <Text style={styles.matchCal}>{match.calories} kcal</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Macro breakdown */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>MACRO BREAKDOWN</Text>
          <View style={styles.macroCard}>
            <MacroRow label="CALORIES" value={Math.round(selectedFood.calories * mult)} unit=" kcal" color={Colors.primary} />
            <MacroRow label="PROTEIN" value={Math.round(selectedFood.protein * mult)} unit="g" color={Colors.macroProtein} />
            <MacroRow label="CARBS" value={Math.round(selectedFood.carbs * mult)} unit="g" color={Colors.macroCarbs} />
            <MacroRow label="FAT" value={Math.round(selectedFood.fat * mult)} unit="g" color={Colors.macroFat} />
          </View>

          {/* Portion multiplier */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>PORTION MULTIPLIER</Text>
          <View style={styles.portionRow}>
            <TouchableOpacity
              style={styles.portionBtn}
              onPress={() => setMultiplier(String(Math.max(0.1, Math.round((mult - 0.25) * 100) / 100)))}
            >
              <Text style={styles.portionBtnText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.portionInput}
              value={multiplier}
              onChangeText={setMultiplier}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.portionBtn}
              onPress={() => setMultiplier(String(Math.round((mult + 0.25) * 100) / 100))}
            >
              <Text style={styles.portionBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.portionLabel}>× serving</Text>
          </View>

          {/* Retake */}
          <TouchableOpacity style={styles.retakeBtn} onPress={promptCapture} activeOpacity={0.75}>
            <Text style={styles.retakeBtnText}>RETAKE PHOTO</Text>
          </TouchableOpacity>

          {/* Log button */}
          <TouchableOpacity
            style={[styles.logBtn, logging && { opacity: 0.6 }]}
            onPress={handleLog}
            disabled={logging}
            activeOpacity={0.85}
          >
            {logging
              ? <ActivityIndicator color={Colors.accentInk} />
              : <Text style={styles.logBtnText}>ADD TO TODAY'S LOG</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  closeBtn: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 1.4 },
  proBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.xs,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  proBadgeText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accentInk, letterSpacing: 1.2 },

  // Capture
  captureContainer: { flex: 1, padding: Spacing.md, gap: Spacing.md },
  previewBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  previewImage: { flex: 1, width: '100%' },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  cameraIcon: { fontSize: 56 },
  captureHint: { fontFamily: Fonts.bodySemi, fontSize: 15, color: Colors.text },
  captureSubHint: {
    fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary,
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 18,
  },

  // Analyzing
  analyzingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: Spacing.md },
  thumbImage: { width: 160, height: 160, borderRadius: Radius.lg },
  analyzingTitle: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: -0.3 },
  analyzingSubtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },

  // Results
  resultsScroll: { padding: Spacing.md },
  resultThumb: { width: '100%', height: 180, borderRadius: Radius.md, marginBottom: Spacing.md },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginBottom: 8,
  },

  matchCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: 8,
  },
  matchCardSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(223,255,31,0.04)' },
  matchName: { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text, marginBottom: 2 },
  matchServing: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.5 },
  matchRight: { alignItems: 'flex-end', gap: 6 },
  matchCal: { fontFamily: Fonts.display, fontSize: 15, color: Colors.textSecondary },

  macroCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },

  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portionBtn: {
    width: 44, height: 44, backgroundColor: Colors.raised,
    borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  portionBtnText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text },
  portionInput: {
    width: 72, height: 44, backgroundColor: Colors.surface,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
    fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    textAlign: 'center',
  },
  portionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 },

  retakeBtn: {
    marginTop: Spacing.md, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
  },
  retakeBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 1 },

  logBtn: {
    marginTop: 10, backgroundColor: Colors.primary,
    borderRadius: Radius.sm, paddingVertical: 16, alignItems: 'center',
  },
  logBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 1 },

  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 1 },
});
