/**
 * CalibrationOverlay — the one-second body-profile capture, made visible.
 *
 * Before the first rep the engine measures the user's own limb proportions.
 * That measurement is what lets every later verdict be about THIS body rather
 * than a generic template, so it is staged as a deliberate moment: a single
 * thin instrument arc sweeping to 100, and one line telling the user the only
 * thing they have to do (hold still).
 *
 * The arc is the hero and the accent is spent on it alone — everything else is
 * dim stage chrome.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedRing } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { TOKENS } from '@/lib/theme';

export interface CalibrationOverlayProps {
  /** 0..1, from VisionFrameResult.calibrationProgress. */
  progress: number;
  visible: boolean;
  /** The active coach's accent, for the progress arc. */
  personaAccent?: string;
}

// The camera stage is a dark ground in BOTH schemes — light tokens are tuned
// against white and go muddy over video. Pin dark, like the rest of the stage.
const stage = TOKENS.dark;

const RING = 196;
const RING_STROKE = 5;

/**
 * Memoized. The parent mounts this unconditionally and hands it `visible`, so
 * without a gate its hooks would re-run on all ~30 of the parent's skeleton
 * interpolation renders per second — for the whole set, long after the
 * measurement it exists to show has finished. All three props are primitives.
 */
export const CalibrationOverlay = memo(function CalibrationOverlay({
  progress,
  visible,
  personaAccent,
}: CalibrationOverlayProps): React.JSX.Element | null {
  // Boundary: the engine streams this every frame, and a NaN would silently
  // render "NaN%" and freeze the arc.
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const done = pct >= 1;

  const reduced = useReducedMotion();
  const settle = useSharedValue(1);

  // A single one-shot beat when the measurement lands, so the moment visibly
  // FINISHES rather than trailing off. Never repeats, never runs while calibrating.
  useEffect(() => {
    if (!visible || !done || reduced) return;
    settle.value = withSequence(
      withTiming(1.045, { duration: 130 }),
      withTiming(1, { duration: 190 }),
    );
  }, [visible, done, reduced, settle]);

  // Reset so a second set re-plays the beat instead of mounting pre-settled.
  useEffect(() => {
    if (!visible) settle.value = 1;
  }, [visible, settle]);

  const settleStyle = useAnimatedStyle(() => ({ transform: [{ scale: settle.value }] }));

  if (!visible) return null;

  const accent = personaAccent ?? stage.crownAccent;

  return (
    <View
      style={styles.root}
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        done
          ? 'Calibrated. Body profile captured.'
          : `Calibrating, ${Math.round(pct * 100)} percent. Hold the start position.`
      }
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      <Animated.View style={settleStyle}>
        <AnimatedRing
          progress={pct}
          size={RING}
          stroke={RING_STROKE}
          color={accent}
          trackColor={stage.crownLine}
        >
          <Text style={[styles.value, done && { color: accent }]} allowFontScaling={false}>
            {Math.round(pct * 100)}
            <Text style={styles.valueUnit}>%</Text>
          </Text>
        </AnimatedRing>
      </Animated.View>

      <Text style={[styles.label, done && { color: accent }]}>
        {done ? 'Calibrated' : 'Calibrating'}
      </Text>
      <Text style={styles.hint}>
        {done
          ? 'Body profile captured — start your first rep.'
          : 'Hold the start position. Stay in frame.'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    // Depth is the scrim, not a card — the stage never shows a boxed panel.
    backgroundColor: stage.scrim,
  },
  value: {
    fontFamily: Fonts.displayBold,
    fontSize: 62,
    lineHeight: 66,
    letterSpacing: -2.5,
    color: stage.crownText,
    fontVariant: ['tabular-nums'],
  },
  valueUnit: {
    fontFamily: Fonts.displayBold,
    fontSize: 22,
    letterSpacing: -0.6,
    color: stage.crownTextDim,
  },
  label: {
    marginTop: 30,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: stage.crownTextDim,
  },
  hint: {
    marginTop: 11,
    maxWidth: 260,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: stage.crownTextDim,
  },
});
