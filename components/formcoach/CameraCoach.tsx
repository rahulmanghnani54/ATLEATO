/**
 * CameraCoach — the pre-flight vision check.
 *
 * Shown BEFORE a set, so the camera has to prove it can see the joints this
 * exercise depends on. Every downstream number the engine produces is only as
 * honest as this moment: a set filmed from a bad angle cannot be rescued by a
 * better verdict afterwards, it can only be apologised for. So the checklist
 * states plainly which required groups are readable and which are not, and the
 * only thing it ever asks the user to do is the ONE fix that would unblock the
 * weakest one.
 *
 * Reads `quality` and renders it. It never judges form, never scores, and
 * never invents a threshold: group state comes from the engine's own
 * `jointConfidenceTier`, so this panel and the gate agree by construction
 * rather than by two sets of numbers kept in sync by hand.
 *
 * Layout: the panel sizes to its content and does NOT position itself — the
 * parent drops it into the stage overlay (e.g. form-coach's `stageBottom`),
 * which is what keeps it from becoming a full-screen takeover.
 */

import { memo, useEffect, useMemo, useRef, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Fonts } from '@/constants/theme';
import { TOKENS } from '@/lib/theme';
import { jointConfidenceTier, type JointGroup, type PoseQuality } from '@/lib/vision';

// The camera stage is deliberately dark in BOTH colour schemes, so this chrome
// pins the dark token set rather than following the active scheme. Light tokens
// over a live video feed are unreadable, and this panel only ever renders there.
const stage = TOKENS.dark;

/** How long the settled/checking cross-fade runs when motion is not reduced. */
const FADE_MS = 220;

type CheckState = 'ok' | 'weak' | 'missing';

const STATE_COLOR: Record<CheckState, string> = {
  ok: stage.success,
  weak: stage.warning,
  missing: stage.danger,
};

/**
 * Mirrors `requiredGroups` in lib/vision/poseQuality.ts, which is internal to
 * that module. Kept identical on purpose: listing a group the gate does not
 * require would tell a seated presser to show his ankles, and omitting one it
 * does require would let him think he was ready when the gate disagreed.
 */
const REQUIRED_UPPER: readonly JointGroup[] = ['shoulders', 'elbows', 'wrists'];
const REQUIRED_LOWER: readonly JointGroup[] = ['hips', 'knees', 'ankles'];
const REQUIRED_UNKNOWN: readonly JointGroup[] = ['shoulders', 'hips'];

function requiredGroups(category: string | undefined): readonly JointGroup[] {
  switch ((category ?? '').trim().toLowerCase()) {
    case 'press':
    case 'pull':
    case 'curl':
      return REQUIRED_UPPER;
    case 'squat':
    case 'deadlift':
    case 'lunge':
      return REQUIRED_LOWER;
    default:
      return REQUIRED_UNKNOWN;
  }
}

const FRAMING_LABEL: Record<PoseQuality['framing'], string> = {
  ok: 'framing',
  partial: 'partial',
  too_close: 'too close',
  too_far: 'too far',
  out_of_frame: 'no body',
};

const FRAMING_STATE: Record<PoseQuality['framing'], CheckState> = {
  ok: 'ok',
  partial: 'weak',
  too_close: 'weak',
  too_far: 'weak',
  // Nothing to reposition — the camera is not pointed at a person at all.
  out_of_frame: 'missing',
};

const STATE_WORD: Record<CheckState, string> = {
  ok: 'visible',
  weak: 'weak',
  missing: 'not visible',
};

interface Check {
  key: string;
  label: string;
  state: CheckState;
}

/**
 * The engine's three-tier confidence vocabulary, unchanged.
 *
 * 'medium' is a joint the gate will accept but that is one step of the lifter
 * away from dropping out mid-set — worth flagging as weak rather than green,
 * because the fix (light, angle, a half step back) is the same either way and
 * it is far cheaper to make now than after eight reps have gone unscored.
 */
function groupState(score: number): CheckState {
  const tier = jointConfidenceTier(Number.isFinite(score) ? score / 100 : 0);
  return tier === 'high' ? 'ok' : tier === 'medium' ? 'weak' : 'missing';
}

export interface CameraCoachProps {
  quality: PoseQuality;
  category?: string;
  /** Fired once, the first time the checks pass. Never re-fires on later frames. */
  onReady?: () => void;
}

/**
 * Memoized: the parent re-renders ~30x/sec to interpolate the skeleton, but
 * `quality` is one frozen result object that is only replaced when a detection
 * is analysed (~8Hz). Identity comparison is therefore exact, and skipping the
 * re-render keeps a Reanimated style off the render path three ticks in four.
 */
