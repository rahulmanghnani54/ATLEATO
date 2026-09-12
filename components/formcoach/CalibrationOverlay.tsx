/**
 * CalibrationOverlay — the one-second body-profile capture, made visible.
 *
 * Before the first rep the engine measures the user's own limb proportions.
 * That measurement is what lets every later verdict be about THIS body rather
 * than a generic template, so it is shown — but only just: a mono label, a
 * 3px progress bar and one line telling the user the only thing they have to
 * do (hold still).
 *
 * It used to be a 196px ring gauge with a 62px percentage in the middle. That
 * made a one-second housekeeping step look like the main event, and its big
 * numeral competed with the score the lifter is actually here for. The
 * checklist before it and the readout after it are the hero moments; this is
 * the beat between them, and it is sized like one.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Fonts } from '@/constants/theme';
import { TOKENS } from '@/lib/theme';

export interface CalibrationOverlayProps {
  /** 0..1, from VisionFrameResult.calibrationProgress. */
  progress: number;
  visible: boolean;
  /** The active coach's accent, for the progress bar fill. */
  personaAccent?: string;
}

// The camera stage is a dark ground in BOTH schemes — light tokens are tuned
// against white and go muddy over video. Pin dark, like the rest of the stage.
const stage = TOKENS.dark;

const BAR_W = 168;
const BAR_H = 3;

/**
 * Progress arrives at analysis rate (~8Hz), so a raw width would step in
 * ~12% jumps across the second. Long enough to bridge two ticks, short enough
 * that the bar never lags a finished measurement.
 */
const BAR_MS = 180;

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
  // freeze the bar mid-way.
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const done = pct >= 1;

  const reduced = useReducedMotion();
  const fill = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      // Reset so a second set's bar grows from empty instead of mounting full.
      fill.value = 0;
      return;
    }
    fill.value = reduced ? pct : withTiming(pct, { duration: BAR_MS });
  }, [visible, pct, reduced, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * BAR_W }));

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
          : `Calibrating, ${Math.round(pct * 100)} percent. Hold still for a moment.`
      }
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      <Text style={[styles.label, done && { color: accent }]} allowFontScaling={false}>
        {done ? 'Calibrated' : 'Calibrating'}
      </Text>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
      </View>

      <Text style={styles.hint}>
        {done ? 'Body profile captured — start your first rep.' : 'Hold still for a moment'}
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
  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: stage.crownTextDim,
  },
  // Hairline-thin on purpose: the bar reports, it does not perform.
  track: {
    marginTop: 14,
    width: BAR_W,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: stage.crownLine,
    overflow: 'hidden',
  },
  fill: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
  },
  hint: {
    marginTop: 14,
    maxWidth: 260,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: stage.crownTextDim,
  },
});
