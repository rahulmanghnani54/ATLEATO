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
 * Two variants of the same facts:
 *  - `compact` — the original chip row plus framing, sized for a glance.
 *  - `checklist` — "SETTING UP" tick rows, one per required group plus a
 *    PERSON row, for the camera-setup moment where the user is actively
 *    arranging the phone and wants to watch each group turn green. Tiers come
 *    from `joints` when the caller supplies them (the screen computes a
 *    per-PAIR tier — both shoulders, both wrists — which is what "can the
 *    engine measure this group" actually means), else from `quality.groups`.
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
import { Check as CheckIcon } from 'lucide-react-native';
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

/** The engine's confidence vocabulary (`jointConfidenceTier`), unchanged. */
export type ConfidenceTier = 'high' | 'medium' | 'low';

/** The engine's paired groups — everything the gate can require. `head` never is. */
type PairedGroup = Exclude<JointGroup, 'head'>;

/** Rows the checklist can show: the body as a whole, then the six paired groups. */
export type ChecklistJoint = 'person' | PairedGroup;

/** Per-group tiers supplied by the screen. Missing keys fall back to `quality.groups`. */
export type JointTiers = Partial<Record<ChecklistJoint, ConfidenceTier>>;

const CHECKLIST_JOINTS: readonly ChecklistJoint[] = [
  'person',
  'shoulders',
  'elbows',
  'wrists',
  'hips',
  'knees',
  'ankles',
];

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
const REQUIRED_UPPER: readonly PairedGroup[] = ['shoulders', 'elbows', 'wrists'];
const REQUIRED_LOWER: readonly PairedGroup[] = ['hips', 'knees', 'ankles'];
const REQUIRED_UNKNOWN: readonly PairedGroup[] = ['shoulders', 'hips'];

function requiredGroups(category: string | undefined): readonly PairedGroup[] {
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
  return tierState(jointConfidenceTier(Number.isFinite(score) ? score / 100 : 0));
}

function tierState(tier: ConfidenceTier): CheckState {
  return tier === 'high' ? 'ok' : tier === 'medium' ? 'weak' : 'missing';
}

const TIER_RANK: Record<ConfidenceTier, number> = { low: 0, medium: 1, high: 2 };

/**
 * PERSON when the caller did not compute it: the best of shoulders and hips
 * from the engine's group scores. Either one confidently in view is enough
 * evidence that the camera is pointed at a body — the per-group rows then
 * say which parts of it are still missing.
 */
function personTier(groups: PoseQuality['groups'] | undefined): ConfidenceTier {
  const s = jointConfidenceTier((groups?.shoulders?.score ?? 0) / 100);
  const h = jointConfidenceTier((groups?.hips?.score ?? 0) / 100);
  return TIER_RANK[s] >= TIER_RANK[h] ? s : h;
}

export interface CameraCoachProps {
  quality: PoseQuality;
  category?: string;
  /** Fired once, the first time the checks pass. Never re-fires on later frames. */
  onReady?: () => void;
  /**
   * Per-group tiers computed by the screen (~8Hz, from the analysed pose, not
   * the interpolated one). Only read by the `checklist` variant; any group it
   * omits falls back to `quality.groups`.
   */
  joints?: JointTiers;
  /** `compact` (default) is the chip row; `checklist` is the SETTING UP tick list. */
  variant?: 'checklist' | 'compact';
}

/**
 * Memo comparator. `quality` is one frozen result object replaced only when a
 * detection is analysed (~8Hz), so identity is exact for it. `joints` is an
 * object the screen may well rebuild on any of its ~30 interpolation renders
 * per second, and an identity compare would let that alone re-render this
 * panel on every one of them — so it is compared by its seven tier values,
 * which only move when a detection is analysed.
 */
function areEqual(prev: CameraCoachProps, next: CameraCoachProps): boolean {
  if (prev.quality !== next.quality) return false;
  if (prev.category !== next.category) return false;
  if (prev.onReady !== next.onReady) return false;
  if ((prev.variant ?? 'compact') !== (next.variant ?? 'compact')) return false;
  const a = prev.joints;
  const b = next.joints;
  if (a === b) return true;
  if (!a || !b) return false;
  for (let i = 0; i < CHECKLIST_JOINTS.length; i++) {
    const k = CHECKLIST_JOINTS[i];
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Memoized: the parent re-renders ~30x/sec to interpolate the skeleton, but
 * `quality` is only replaced when a detection is analysed (~8Hz). Skipping
 * the re-render keeps a Reanimated style off the render path three ticks in
 * four. See `areEqual` for why the compare is custom.
 */
export const CameraCoach = memo(function CameraCoach({
  quality,
  category,
  onReady,
  joints,
  variant = 'compact',
}: CameraCoachProps): JSX.Element {
  const locked = quality?.canJudge === true;
  const framing = quality?.framing ?? 'out_of_frame';
  const advice = quality?.advice ?? null;
  const checklist = variant === 'checklist';

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
    const required = requiredGroups(category);
    if (checklist) {
      // PERSON first: "is there a body at all" is the question every other
      // row presupposes, so it reads as the head of the list, not a peer.
      const rows: Check[] = [
        { key: 'person', label: 'Person', state: tierState(joints?.person ?? personTier(groups)) },
      ];
      for (const g of required) {
        const tier = joints?.[g];
        rows.push({
          key: g,
          label: g.charAt(0).toUpperCase() + g.slice(1),
          state: tier ? tierState(tier) : groupState(groups?.[g]?.score ?? 0),
        });
      }
      return rows;
    }
    const rows: Check[] = required.map((g) => ({
      key: g,
      label: g,
      state: groupState(groups?.[g]?.score ?? 0),
    }));
    // Framing rides in the same list because it is the same kind of fact — a
    // thing about the CAMERA the user can fix by moving, not a thing about them.
    rows.push({ key: 'framing', label: FRAMING_LABEL[framing], state: FRAMING_STATE[framing] });
    return rows;
    // `joints` may be a fresh object on every render `areEqual` lets through;
    // rebuilding seven rows is cheaper than a deeper dependency here.
  }, [quality?.groups, category, framing, checklist, joints]);

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
              <Text style={styles.eyebrow}>{checklist ? 'Setting up' : 'Pre-flight check'}</Text>
              <Text style={styles.count}>
                {passed}/{checks.length}
              </Text>
            </View>

            {checklist ? (
              <View style={styles.rows}>
                {checks.map((c) => (
                  <View
                    key={c.key}
                    style={styles.row}
                    accessible
                    accessibilityLabel={`${c.label}: ${STATE_WORD[c.state]}`}
                  >
                    <Tick state={c.state} />
                    <Text style={styles.rowText}>{c.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              /* flexWrap, never a horizontal ScrollView: chip labels have been
                 dropped entirely by release builds inside scrolling rows. */
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
            )}

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
}, areEqual);

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

/**
 * Checklist counterpart of `Mark`: a tick, a `!`, or a `×`. Same rule — the
 * glyph carries the state on its own, the colour only makes it faster. All
 * three sit in one fixed-width cell so the labels stay on a single column.
 */
function Tick({ state }: { state: CheckState }): JSX.Element {
  const color = STATE_COLOR[state];
  return (
    <View style={styles.tickCell}>
      {state === 'ok' ? (
        <CheckIcon size={13} color={color} strokeWidth={3} />
      ) : (
        <Text style={[styles.tickGlyph, { color }]} allowFontScaling={false}>
          {state === 'weak' ? '!' : '×'}
        </Text>
      )}
    </View>
  );
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

  // Tick rows: one per line, tall enough to be scanned while the user is
  // three metres from the phone adjusting its angle.
  rows: { marginTop: 8, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 22 },
  rowText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: stage.crownText,
  },
  tickCell: { width: 16, alignItems: 'center', justifyContent: 'center' },
  tickGlyph: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },

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