export const CameraCoach = memo(function CameraCoach({
  quality,
  category,
  onReady,
}: CameraCoachProps): JSX.Element {
  const locked = quality?.canJudge === true;
  const framing = quality?.framing ?? 'out_of_frame';
  const advice = quality?.advice ?? null;

  // Fire-and-forget: the callback is a one-shot handoff ("the set may begin"),
  // so a joint flickering out later must not re-arm it and start a second set.
  const readyFired = useRef(false);
  // Held in a ref so an inline arrow prop cannot re-run the effect and fire twice.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!locked || readyFired.current) return;
    readyFired.current = true;
    onReadyRef.current?.();
  }, [locked]);

  const checks = useMemo<Check[]>(() => {
    const groups = quality?.groups;
    const rows: Check[] = requiredGroups(category).map((g) => ({
      key: g,
      label: g,
      state: groupState(groups?.[g]?.score ?? 0),
    }));
    // Framing rides in the same list because it is the same kind of fact — a
    // thing about the CAMERA the user can fix by moving, not a thing about them.
    rows.push({ key: 'framing', label: FRAMING_LABEL[framing], state: FRAMING_STATE[framing] });
    return rows;
  }, [quality?.groups, category, framing]);

  const passed = checks.reduce((n, c) => (c.state === 'ok' ? n + 1 : n), 0);

  const reduceMotion = useReducedMotion();
  const fade = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = withTiming(1, { duration: FADE_MS });
  }, [locked, reduceMotion, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const barColor = locked
    ? stage.success
    : checks.some((c) => c.state === 'missing')
      ? stage.danger
      : stage.warning;

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <Animated.View style={fadeStyle}>
        {locked ? (
          <View accessible accessibilityLabel="Camera locked. All required joints are in view.">
            <View style={styles.lockRow}>
              <Mark state="ok" />
              <Text style={styles.lockTitle}>Camera locked</Text>
            </View>
            <Text style={styles.lockSub}>
              {checks
                .filter((c) => c.key !== 'framing')
                .map((c) => c.label)
                .join(' · ')}
              {' in view'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <Text style={styles.eyebrow}>Pre-flight check</Text>
              <Text style={styles.count}>
                {passed}/{checks.length}
              </Text>
            </View>

            {/* flexWrap, never a horizontal ScrollView: chip labels have been
                dropped entirely by release builds inside scrolling rows. */}
            <View style={styles.chips}>
              {checks.map((c) => (
                <View
                  key={c.key}
                  style={styles.chip}
                  accessible
                  accessibilityLabel={`${c.label}: ${STATE_WORD[c.state]}`}
                >
                  <Mark state={c.state} />
                  <Text style={[styles.chipText, { color: STATE_COLOR[c.state] }]}>{c.label}</Text>
                </View>
              ))}
            </View>

            {/* Exactly one instruction. The engine already picked the fix that
                unblocks the weakest group; printing the rest would bury it. */}
            <Text style={styles.advice} numberOfLines={2}>
              {advice ?? 'Hold still while the camera finds you.'}
            </Text>
          </>
        )}
      </Animated.View>
    </View>
  );
});

/**
 * State indicator. Colour carries the meaning fastest, but SHAPE carries it at
 * all — colour alone is invisible to a red/green-blind lifter, and this panel
 * is the one gate standing between him and a set of unscored reps.
 */
function Mark({ state }: { state: CheckState }): JSX.Element {
  const color = STATE_COLOR[state];
  if (state === 'ok') return <View style={[styles.markSolid, { backgroundColor: color }]} />;
  if (state === 'weak') return <View style={[styles.markRing, { borderColor: color }]} />;
  return <View style={[styles.markBar, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  // Same borderless floating plate as the stage's other overlays: a soft dark
  // fill and a 3px state bar, no outline anywhere.
  panel: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 13,
    borderRadius: 22,
    backgroundColor: stage.overlay,
    overflow: 'hidden',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: stage.crownTextDim,
  },
  count: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    fontVariant: ['tabular-nums'],
    color: stage.crownTextDim,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  markSolid: { width: 8, height: 8, borderRadius: 2 },
  markRing: { width: 9, height: 9, borderRadius: 999, borderWidth: 1.5 },
  markBar: { width: 9, height: 2.5, borderRadius: 1 },

  advice: {
    marginTop: 10,
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: stage.crownText,
  },

  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lockTitle: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: stage.crownText,
  },
  lockSub: {
    marginTop: 5,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: stage.crownTextDim,
  },
});
