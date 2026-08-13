/**
 * Recovery check-in — Bold Canvas.
 *
 * The crown asks the question and carries the live recovery score as the hero
 * numeral; the light body below holds the five inputs as borderless steppers on
 * surfaceAlt. The scoring maths, the volume-modifier output and the save
 * mutation are untouched — this file changed shape, not behaviour.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSubmitRecovery, useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { calculateRecovery } from '@/lib/recoveryEngine';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { CountUp, PressableScale, Skeleton } from '@/components/ui/motion';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { useAuthStore } from '@/stores/authStore';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

/**
 * Score tone. The legacy palette aliased `good` to `success` and `warn` to
 * `warning`, so the five bands have always painted three colours — that is
 * preserved exactly. These sit on the crown, which is near-black in BOTH
 * schemes, so they resolve against the dark tokens rather than the active ones.
 */
function scoreColor(score: number) {
  const t = TOKENS.dark;
  if (score >= 70) return t.success;
  if (score >= 35) return t.warning;
  return t.danger;
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
}

/**
 * The borderless replacement for the old bordered slider card. Index maths is
 * unchanged: integer steps rounded to the step's precision, so 0.5h increments
 * never accumulate float error.
 */
function Stepper({ label, value, min, max, step = 1, onChange, lowLabel, highLabel }: StepperProps) {
  const styles = useThemedStyles(makeStyles);
  const steps = Math.round((max - min) / step) + 1;
  const precision = step < 1 ? 1 : 0;
  const roundTo = (n: number) => Math.round(n * 10 ** precision) / 10 ** precision;
  const values = Array.from({ length: steps }, (_, i) => roundTo(min + i * step));
  const roundedValue = roundTo(value);

  return (
    <View style={styles.control}>
      <View style={styles.controlHead}>
        <Text style={styles.controlLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.controlValue} numberOfLines={1}>
          {roundedValue % 1 === 0 ? roundedValue : roundedValue.toFixed(1)}
        </Text>
      </View>

      <View style={styles.track}>
        {values.map((v) => {
          const active = v === roundedValue;
          // Everything up to the marker reads as "filled" so the row behaves
          // like a gauge rather than a lone highlighted pip.
          const filled = v < roundedValue;
          return (
            <View key={v} style={styles.dotCell}>
              <PressableScale
                onPress={() => onChange(v)}
                haptic="light"
                scaleTo={0.88}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityLabel={String(v)}
                accessibilityRole="button"
                style={styles.dotHit}
              >
                <View style={[styles.dot, filled && styles.dotFilled, active && styles.dotActive]} />
              </PressableScale>
            </View>
          );
        })}
      </View>

      {(lowLabel || highLabel) && (
        <View style={styles.hints}>
          {lowLabel ? <Text style={styles.hint}>{lowLabel}</Text> : <View />}
          {highLabel ? <Text style={styles.hint}>{highLabel}</Text> : <View />}
        </View>
      )}
    </View>
  );
}

