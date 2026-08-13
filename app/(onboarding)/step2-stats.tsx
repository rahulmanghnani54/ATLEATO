/**
 * Onboarding Step 2 — the numbers. Bold Canvas.
 *
 * Height, weight and age are the screen's type: an oversized numeral over a
 * tiny mono unit, scrubbed on a full-bleed ruler instead of poked into a small
 * bordered field. The ruler's own bounds ARE the old picker's option lists, so
 * the validation below can only ever pass — it is kept verbatim anyway because
 * it is the contract the next steps rely on.
 *
 * Every bound, the DOB min/max, the metric↔imperial conversions and the push
 * into step 3 are carried over unchanged.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

type Gender = 'male' | 'female';
type Unit = 'metric' | 'imperial';

function range(from: number, to: number, step = 1): number[] {
  const arr: number[] = [];
  for (let v = from; v <= to; v += step) arr.push(parseFloat(v.toFixed(1)));
  return arr;
}

// Same option sets the wheel pickers offered, as scrub tracks. Module-level so
// their identity is stable — the ruler is memoised on it.
const METRIC_HEIGHTS = range(100, 250);          // cm
const METRIC_WEIGHTS = range(30, 300, 0.5);      // kg
const IMPERIAL_HEIGHTS = range(4 * 12, 7 * 12 + 11); // total inches: 4'0" – 7'11"
const IMPERIAL_WEIGHTS = range(66, 660);         // lbs

const MIN_AGE = 13;
const MAX_AGE = 100;
const maxDob = new Date();
maxDob.setFullYear(maxDob.getFullYear() - MIN_AGE);
const minDob = new Date();
minDob.setFullYear(minDob.getFullYear() - MAX_AGE);
const defaultDob = new Date(maxDob);
defaultDob.setFullYear(defaultDob.getFullYear() - 7); // default ~20 years old

const DEFAULT_HEIGHT_CM = 170;
const DEFAULT_HEIGHT_IN = 5 * 12 + 9; // 5'9"
const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_WEIGHT_LB = 154;

const idxOf = (values: number[], v: number) => {
  const i = values.indexOf(v);
  return i < 0 ? 0 : i;
};

// The ruler is re-keyed (and therefore remounted) on a unit switch, and a unit
// switch also resets both measures to their defaults — so its starting tick is
// always the default one. Keeping it a CONSTANT is what lets the memo hold
// while the numeral above it re-renders on every tick of the scrub.
const START_HEIGHT: Record<Unit, number> = {
  metric: idxOf(METRIC_HEIGHTS, DEFAULT_HEIGHT_CM),
  imperial: idxOf(IMPERIAL_HEIGHTS, DEFAULT_HEIGHT_IN),
};
const START_WEIGHT: Record<Unit, number> = {
  metric: idxOf(METRIC_WEIGHTS, DEFAULT_WEIGHT_KG),
  imperial: idxOf(IMPERIAL_WEIGHTS, DEFAULT_WEIGHT_LB),
};

const fmtCm = (v: number) => String(v);
const fmtFtIn = (v: number) => `${Math.floor(v / 12)}'${v % 12}`;
const fmtKg = (v: number) => (v % 1 ? v.toFixed(1) : String(v));
const fmtLb = (v: number) => String(v);

function ageFromDate(d: Date): number {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared spine. Duplicated verbatim across the five step files: the kit has
// no onboarding primitive and the steps are the only owners of this flow.
// ─────────────────────────────────────────────────────────────────────────────

const STEP_TOTAL = 5;

function StepRail({ step }: { step: number }) {
  const { tokens } = useTheme();
  return (
    <View
      style={railStyles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${STEP_TOTAL}`}
    >
      {Array.from({ length: STEP_TOTAL }, (_, i) => {
        const n = i + 1;
        const now = n === step;
        return (
          <View
            key={n}
            style={[
              railStyles.seg,
              now && railStyles.segNow,
              {
                backgroundColor: now
                  ? tokens.crownAccent
                  : n < step
                    ? tokens.crownText
                    : tokens.crownLine,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const railStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seg: { width: 12, height: 3, borderRadius: 999 },
  segNow: { width: 24 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Scrub ruler
// ─────────────────────────────────────────────────────────────────────────────

const TICK = 14;

interface RulerProps {
  values: number[];
  initialIndex: number;
  onIndex: (i: number) => void;
  /** Every Nth tick gets a full-height stroke and a label. */
  majorEvery: number;
  format: (v: number) => string;
  label: string;
}

