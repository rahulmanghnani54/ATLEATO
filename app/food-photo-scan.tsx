/**
 * /food-photo-scan — AI-powered food macro estimator (PRO feature).
 *
 * Flow: camera/gallery → upload → loading → results → portion adjust → log
 *
 * Bold Canvas: the PHOTO is the hero, so this screen has no <Crown> — a dark
 * head runs straight into a full-bleed photo stage and every readout floats on
 * it. Overlays read the DARK token set in BOTH schemes: the light values are
 * tuned against white and go muddy over a photograph.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, StatusBar,
  Alert, Image, ScrollView, TextInput, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Camera as CameraIcon, Check, ChevronLeft, Minus, Plus, RotateCcw,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccess } from '@/lib/featureGates';
import { Fonts } from '@/constants/theme';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { BigStat, CanvasScreen, Hairline, ListRow, Section, StatRow } from '@/components/ui/canvas';
import { CountUp, PressableScale, Skeleton } from '@/components/ui/motion';

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

/** Confidence as tiny mono text, not a boxed chip — Bold Canvas has no outlines. */
function ConfidenceBadge({ value }: { value: number }) {
  const { tokens } = useTheme();
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? tokens.success : pct >= 45 ? tokens.warning : tokens.textSecondary;
  return <Text style={[helperStyles.confidence, { color }]}>{pct}% match</Text>;
}

/**
 * The hero numeral over the photo. CountUp only animates on a CHANGE, so a
 * value mounted at its final number would sit still; we render 0 for one frame
 * first — except under reduce-motion, where it mounts settled.
 */
function HeroCalories({ value, color }: { value: number; color: string }) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return (
    <CountUp
      value={settled ? value : 0}
      style={{
        fontFamily: Fonts.displayBold,
        fontVariant: ['tabular-nums'],
        fontSize: 64,
        lineHeight: 65,
        letterSpacing: -2.88,
        color,
      }}
    />
  );
}