export default function RecoveryCheckin() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { mutateAsync, isPending } = useSubmitRecovery();
  const { data: existingCheckin, isLoading: loadingToday } = useTodayRecovery();
  const profile = useAuthStore((s) => s.profile);
  const { scheme } = useTheme();
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is dark in both schemes, so its tint always comes from the dark triplet.
  const crownTint = personaAccent(persona, 'dark').accent;
  const styles = useThemedStyles(makeStyles);

  const [sleepHours, setSleepHours] = useState(7.5);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);

  const preview = calculateRecovery({ sleepHours, sleepQuality, soreness, energy, stress });
  const color = scoreColor(preview.recoveryScore);

  const pct = (() => {
    const p = Math.round((preview.volumeModifier - 1) * 100);
    return p > 0 ? `+${p}%` : p < 0 ? `${p}%` : 'NORMAL';
  })();

  const handleSubmit = async () => {
    try {
      await mutateAsync({ sleepHours, sleepQuality, soreness, energy, stress });
      if (returnTo) {
        router.replace(returnTo as any);
      } else {
        router.back();
      }
    } catch {
      Alert.alert('Error', 'Could not save your check-in. Please try again.');
    }
  };

  return (
    <CanvasScreen tabBar={false} bottomSpace={36}>
      <Crown
        eyebrow="Morning check-in"
        title="HOW DID"
        accentLine="YOU SLEEP?"
        accent={crownTint}
        onBack={() => router.back()}
      >
        {/* The hero: the score reacts to every tap below it. */}
        <View style={styles.hero}>
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>Recovery score</Text>
            <CountUp
              value={preview.recoveryScore}
              duration={320}
              style={[styles.heroNum, { color }]}
              accessibilityLabel={`Recovery score ${preview.recoveryScore}, ${preview.label}`}
            />
            <Text style={[styles.heroBadge, { color }]} numberOfLines={1}>
              {preview.label.toUpperCase()}
            </Text>
          </View>
          <View style={styles.heroSide}>
            <Text style={styles.heroLabel}>Vol mod</Text>
            <Text style={[styles.heroMod, { color }]} numberOfLines={1}>{pct}</Text>
          </View>
        </View>

        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { width: `${preview.recoveryScore}%` as any, backgroundColor: color }]}
          />
        </View>

        <Text style={styles.recommendation}>{preview.recommendation}</Text>
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {loadingToday ? (
          <Skeleton height={64} radius={22} style={styles.bannerSkeleton} />
        ) : existingCheckin ? (
          <View style={styles.banner}>
            <Text style={styles.bannerLabel}>Already logged</Text>
            <Text style={styles.bannerText}>
              Already checked in today (score: {(existingCheckin as any).recovery_score}). Saving will update your entry.
            </Text>
          </View>
        ) : null}

        <Section label="Sleep" contentStyle={styles.stack}>
          <Stepper
            label="Hours slept"
            value={sleepHours}
            min={3}
            max={12}
            step={0.5}
            onChange={setSleepHours}
            lowLabel="3h"
            highLabel="12h"
          />
          <Stepper
            label="Sleep quality"
            value={sleepQuality}
            min={1}
            max={5}
            onChange={setSleepQuality}
            lowLabel="Poor"
            highLabel="Excellent"
          />
        </Section>

        <Section label="Physical state" contentStyle={styles.stack}>
          <Stepper
            label="Muscle soreness"
            value={soreness}
            min={1}
            max={5}
            onChange={setSoreness}
            lowLabel="None"
            highLabel="Very sore"
          />
          <Stepper
            label="Energy level"
            value={energy}
            min={1}
            max={5}
            onChange={setEnergy}
            lowLabel="Exhausted"
            highLabel="Energised"
          />
        </Section>

        <Section label="Mental state" contentStyle={styles.stack}>
          <Stepper
            label="Stress level"
            value={stress}
            min={1}
            max={5}
            onChange={setStress}
            lowLabel="Relaxed"
            highLabel="Very stressed"
          />
        </Section>

        {/* The single accent spend on the light body. */}
        <PressableScale
          onPress={handleSubmit}
          disabled={isPending}
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel="Save check-in"
          accessibilityState={{ disabled: isPending }}
          style={[
            styles.submit,
            { backgroundColor: pa.accent, borderColor: pa.accentText },
            isPending && styles.submitBusy,
          ]}
        >
          <Text style={[styles.submitText, { color: pa.ink }]}>
            {isPending ? 'SAVING…' : 'SAVE CHECK-IN'}
          </Text>
        </PressableScale>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown hero ─────────────────────────────────────────────────────────────
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 26,
  },
  heroMain: { flexShrink: 1 },
  heroSide: { alignItems: 'flex-end' },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginBottom: 8,
  },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 72,
    lineHeight: 73,
    // -0.045em at 72px.
    letterSpacing: -3.24,
    fontVariant: ['tabular-nums'],
  },
  heroBadge: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  heroMod: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 29,
    letterSpacing: -1.22,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: t.crownLine,
    overflow: 'hidden',
    marginTop: 22,
  },
  barFill: { height: '100%', borderRadius: 2 },
  recommendation: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.crownTextDim,
    marginTop: 14,
  },

  // ── Already-checked-in notice ──────────────────────────────────────────────
  bannerSkeleton: { marginTop: 24 },
  banner: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 24,
    gap: 7,
  },
  bannerLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.warning,
  },
  bannerText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.textSecondary,
  },

  // ── Steppers ───────────────────────────────────────────────────────────────
  stack: { gap: 10 },
  control: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  controlHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  controlLabel: {
    flexShrink: 1,
    fontFamily: Fonts.bodySemi,
    fontSize: 14,
    letterSpacing: -0.2,
    color: t.textSecondary,
    paddingBottom: 4,
  },
  controlValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    letterSpacing: -1.22,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  track: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dotCell: { flex: 1 },
  dotHit: { paddingVertical: 8, justifyContent: 'center' },
  dot: {
    height: 7,
    borderRadius: 4,
    backgroundColor: t.border,
  },
  dotFilled: { backgroundColor: t.borderStrong },
  dotActive: {
    height: 20,
    backgroundColor: t.text,
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  hint: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  // ── Save ───────────────────────────────────────────────────────────────────
  submit: {
    borderRadius: 26,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 34,
  },
  submitBusy: { opacity: 0.6 },
  submitText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
  },
});