/**
 * Memoised on purpose: the numeral above re-renders on every tick crossing, and
 * without this the whole virtualised track would reconcile with it mid-gesture.
 * `onIndex` must therefore stay referentially stable in the parent.
 */
const Ruler = memo(function Ruler({
  values,
  initialIndex,
  onIndex,
  majorEvery,
  format,
  label,
}: RulerProps) {
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const pad = Math.max(0, (width - TICK) / 2);
  // A ref, not state: the track must not re-render as it is dragged — only the
  // numeral above it does.
  const last = useRef(initialIndex);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(e.nativeEvent.contentOffset.x / TICK);
      const i = Math.max(0, Math.min(values.length - 1, raw));
      if (i === last.current) return;
      last.current = i;
      onIndex(i);
    },
    [values.length, onIndex],
  );

  return (
    <View style={styles.ruler} accessibilityLabel={label}>
      <FlatList
        data={values}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(v) => String(v)}
        getItemLayout={(_, i) => ({ length: TICK, offset: TICK * i, index: i })}
        initialScrollIndex={initialIndex}
        snapToInterval={TICK}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{ paddingHorizontal: pad }}
        renderItem={({ item, index }) => {
          const major = index % majorEvery === 0;
          return (
            <View style={styles.tickCell}>
              <View style={[styles.tick, major && styles.tickMajor]} />
              {major ? <Text style={styles.tickLabel}>{format(item)}</Text> : null}
            </View>
          );
        }}
      />
      <View pointerEvents="none" style={styles.needle} />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function Step2Stats() {
  const router = useRouter();
  const { goal } = useLocalSearchParams<{ goal: string }>();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [gender, setGender] = useState<Gender>('male');
  const [dob, setDob] = useState<Date>(defaultDob);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [unit, setUnit] = useState<Unit>('metric');
  const [heightCmVal, setHeightCmVal] = useState(DEFAULT_HEIGHT_CM);
  const [heightInVal, setHeightInVal] = useState(DEFAULT_HEIGHT_IN);
  const [weightKgVal, setWeightKgVal] = useState(DEFAULT_WEIGHT_KG);
  const [weightLbVal, setWeightLbVal] = useState(DEFAULT_WEIGHT_LB);

  const [error, setError] = useState('');

  const dobLabel = useMemo(() => {
    return dob.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [dob]);
  const age = useMemo(() => ageFromDate(dob), [dob]);

  const metric = unit === 'metric';
  const heightValues = metric ? METRIC_HEIGHTS : IMPERIAL_HEIGHTS;
  const weightValues = metric ? METRIC_WEIGHTS : IMPERIAL_WEIGHTS;

  // Stable per unit — the ruler is memoised on these, and it remounts on a unit
  // switch anyway (keyed), so a new identity here costs nothing.
  const onHeightIndex = useCallback(
    (i: number) => {
      if (metric) setHeightCmVal(METRIC_HEIGHTS[i]);
      else setHeightInVal(IMPERIAL_HEIGHTS[i]);
    },
    [metric],
  );
  const onWeightIndex = useCallback(
    (i: number) => {
      if (metric) setWeightKgVal(METRIC_WEIGHTS[i]);
      else setWeightLbVal(IMPERIAL_WEIGHTS[i]);
    },
    [metric],
  );

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setDob(date);
  };

  const switchUnit = (u: Unit) => {
    setUnit(u);
    // Same reset the old unit toggle performed — both systems return to their
    // defaults rather than converting, so the ruler never lands off-tick.
    setWeightKgVal(DEFAULT_WEIGHT_KG);
    setWeightLbVal(DEFAULT_WEIGHT_LB);
    setHeightCmVal(DEFAULT_HEIGHT_CM);
    setHeightInVal(DEFAULT_HEIGHT_IN);
  };

  const handleContinue = () => {
    const heightCm = unit === 'metric'
      ? heightCmVal
      : heightInVal * 2.54;
    const weightKg = unit === 'metric'
      ? weightKgVal
      : weightLbVal * 0.453592;

    if (heightCm < 100 || heightCm > 250 || weightKg < 30 || weightKg > 300) {
      setError('Please enter realistic height and weight values.');
      return;
    }

    setError('');
    const dobStr = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
    router.push({
      pathname: '/(onboarding)/step3-activity',
      params: { goal, gender, dob: dobStr, heightCm: heightCm.toFixed(1), weightKg: weightKg.toFixed(2) },
    });
  };

  return (
    <View style={styles.root}>
      <Crown
        eyebrow={`Step 2 of ${STEP_TOTAL}`}
        title="Tell us your"
        accentLine="numbers."
        meta="Calorie targets, training load and recovery are all calibrated from these."
        right={<StepRail step={2} />}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <CanvasScreen tabBar={false} contentStyle={styles.body}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Section label="Sex" style={styles.firstSection}>
          <View style={styles.pillRow}>
            {(['male', 'female'] as Gender[]).map((g) => {
              const active = gender === g;
              return (
                <PressableScale
                  key={g}
                  onPress={() => setGender(g)}
                  haptic="light"
                  scaleTo={0.97}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={g === 'male' ? 'Male' : 'Female'}
                  style={[styles.pill, active && styles.pillOn]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextOn]}>
                    {g === 'male' ? 'Male' : 'Female'}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Section>

        <Section label="Date of birth">
          <PressableScale
            onPress={() => setShowDatePicker(true)}
            haptic="light"
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`Date of birth ${dobLabel}, age ${age}`}
            style={styles.dobBlock}
          >
            <View style={styles.numeralRow}>
              <Text style={styles.numeral}>{age}</Text>
              <Text style={styles.numeralUnit}>YRS</Text>
            </View>
            <Text style={styles.dobLine}>{dobLabel}  ·  TAP TO CHANGE</Text>
          </PressableScale>
        </Section>

        <Section
          label="Height"
          right={
            <View style={styles.unitRow}>
              {(['metric', 'imperial'] as Unit[]).map((u) => {
                const active = unit === u;
                return (
                  <PressableScale
                    key={u}
                    onPress={() => switchUnit(u)}
                    haptic="light"
                    scaleTo={0.94}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={u === 'metric' ? 'Metric units' : 'Imperial units'}
                    style={styles.unitBtn}
                  >
                    <Text style={[styles.unitText, active && styles.unitTextOn]}>
                      {u === 'metric' ? 'CM / KG' : 'FT / LB'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          }
        >
          <View style={styles.numeralRow}>
            <Text style={styles.numeral}>
              {metric ? fmtCm(heightCmVal) : fmtFtIn(heightInVal)}
            </Text>
            <Text style={styles.numeralUnit}>{metric ? 'CM' : 'FT · IN'}</Text>
          </View>
          <Ruler
            key={`h-${unit}`}
            values={heightValues}
            initialIndex={START_HEIGHT[unit]}
            onIndex={onHeightIndex}
            majorEvery={metric ? 10 : 12}
            format={metric ? fmtCm : fmtFtIn}
            label="Height"
          />
        </Section>

        <Section label="Weight">
          <View style={styles.numeralRow}>
            <Text style={styles.numeral}>
              {metric ? fmtKg(weightKgVal) : fmtLb(weightLbVal)}
            </Text>
            <Text style={styles.numeralUnit}>{metric ? 'KG' : 'LBS'}</Text>
          </View>
          <Ruler
            key={`w-${unit}`}
            values={weightValues}
            initialIndex={START_WEIGHT[unit]}
            onIndex={onWeightIndex}
            majorEvery={metric ? 20 : 10}
            format={metric ? fmtKg : fmtLb}
            label="Weight"
          />
        </Section>
      </CanvasScreen>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleContinue}
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </PressableScale>
      </View>

      {/* iOS inline calendar */}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <Pressable
            onPress={() => setShowDatePicker(false)}
            accessibilityRole="button"
            accessibilityLabel="Close date picker"
            style={styles.dateBackdrop}
          />
          <View style={styles.dateSheet}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateTitle}>DATE OF BIRTH</Text>
              <PressableScale
                haptic="light"
                scaleTo={0.94}
                onPress={() => setShowDatePicker(false)}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.dateDone}>Done</Text>
              </PressableScale>
            </View>
            <DateTimePicker
              value={dob}
              mode="date"
              display="spinner"
              maximumDate={maxDob}
              minimumDate={minDob}
              onChange={handleDateChange}
              textColor={tokens.text}
            />
          </View>
        </Modal>
      )}

      {/* Android date picker (shows native dialog) */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dob}
          mode="date"
          display="calendar"
          maximumDate={maxDob}
          minimumDate={minDob}
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    body: { paddingHorizontal: 22, paddingBottom: 12 },
    // Section's own 34px top margin is right between blocks, too much directly
    // under the crown.
    firstSection: { marginTop: 24 },

    errorBox: {
      marginTop: 20,
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 18,
      backgroundColor: t.surfaceAlt,
    },
    errorText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: t.danger },

    // ── Sex ──
    pillRow: { flexDirection: 'row', gap: 10 },
    pill: {
      flex: 1,
      minHeight: 54,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surfaceAlt,
      paddingHorizontal: 18,
    },
    pillOn: { backgroundColor: t.accentSoft },
    pillText: { fontFamily: Fonts.displayMedium, fontSize: 15, color: t.textSecondary },
    pillTextOn: { fontFamily: Fonts.displayBold, color: t.accentText },

    // ── Oversized numerals ──
    numeralRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    numeral: {
      fontFamily: Fonts.displayBold,
      fontSize: 56,
      lineHeight: 58,
      // -0.045em at 56px.
      letterSpacing: -2.52,
      color: t.text,
      fontVariant: ['tabular-nums'],
    },
    numeralUnit: {
      fontFamily: Fonts.legacyMono,
      fontSize: 10,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: t.textTertiary,
      paddingBottom: 12,
    },

    dobBlock: { gap: 6 },
    dobLine: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.textTertiary,
    },

    // ── Unit toggle ──
    unitRow: { flexDirection: 'row', gap: 14 },
    unitBtn: { paddingVertical: 2 },
    unitText: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      color: t.textTertiary,
    },
    unitTextOn: { color: t.accentText },

    // ── Ruler ──
    ruler: {
      height: 62,
      marginTop: 14,
      // Full-bleed past the body's 22px gutter — the track should run off both
      // edges so it reads as a dial, not a slider in a box.
      marginHorizontal: -22,
      justifyContent: 'flex-start',
    },
    tickCell: { width: TICK, alignItems: 'center' },
    tick: { width: 1.5, height: 16, borderRadius: 999, backgroundColor: t.border },
    tickMajor: { height: 28, backgroundColor: t.borderStrong },
    tickLabel: {
      marginTop: 6,
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 0.4,
      color: t.textTertiary,
    },
    needle: {
      position: 'absolute',
      left: '50%',
      marginLeft: -1,
      top: 0,
      width: 2,
      height: 34,
      borderRadius: 999,
      backgroundColor: t.accentText,
    },

    // ── Date sheet ──
    dateBackdrop: { flex: 1, backgroundColor: t.overlay },
    dateSheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    dateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingVertical: 18,
    },
    dateTitle: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.7,
      color: t.textTertiary,
    },
    dateDone: { fontFamily: Fonts.displayBold, fontSize: 15, color: t.accentText },

    // ── Footer ──
    footer: { paddingHorizontal: 22, paddingTop: 10 },
    cta: {
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: t.text,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    ctaText: { fontFamily: Fonts.displayBold, fontSize: 16, letterSpacing: -0.3, color: t.bg },
  });