const helperStyles = StyleSheet.create({
  confidence: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FoodPhotoScan() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const stageHeight = Math.round(screenHeight * 0.4);
  // The photo is a dark ground in both schemes — floating UI uses the dark set.
  const stage = TOKENS.dark;

  // Focus-scoped: the dark head runs under the status bar, but this screen stays
  // mounted under anything pushed on top of it, and an unconditional entry on
  // RN's StatusBar stack would leave that screen with white-on-white icons.
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

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

      // Hard 30s cap — without it, a stalled edge function (cold start, slow AI
      // inference, network drop) leaves the screen stuck on "analyzing" forever.
      const { data, error } = (await Promise.race([
        supabase.functions.invoke('analyze-food-photo', { body: { image_base64: base64 } }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Analysis timed out — try again with a clearer, closer photo.')), 30000),
        ),
      ])) as { data: any; error: any };

      if (error) throw error;

      const result = data as { matches: FoodMatch[] };

      // An EMPTY array is a correct answer, not a failure: the scanner looked
      // and there was no food in frame. Reporting that as 'Analysis failed'
      // sends the user off to retake a photo that was fine.
      if (!result?.matches?.length) {
        Alert.alert(
          'No food found',
          'That photo does not seem to contain food. Try again with the meal filling more of the frame.',
          [{ text: 'OK', onPress: () => setStep('capture') }],
        );
        return;
      }

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

  const gramsProtein = selectedFood ? Math.round(selectedFood.protein * mult) : 0;
  const gramsCarbs = selectedFood ? Math.round(selectedFood.carbs * mult) : 0;
  const gramsFat = selectedFood ? Math.round(selectedFood.fat * mult) : 0;
  const gramsTotal = gramsProtein + gramsCarbs + gramsFat;

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <CanvasScreen scroll={false} tabBar={false} style={styles.root}>
      {/* No <Crown> here, but the same status-bar contract: the dark head runs
          under the bar and the shell's dark-content icons would vanish on it. */}
      {screenFocused ? <StatusBar barStyle="light-content" /> : null}

      {/* Dark head — reads as one surface with the photo stage below it. */}
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.headBtn}
        >
          <ChevronLeft size={20} color={stage.crownText} />
        </PressableScale>
        <Text style={styles.headEyebrow} numberOfLines={1}>AI food scanner</Text>
        <View style={styles.proPill}>
          <Text style={styles.proPillText}>Pro</Text>
        </View>
      </View>

      {/* ── CAPTURE step ─────────────────────────────────────────── */}
      {step === 'capture' && (
        <>
          <View style={styles.stageFill}>
            {imageUri ? (
              <>
                <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  pointerEvents="none"
                  colors={['transparent', stage.scrim]}
                  style={styles.scrimBottom}
                />
                <View style={styles.stageCopy}>
                  <Text style={styles.stageEyebrow}>Last photo</Text>
                  <Text style={styles.stageHero}>Try{'\n'}again.</Text>
                  <Text style={styles.stageDim}>
                    Works best for whole plates, single items, or packaged food
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.stageCopy}>
                <Text style={styles.stageEyebrow}>No photo yet</Text>
                <Text style={styles.stageHero}>Snap{'\n'}your plate.</Text>
                <Text style={styles.stageDim}>
                  Works best for whole plates, single items, or packaged food
                </Text>
              </View>
            )}
          </View>

          {/* The single emerald moment on the light body. */}
          <View style={styles.foot}>
            <PressableScale
              style={styles.ctaPrimary}
              onPress={promptCapture}
              haptic="heavy"
              accessibilityRole="button"
              accessibilityLabel="Scan food photo"
            >
              <CameraIcon size={15} color={tokens.accentInk} />
              <Text style={styles.ctaPrimaryText}>Tap to scan food</Text>
            </PressableScale>
          </View>
        </>
      )}

      {/* ── ANALYZING step ────────────────────────────────────────── */}
      {step === 'analyzing' && (
        <>
          <View style={[styles.stage, { height: stageHeight }]}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', stage.scrim]}
              style={styles.scrimBottom}
            />
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: stage.crownAccent }]} />
              <Text style={styles.statusText}>Analysing</Text>
            </View>
            <View style={styles.stageCopy}>
              <Text style={styles.stageHero}>Reading{'\n'}the plate.</Text>
              <Text style={styles.stageDim}>Estimating macros from your food photo…</Text>
            </View>
          </View>

          {/* Shaped like the results that are coming — not a bare spinner. */}
          <ScrollView
            style={styles.panel}
            contentContainerStyle={styles.panelContent}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          >
            <Section label="AI detected" style={styles.sectionFirst}>
              {[0, 1, 2].map((i) => (
                <View key={i}>
                  <View style={styles.skelRow}>
                    <View style={styles.skelRowText}>
                      <Skeleton width={i === 0 ? '64%' : '46%'} height={15} radius={7} />
                      <Skeleton width="32%" height={9} radius={4} />
                    </View>
                    <Skeleton width={56} height={15} radius={7} />
                  </View>
                  {i < 2 ? <Hairline /> : null}
                </View>
              ))}
            </Section>

            <Section label="Macro breakdown">
              <View style={styles.skelStats}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.skelStatCell}>
                    <Skeleton width="74%" height={30} radius={8} />
                    <Skeleton width="54%" height={8} radius={4} />
                  </View>
                ))}
              </View>
              <Skeleton height={8} radius={4} style={styles.skelBar} />
            </Section>
          </ScrollView>
        </>
      )}

      {/* ── RESULTS step ──────────────────────────────────────────── */}
      {step === 'results' && selectedFood && (
        <>
          {/* The hero: the adjusted calorie count, straight onto the photo. */}
          <View style={[styles.stage, { height: stageHeight }]}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', stage.scrim]}
              style={styles.scrimBottom}
            />
            <View style={styles.stageCopy}>
              <Text style={styles.stageEyebrow} numberOfLines={1}>
                {selectedFood.serving_size}
              </Text>
              <Text style={styles.stageName} numberOfLines={2}>
                {selectedFood.food_name}
              </Text>
              <View style={styles.heroRow}>
                <HeroCalories
                  value={Math.round(selectedFood.calories * mult)}
                  color={stage.crownText}
                />
                <Text style={styles.heroUnit}>kcal</Text>
              </View>
              <Text style={styles.heroLabel}>Estimated · {mult}× serving</Text>
            </View>
          </View>

          <ScrollView
            style={styles.panel}
            contentContainerStyle={styles.panelContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Match selector */}
            <Section label="AI detected" style={styles.sectionFirst}>
              {matches.map((match, idx) => (
                <ListRow
                  key={idx}
                  title={match.food_name}
                  subtitle={match.serving_size}
                  onPress={() => setSelectedIndex(idx)}
                  last={idx === matches.length - 1}
                  style={idx === selectedIndex ? styles.matchSelected : undefined}
                  right={
                    <View style={styles.matchRight}>
                      <View style={styles.matchCalRow}>
                        {idx === selectedIndex ? (
                          <Check size={13} color={tokens.accentText} strokeWidth={3} />
                        ) : null}
                        <Text
                          style={[
                            styles.matchCal,
                            idx === selectedIndex && { color: tokens.accentText },
                          ]}
                        >
                          {match.calories} kcal
                        </Text>
                      </View>
                      <ConfidenceBadge value={match.confidence} />
                    </View>
                  }
                />
              ))}
            </Section>

            {/* Macro breakdown */}
            <Section label="Macro breakdown">
              <StatRow>
                <BigStat value={gramsProtein} unit="g" label="Protein" />
                <BigStat value={gramsCarbs} unit="g" label="Carbs" />
                <BigStat value={gramsFat} unit="g" label="Fat" />
              </StatRow>
              {gramsTotal > 0 ? (
                <View style={styles.macroBar}>
                  <View style={{ flex: gramsProtein, backgroundColor: tokens.macroProtein }} />
                  <View style={{ flex: gramsCarbs, backgroundColor: tokens.macroCarbs }} />
                  <View style={{ flex: gramsFat, backgroundColor: tokens.macroFat }} />
                </View>
              ) : null}
            </Section>

            {/* Portion multiplier */}
            <Section label="Portion multiplier">
              <View style={styles.portionRow}>
                <PressableScale
                  style={styles.portionBtn}
                  onPress={() => setMultiplier(String(Math.max(0.1, Math.round((mult - 0.25) * 100) / 100)))}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel="Decrease portion"
                >
                  <Minus size={18} color={tokens.text} strokeWidth={2.6} />
                </PressableScale>
                <TextInput
                  style={styles.portionInput}
                  value={multiplier}
                  onChangeText={setMultiplier}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  selectionColor={tokens.accent}
                  accessibilityLabel="Portion multiplier"
                />
                <PressableScale
                  style={styles.portionBtn}
                  onPress={() => setMultiplier(String(Math.round((mult + 0.25) * 100) / 100))}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel="Increase portion"
                >
                  <Plus size={18} color={tokens.text} strokeWidth={2.6} />
                </PressableScale>
                <Text style={styles.portionLabel} numberOfLines={1}>× serving</Text>
              </View>
            </Section>

            {/* Log button — the one emerald fill on the light body. */}
            <PressableScale
              style={[styles.ctaPrimary, styles.ctaLog, logging && { opacity: 0.6 }]}
              onPress={handleLog}
              disabled={logging}
              haptic="heavy"
              accessibilityRole="button"
              accessibilityLabel="Add to today's log"
            >
              {logging
                ? <ActivityIndicator color={tokens.accentInk} />
                : (
                  <>
                    <Check size={15} color={tokens.accentInk} strokeWidth={3} />
                    <Text style={styles.ctaPrimaryText}>Add to today&apos;s log</Text>
                  </>
                )
              }
            </PressableScale>

            {/* Retake */}
            <PressableScale
              style={styles.ctaGhost}
              onPress={promptCapture}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Retake photo"
            >
              <RotateCcw size={14} color={tokens.text} />
              <Text style={styles.ctaGhostText}>Retake photo</Text>
            </PressableScale>
          </ScrollView>
        </>
      )}
    </CanvasScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function makeStyles(t: SemanticTokens) {
  const stage = TOKENS.dark;

  return StyleSheet.create({
    root: { flex: 1 },

    // ── Dark head, continuous with the photo stage ───────────────────────────
    head: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingBottom: 14, backgroundColor: t.crown,
    },
    headBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: stage.crownLine,
    },
    headEyebrow: {
      flex: 1, textAlign: 'center',
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.9,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },
    proPill: {
      borderWidth: 1, borderColor: stage.crownLine, borderRadius: 999,
      paddingHorizontal: 11, paddingVertical: 6,
    },
    proPillText: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownText,
    },

    // ── Photo stage — the hero; every readout floats, none is boxed ──────────
    stage: { width: '100%', overflow: 'hidden', backgroundColor: t.crown, justifyContent: 'flex-end' },
    stageFill: { flex: 1, overflow: 'hidden', backgroundColor: t.crown, justifyContent: 'flex-end' },
    scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },

    stageCopy: { paddingHorizontal: 22, paddingBottom: 24 },
    stageEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.7,
      textTransform: 'uppercase', color: stage.crownTextDim, marginBottom: 12,
    },
    stageHero: {
      fontFamily: Fonts.displayBold, fontSize: 38, lineHeight: 41,
      letterSpacing: -1.71, color: stage.crownText,
    },
    stageName: {
      fontFamily: Fonts.displayBold, fontSize: 22, lineHeight: 26,
      letterSpacing: -0.9, color: stage.crownText,
    },
    stageDim: {
      fontFamily: Fonts.body, fontSize: 13, lineHeight: 19,
      color: stage.crownTextDim, marginTop: 10, maxWidth: 300,
    },

    statusPill: {
      position: 'absolute', top: 14, left: 14,
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
      backgroundColor: stage.overlay,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: {
      fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownText,
    },

    // The dramatic pairing: a 64px numeral straight onto an 8px mono label.
    heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 12 },
    heroUnit: {
      fontFamily: Fonts.bodySemi, fontSize: 13, color: stage.crownTextDim, paddingBottom: 10,
    },
    heroLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownTextDim, marginTop: 4,
    },

    // ── Light body ───────────────────────────────────────────────────────────
    panel: { flex: 1, backgroundColor: t.bg },
    panelContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
    sectionFirst: { marginTop: 22 },

    foot: { backgroundColor: t.bg, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },

    // ── Match rows ───────────────────────────────────────────────────────────
    // Selection is a soft wash plus a check glyph — never an outline, and never
    // colour alone.
    matchSelected: {
      backgroundColor: t.surfaceAlt, borderRadius: 22,
      paddingHorizontal: 14, marginHorizontal: -14,
    },
    matchRight: { alignItems: 'flex-end', gap: 5 },
    matchCalRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    matchCal: {
      fontFamily: Fonts.displayMedium, fontSize: 15, letterSpacing: -0.2,
      fontVariant: ['tabular-nums'], color: t.textSecondary,
    },

    // ── Macros ───────────────────────────────────────────────────────────────
    macroBar: {
      flexDirection: 'row', height: 8, borderRadius: 4,
      overflow: 'hidden', marginTop: 22,
    },

    // ── Portion stepper ──────────────────────────────────────────────────────
    portionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    portionBtn: {
      width: 52, height: 52, borderRadius: 26,
      alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt,
    },
    portionInput: {
      width: 96, height: 52, borderRadius: 26, backgroundColor: t.surfaceAlt,
      fontFamily: Fonts.displayBold, fontSize: 27, letterSpacing: -1.2,
      fontVariant: ['tabular-nums'], color: t.text, textAlign: 'center',
      paddingVertical: 0,
    },
    portionLabel: {
      flex: 1,
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.6,
      textTransform: 'uppercase', color: t.textTertiary,
    },

    // ── CTAs ─────────────────────────────────────────────────────────────────
    ctaPrimary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      paddingVertical: 17, borderRadius: 26,
      // Brand emerald is 2.54:1 on white — the deep hairline is what gives the
      // control a legible edge on a light page.
      backgroundColor: t.accent, borderWidth: 1, borderColor: t.accentLine,
    },
    ctaPrimaryText: {
      fontFamily: Fonts.legacyMono, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: t.accentInk,
    },
    ctaLog: { marginTop: 38 },
    ctaGhost: {
      marginTop: 10,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      paddingVertical: 16, borderRadius: 26, backgroundColor: t.surfaceAlt,
    },
    ctaGhostText: {
      fontFamily: Fonts.legacyMono, fontSize: 10, letterSpacing: 1.8,
      textTransform: 'uppercase', color: t.text,
    },

    // ── Analysing skeletons — shaped like the results below ──────────────────
    skelRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15,
    },
    skelRowText: { flex: 1, gap: 8 },
    skelStats: { flexDirection: 'row', gap: 14 },
    skelStatCell: { flex: 1, gap: 9 },
    skelBar: { marginTop: 22 },
  });
}
