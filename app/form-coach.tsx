/**
 * Live Form Coach (V3 — MLKit Pose · real-time frame processor)
 *
 * Detection: Google MLKit Pose Detection runs as a native Vision Camera FRAME
 *   PROCESSOR (on the worklet/JSI thread, every frame at ~20-30fps). MLKit has
 *   a built-in person DETECTOR stage, so it only returns landmarks when a real
 *   body is in frame — no hallucinated poses, no shouting at an empty room.
 *   It returns the same 33 landmarks as BlazePose (same indices), so the
 *   skeleton, analysis and gating below are unchanged from the snapshot version.
 * Rendering: A ~60fps loop interpolates the on-screen skeleton toward the latest
 *   MLKit result, so it glides smoothly even between detections.
 *
 * Pipeline:
 *   Camera frame → useFrameProcessor (worklet) → detectPose(frame) [MLKit native]
 *     → useRunOnJS → handlePose() maps MLKit image-pixel coords to screen coords
 *     (cover-fit + front-camera mirror) → One-Euro smoothing → VisionEngine
 *     → targetKpts + SVG draw.
 *
 * MLKit returns positions in the UPRIGHT image pixel space; we pass frame
 * width/height from the worklet and cover-fit them onto the camera view.
 *
 * THIS SCREEN OWNS: the camera, the frame processor, the coordinate transform,
 * the One-Euro smoother and the render loop. It owns NO analysis. Pose quality,
 * body calibration, the rep state machine, biomechanics and the decision of
 * what (if anything) to say all live in lib/vision, where they are replayable
 * against recorded landmark data instead of 26-minute device builds. The rule
 * the engine exists to enforce — verdict.score is NULL whenever the pose cannot
 * be judged, and the UI renders that as "—", never as a number — is why the
 * inline analysis stack that used to live here is gone.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StatusBar, View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy, runAtTargetFps } from 'react-native-vision-camera';
import Svg, { Circle, Line } from 'react-native-svg';
import { useRunOnJS } from 'react-native-worklets-core';
import { Fonts } from '@/constants/theme';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { BigStat, CanvasScreen, Hairline, Section, StatRow } from '@/components/ui/canvas';
import { CountUp, PressableScale, Skeleton } from '@/components/ui/motion';
import {
  getExerciseForm, getExerciseFormKey, getCoachCue, tipsForExercise, visionCategoryFor,
  type VisionCategory,
} from '@/constants/exerciseFormLibrary';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { canAccess } from '@/lib/featureGates';
import {
  VisionEngine, anatomyPlausible, jointConfidenceTier,
  type FormVerdict, type RepPhase, type VisionFrameResult,
} from '@/lib/vision';
import { toRepData, buildReport, type SetReport } from '@/lib/vision/repScore';
import { getEntry, loadTutorialMemory, recordRetrigger, shouldRetrigger } from '@/lib/tutorialMemory';
import { CameraCoach, type JointTiers } from '@/components/formcoach/CameraCoach';
import { CalibrationOverlay } from '@/components/formcoach/CalibrationOverlay';
import { FormReadout, type FormReadoutState } from '@/components/formcoach/FormReadout';
import {
  X as XIcon, RefreshCw, AlertTriangle, Check, Pause, Video, Sparkles,
  Camera as CameraIcon,
} from 'lucide-react-native';
import { track } from '@/lib/analytics';

// The MLKit plugin registers a native frame processor named "detectPose", but
// its JS entry only exports <Camera> (not the worklet). So we initialize the
// native plugin ourselves — the standard Vision Camera v4 pattern — and call it
// from the frame-processor worklet below.
const posePlugin = VisionCameraProxy.initFrameProcessorPlugin('detectPose', {});
function detectPose(frame: any, options: Record<string, string>): any {
  'worklet';
  if (posePlugin == null) throw new Error('detectPose plugin not linked');
  return posePlugin.call(frame, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DETECT_FPS            = 15;    // MLKit inference target (enforced via runAtTargetFps in the worklet)
const RENDER_INTERVAL_MS    = 33;    // ~30 fps render/interpolation (60 was a render storm that delayed pose callbacks)
const RENDER_TAU_MS         = 60;    // time-constant for dt-scaled catch-up: alpha = 1 - exp(-dt/tau)
const REJECT_STREAK_TO_BLANK = 4;    // hysteresis: consecutive rejected detections before we blank the skeleton
// Detections stop ARRIVING for this long → tracking is lost. Rejection hysteresis
// only covers frames MLKit answered; nothing covered the frame processor going
// quiet (camera released on background, plugin death, another screen pushed on
// top), and with nothing to expire the last result the stage kept a frozen
// skeleton and a live FORM number over a camera that was seeing nothing.
// ~15 missed detections at DETECT_FPS.
const STALE_DETECTION_MS    = 1_000;
const NUM_LANDMARKS         = 33;    // BlazePose body landmarks
const CUE_COOLDOWN_MS       = 5_000;

// Persona display names come from lib/personaTheme.ts — see claudePersonaLabel
// below. This file used to carry its own table, and it had drifted: it called
// arnold "THE GOVERNOR" and nippard "THE SCIENTIST" while Home and every other
// screen said "THE MONUMENT" and "THE ANALYST". A user saw two names for one
// coach depending on which screen they were on.

// The BlazePose landmark NAME→index map lives in MLKIT_TO_INDEX below, and the
// analysis layer keeps its own copy in lib/vision. What this file needs from
// the layout is only what it draws: the bone list and the joint list.

// Full BlazePose skeleton (body + limbs + hands + feet). Face is drawn as
// points only (no lines) to stay readable.
const SKELETON: [number, number][] = [
  // torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // arms (to wrists — finger sub-points dropped to avoid the wrist blob)
  [11, 13], [13, 15], [12, 14], [14, 16],
  // legs (to ankles) + toe direction (heels dropped to avoid the foot knot)
  [23, 25], [25, 27], [27, 31],
  [24, 26], [26, 28], [28, 32],
];

// Landmarks we render as joints. We drop the redundant inner/outer eye points
// and keep a clean ~27-point body skeleton (the user asked for "25-30 joints").
const DRAW_POINTS: number[] = [
  0, 7, 8,                  // nose, ears
  11, 12, 13, 14, 15, 16,   // shoulders, elbows, wrists
  23, 24, 25, 26, 27, 28,   // hips, knees, ankles
  31, 32,                   // toes (foot direction)
];
// Face points (rendered smaller).
const FACE_POINTS = new Set<number>([0, 7, 8]);

// MLKit returns named landmark positions; map each to its BlazePose index so the
// rest of the file (KP map, SKELETON, analysis) works unchanged. MLKit pose IS
// BlazePose, so the 33 indices line up exactly.
const MLKIT_TO_INDEX: Record<string, number> = {
  nosePosition: 0,
  leftEyeInnerPosition: 1, leftEyePosition: 2, leftEyeOuterPosition: 3,
  rightEyeInnerPosition: 4, rightEyePosition: 5, rightEyeOuterPosition: 6,
  leftEarPosition: 7, rightEarPosition: 8,
  leftMouthPosition: 9, rightMouthPosition: 10,
  leftShoulderPosition: 11, rightShoulderPosition: 12,
  leftElbowPosition: 13, rightElbowPosition: 14,
  leftWristPosition: 15, rightWristPosition: 16,
  leftPinkyPosition: 17, rightPinkyPosition: 18,
  leftIndexPosition: 19, rightIndexPosition: 20,
  leftThumbPosition: 21, rightThumbPosition: 22,
  leftHipPosition: 23, rightHipPosition: 24,
  leftKneePosition: 25, rightKneePosition: 26,
  leftAnklePosition: 27, rightAnklePosition: 28,
  leftHeelPosition: 29, rightHeelPosition: 30,
  leftFootIndexPosition: 31, rightFootIndexPosition: 32,
};

type Kpt = [number, number, number]; // [x_px, y_px, confidence]
// The decision layer's finding (what the verdict carries), not the biomechanics
// layer's: lib/vision re-exports the latter under the same name.
type Finding = FormVerdict['findings'][number];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Persona normalisation and the tips fallback both come from the shared
// libraries (personaFromProgramId, tipsForExercise): this file used to carry
// its own copies, which matched fewer spellings than the technique screen's
// and could show a different fallback for the same exercise name.

/** Engine categories judged from the waist up — the camera needs less body. */
function isUpperBody(category: VisionCategory | string | undefined): boolean {
  return category === 'press' || category === 'curl' || category === 'pull';
}

/**
 * One-Euro low-pass filter — adaptive cutoff.
 * Low cutoff at rest (kills jitter on a still body), high cutoff during fast motion.
 * https://gery.casiez.net/1euro/
 */
class OneEuro {
  private prevValue: number | null = null;
  private prevDeriv: number | null = null;
  private prevTime: number | null = null;
  // Lower minCutoff → stronger smoothing at rest (kills "jittery skeleton when still")
  // Higher beta     → faster response to real motion (so smoothing isn't laggy)
  constructor(private minCutoff = 0.25, private beta = 0.012, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
  filter(value: number, time: number): number {
    if (this.prevValue == null || this.prevTime == null) {
      this.prevValue = value; this.prevTime = time; this.prevDeriv = 0;
      return value;
    }
    // Clamp dt to [1/60, 0.5]s: floor stops burst-delivered samples (dt≈1ms)
    // from collapsing alpha→0 (frozen filter); ceiling makes re-acquisition
    // after a gap snap instead of blending from a stale position.
    const dt = Math.min(0.5, Math.max(1 / 60, (time - this.prevTime) / 1000));
    const deriv = (value - this.prevValue) / dt;
    const dA = this.alpha(this.dCutoff, dt);
    const sDeriv = dA * deriv + (1 - dA) * (this.prevDeriv ?? 0);
    const cutoff = this.minCutoff + this.beta * Math.abs(sDeriv);
    const a = this.alpha(cutoff, dt);
    const smoothed = a * value + (1 - a) * this.prevValue;
    this.prevValue = smoothed; this.prevDeriv = sDeriv; this.prevTime = time;
    return smoothed;
  }
}

/** Per-axis filter for each of the 33 BlazePose landmarks. */
class KeypointSmoother {
  // minCutoff 1.0 (canonical One-Euro default): the old 0.25 gave tau=0.64s —
  // 200-450ms of lag at every rep start/turnaround. beta 0.05 keeps the filter
  // opening further during fast motion. Clocked on the CAMERA FRAME timestamp,
  // not JS delivery time (bursty RunOnJS delivery collapsed dt and froze it).
  private filters: OneEuro[][] = Array.from({ length: NUM_LANDMARKS }, () => [
    new OneEuro(1.0, 0.05),  // x
    new OneEuro(1.0, 0.05),  // y
  ]);
  smooth(kpts: Kpt[], tMs: number): Kpt[] {
    return kpts.map(([x, y, c], i) => [
      this.filters[i][0].filter(x, tMs),
      this.filters[i][1].filter(y, tMs),
      c,
    ]);
  }
}

/** Linearly interpolate one keypoint set toward another by factor t (0..1). */
function lerpKpts(current: Kpt[], target: Kpt[], t: number): Kpt[] {
  if (current.length !== target.length) return target;
  const out: Kpt[] = [];
  for (let i = 0; i < target.length; i++) {
    const [cx, cy, cc] = current[i];
    const [tx, ty, tc] = target[i];
    out.push([
      cx + (tx - cx) * t,
      cy + (ty - cy) * t,
      // Confidence: snap to target (don't fade in/out unnaturally)
      tc,
    ]);
  }
  return out;
}

// The set report's grading curve (scoreRep / toRepData / buildReport) lives in
// lib/vision/repScore.ts, where it is unit-tested. This screen owns NO
// analysis: it banks what the engine reports and renders what the curve says.

// How long the pill says POSITION GOOD once calibration completes before it
// settles to READY. Long enough to be read as an answer to "am I set up?",
// short enough that it is gone before the first rep.
const POSITION_GOOD_MS = 1_500;

// How long a line the engine ELECTED to speak stays the on-screen correction,
// even if a worse finding overtakes it in the ranked list. Matches the
// decider's own re-open window: the ear and the eye should tell one story.
const SPOKEN_HOLD_MS = 9_000;

// Re-trigger looks at this many most-recent completed reps (the rule itself
// lives in lib/tutorialMemory; this is the screen's buffer cap).
const RECENT_REPS_CAP = 4;

// Copy shown by the report card when Finish set is tapped with nothing banked.
// Category-aware for the same reason as the not-tracking sheet: a squat is
// counted from hips/knees/ankles, so telling a squatter to keep the "upper
// body" in frame is the wrong instruction, and a press cannot show a full body.
// Movement-neutral wording — a pull-up's rep is UP and back down.
function noRepsCopy(category: string | undefined): string {
  return isUpperBody(category)
    ? 'No complete reps were detected. A full rep is a complete lower-and-return with your head, torso and both arms in frame.'
    : 'No complete reps were detected. A full rep is a complete lower-and-return with your whole body in frame.';
}

// BlazePose landmark pairs behind each checklist row. The gate asks for one
// usable member per group; the CHECKLIST asks whether the PAIR is measurable,
// which is the stricter question a lifter setting up the phone wants answered.
const CHECKLIST_PAIRS: Record<Exclude<keyof JointTiers, 'person'>, [number, number]> = {
  shoulders: [11, 12],
  elbows:    [13, 14],
  wrists:    [15, 16],
  hips:      [23, 24],
  knees:     [25, 26],
  ankles:    [27, 28],
};
const TIER_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * Per-group confidence tiers for the SETTING UP checklist. Group tier = the
 * WEAKER of the pair (a shoulder seen on one side only cannot be measured as a
 * pair). PERSON = the better of shoulders and hips: either one confidently in
 * view is proof the camera is pointed at a body.
 *
 * Computed from the analysed pose (targetKpts) at ~8Hz, never from the
 * interpolated one, so CameraCoach's memo is not defeated by 30 renders/s.
 */
function computeJointTiers(kpts: Kpt[] | null): JointTiers | null {
  if (!kpts) return null;
  const tiers: JointTiers = {};
  for (const g of Object.keys(CHECKLIST_PAIRS) as Array<keyof typeof CHECKLIST_PAIRS>) {
    const [a, b] = CHECKLIST_PAIRS[g];
    const ta = jointConfidenceTier(kpts[a]?.[2] ?? 0);
    const tb = jointConfidenceTier(kpts[b]?.[2] ?? 0);
    tiers[g] = TIER_RANK[ta] <= TIER_RANK[tb] ? ta : tb;
  }
  const s = tiers.shoulders ?? 'low';
  const h = tiers.hips ?? 'low';
  tiers.person = TIER_RANK[s] >= TIER_RANK[h] ? s : h;
  return tiers;
}

/** True while a rep is in flight — the phases between leaving the top and returning to it. */
function phaseInRep(phase: RepPhase | undefined): boolean {
  return phase === 'eccentric' || phase === 'bottom' || phase === 'concentric';
}

// Throttled debug logger (visible via `adb logcat | grep pose`).
// Logs ~1 in 4 calls so it doesn't spam. Safe to leave — cheap, dev-only signal.
let _poseLogN = 0;
function poseLog(msg: string) {
  if (_poseLogN++ % 4 === 0) console.log('[pose]', msg);
}

/** Rep events are rare and diagnostic — never throttled. */
function repLog(msg: string) {
  console.log('[rep]', msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A hero numeral that actually ticks. CountUp only animates on a CHANGE, so a
 * value that mounts at its final number would sit still; we render 0 for one
 * frame first — except under reduce-motion, where it mounts settled.
 */
function HeroNumber({ value, color, size = 74 }: { value: number; color: string; size?: number }) {
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
        fontSize: size,
        lineHeight: size * 1.02,
        letterSpacing: size * -0.045,
        color,
      }}
    />
  );
}

export default function FormCoach() {
  // The phone sits propped up across the gym while the user lifts — nobody is
  // touching the screen, so Android's display timeout fired mid-set and killed
  // the camera. Released automatically when this screen unmounts.
  useKeepAwake();

  const router = useRouter();
  const { exerciseName, persona: personaParam } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
  }>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cameraHeight = Math.round(screenHeight * 0.62);

  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  // Focus-scoped so the light-content status bar this screen needs does not
  // follow the user onto a light screen pushed on top of it (see the <Crown>).
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );
  // The camera feed is a dark ground in BOTH schemes, so everything floating on
  // the stage reads the DARK token set — the light values are tuned against
  // white and go muddy over video.
  const stage = TOKENS.dark;
  const personaTheme = personaFromProgramId(personaParam ?? 'cbum_evolved');
  const stageAccent  = personaAccent(personaTheme, 'dark').accent;   // over video
  // Text on a persona-accent fill is the persona's OWN ink (as technique.tsx
  // does with pa.ink), not the emerald button ink, which only happens to work.
  const stageAccentInk = personaAccent(personaTheme, 'dark').ink;
  const pageAccent   = personaAccent(personaTheme, scheme);           // on the page
  // One source for the coach's name. shortName is the uppercase eyebrow form
  // ("THE SCULPTOR"), fullName the title-case sentence form ("The Sculptor").
  const claudePersonaLabel = `${personaTheme.shortName} SAYS`;
  const coachName          = personaTheme.fullName;

  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);
  // On-screen alignment diagnostic (screenshot-able) — lets us fix skeleton
  // misalignment without adb. Toggle with the ⚙ chip; off by default.
  const [showAlign, setShowAlign] = useState(false);
  const alignDebugRef = useRef<string>('…');
  // Read at detection rate, so the string is only BUILT when the panel that
  // reads it is open. handlePose cannot see the state directly — it is memoized
  // on the view box alone, and widening its deps would rebuild the RunOnJS
  // binding every time the diagnostic is toggled.
  const showAlignRef = useRef(false);
  useEffect(() => { showAlignRef.current = showAlign; }, [showAlign]);

  const categoryRef = useRef<string | undefined>(undefined);

  // ── THE ANALYSIS LAYER ────────────────────────────────────────────────────
  // One engine for the life of the screen. It is fed SMOOTHED, screen-space
  // landmarks and owns everything downstream of them: the skeleton lock, pose
  // quality, body calibration, the rep state machine, biomechanics and the
  // decision of what to say. Held in a ref so detection-rate work never adds
  // render pressure; the ~8Hz analysisTick is what publishes it to the UI.
  const engineRef = useRef<VisionEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new VisionEngine(undefined);
  const visionRef = useRef<VisionFrameResult | null>(null);

  // ── Per-rep score gate (screen-side) ──────────────────────────────────────
  // The engine's verdict.score is a per-FRAME judgement and null only when it
  // refused to judge. The readout shows a per-REP number instead: banked here
  // when a rep completes, dash until then. Refs because they are written from
  // the pose callback, which must not grow a dependency on state.
  const lastRepScoreRef = useRef<number | null>(null);
  const repIndexRef     = useRef(0);

  // ── Position-good window ──────────────────────────────────────────────────
  // When calibration last completed (0 = calibrating / never). The pill says
  // POSITION GOOD for POSITION_GOOD_MS after this, then READY.
  const calibratedAtRef = useRef(0);

  // ── On-screen correction latch ────────────────────────────────────────────
  // The line the engine ELECTED to speak, and when. verdict.speak is non-null
  // for a single frame; without this the sheet would show whatever ranks first
  // on the next frame while the coach's voice is still mid-sentence.
  const spokenRef = useRef<{ finding: Finding; atMs: number } | null>(null);

  // ── SETTING UP checklist tiers ────────────────────────────────────────────
  // Computed in tickAnalysis (~8Hz) from the analysed pose; published to the
  // UI by analysisTick like everything else the engine reports.
  const jointTiersRef = useRef<JointTiers | null>(null);

  // ── Smart re-trigger (the rule lives in lib/tutorialMemory) ───────────────
  // Check ids the engine confirmed during the rep in flight; the last few
  // completed reps' sets; and whether this set has already been interrupted.
  const curRepFindingsRef  = useRef<Set<string>>(new Set());
  const recentRepsRef      = useRef<string[][]>([]);
  const promptedThisSetRef = useRef(false);
  // Which check the prompt is about (null = no prompt). The label is looked up
  // at render time from the form's detectedFaults.
  const [retriggerCheckId, setRetriggerCheckId] = useState<string | null>(null);
  // Memory key for this exercise — form id when covered, else a name slug.
  // Read inside the rep callback, so it is bridged through a ref.
  const formKeyRef = useRef('');

  // Forget this set's re-trigger evidence. Shared by every place a set ends.
  const resetRetrigger = () => {
    curRepFindingsRef.current = new Set();
    recentRepsRef.current = [];
    promptedThisSetRef.current = false;
    setRetriggerCheckId(null);
  };

  // Forget the per-rep readout. Shared by every place a set ends.
  const resetRepReadout = () => {
    lastRepScoreRef.current = null;
    repIndexRef.current = 0;
    spokenRef.current = null;
  };

  // End-of-set report card (null = hidden). Captured when "Finish set" is tapped.
  const [setReport, setSetReport] = useState<SetReport | null>(null);
  // The coach's one-line verdict for that report — spoken AND rendered.
  const [setVerdict, setSetVerdict] = useState<string | null>(null);

  const finishSet = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const r = buildReport(engine.reps, categoryRef.current);
    if (r.reps < 1) {
      // Tapping Finish with nothing banked used to do nothing at all, which
      // read as a broken button. Say what a rep is instead — but leave the
      // ENGINE alone, as the old early return did: there is no measurement to
      // finish, and resetSet() would drop the skeleton lock for ~5 frames and
      // flap the pill over a lifter who is standing in frame, ready to go.
      setSetReport(r);
      setSetVerdict(noRepsCopy(categoryRef.current));
      resetRepReadout();
      resetRetrigger();
      setAnalysisTick((t) => t + 1);
      return;
    }
    // Coach speaks a one-line verdict in their voice.
    const worstFlaw = Object.entries(r.flawCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const verdict =
      r.avgScore >= 85 ? `${r.reps} clean reps. That's the standard — keep it there.`
      : worstFlaw === 'shallow' ? `${r.reps} reps, but ${r.flawCounts.shallow} were shallow. Hit full depth every rep.`
      : worstFlaw === 'rushed' ? `${r.reps} reps — too fast. Control the eccentric, own the tempo.`
      : worstFlaw === 'uneven' ? `${r.reps} reps, but you're leaning to one side. Even it out.`
      : worstFlaw === 'grindy' ? `${r.reps} hard reps. Grind's fine near failure — watch the form.`
      : `${r.reps} solid reps. Small tweaks and these are perfect.`;
    setSetReport(r);
    setSetVerdict(verdict);
    try { voice.cue('form_issue', { issue: verdict }); } catch { /* ignore */ }
    // `exercise` is the SAME key the technique screen sends (getExerciseFormKey)
    // so tutorial_shown → form_check_started → set_graded → retrigger join on
    // one vocabulary; the engine category rides along as its own prop.
    track('form_check_set_graded', {
      exercise: formKeyRef.current,
      category: categoryRef.current ?? 'unknown',
      reps: r.reps,
      avg_score: r.avgScore,
    });
    // A finished set is a finished measurement: reps and coaching evidence
    // start again for the next one. The body scale does NOT — the lifter's
    // torso is the same length for set three as for set two, and re-measuring
    // it is what made READY flap back to CALIBRATING between sets.
    engine.resetSet();
    visionRef.current = null;
    resetRepReadout();
    resetRetrigger();
    setAnalysisTick((t) => t + 1);
  };

  useEffect(() => {
    if (!canAccess('ai_form_coach')) {
      router.replace('/paywall?feature=ai_form_coach' as any);
      return;
    }
    // Only counted once the gate has let them through — otherwise every blocked
    // free user would register as having started a form check. The form key
    // (not the display name) so it joins technique's tutorial_* events.
    // Computed here rather than read from formKeyRef: that ref is filled by a
    // later effect in the same commit.
    track('form_check_started', { exercise: getExerciseFormKey(exerciseName ?? '') });
  }, []);

  // No mount-time permission prompt. The technique screen asks on CAMERA
  // READY, where the page has explained why; a refusal there must not be
  // followed by a second OS dialog the moment this screen mounts (Android's
  // second deny is "don't ask again", which would make the gate below inert).
  // If permission is missing, the gate renders with its own retry button.

  // Tutorial memory is consulted SYNCHRONOUSLY from the rep callback
  // (getEntry), which returns null for everything until this has resolved.
  // Kicked off at mount so the cache is warm long before the third rep; a
  // still-cold cache just means one set without a re-trigger, never a crash.
  useEffect(() => {
    void loadTutorialMemory();
  }, []);

  // MLKit pose runs natively in the frame processor — there's no model file to
  // load, so we're "ready" as soon as the screen mounts. modelState/modelErrorMsg
  // are kept for the status UI; modelState flips to 'error' only if the native
  // frame-processor plugin isn't linked (detectPose throws in the worklet).
  const [modelState, setModelState] = useState<'loading' | 'loaded' | 'error'>('loaded');
  const [modelErrorMsg, setModelErrorMsg] = useState<string | null>(null);
  const pluginErrorReportedRef = useRef(false);

  // ── Two-buffer state: targetKpts (latest detection) + displayKpts (rendered, interpolated)
  const targetKptsRef  = useRef<Kpt[] | null>(null);
  const [displayKpts, setDisplayKpts] = useState<Kpt[] | null>(null);
  const rejectStreakRef = useRef(0);   // gate hysteresis (see rejectDetection)
  const lastTickAtRef   = useRef(0);   // analysis-tick throttle (~8Hz)
  const lastDetectAtRef = useRef(0);   // freshness clock (see STALE_DETECTION_MS)
  // One-Euro smoother — applied to RAW keypoints before they become target.
  // Kills the ±2-3px MoveNet jitter on a still body.
  const smootherRef = useRef(new KeypointSmoother());

  const formLibraryData    = useMemo(() => getExerciseForm(exerciseName ?? ''), [exerciseName]);
  // Bridge the category to handlePose via a ref (avoids re-creating the pose
  // callback — and its RunOnJS binding — when the exercise changes).
  useEffect(() => {
    // Translate the library's vocabulary into the engine's. These grew apart:
    // 'push'/'isolation'/'hinge' matched no profile, so getProfile() fell back to
    // 'general' (checks: []) and the coach watched in silence. null = we have no
    // profile for this movement and must say so rather than pretend.
    categoryRef.current = visionCategoryFor(formLibraryData) ?? undefined;
    // Memory key from the library, never a slug built here: the technique
    // screen writes under the same function's output, and two spellings of
    // one exercise would split its history.
    formKeyRef.current = getExerciseFormKey(exerciseName ?? '');
    // setCategory rebuilds the rep machine (new exercise = new set) but KEEPS
    // the body scale on purpose: the lifter's torso is the same length, and
    // re-measuring it would blank the coach for another second for nothing.
    engineRef.current?.setCategory(categoryRef.current);
    visionRef.current = null;
    // New exercise = new set: nothing measured under the old one carries over.
    resetRepReadout();
    resetRetrigger();
    setAnalysisTick((t) => t + 1);
  }, [formLibraryData, exerciseName]);

  // Screen mount: start from a clean engine — no stale calibration, no reps
  // banked before this screen existed.
  useEffect(() => {
    engineRef.current?.reset();
  }, []);

  const libraryCheckpoints = formLibraryData?.checkpoints ?? [];
  const libraryMistakes    = formLibraryData?.commonMistakes ?? [];
  const libraryBreathing   = formLibraryData?.breathingCue ?? null;
  const tips = formLibraryData ? [] : tipsForExercise(exerciseName ?? '');

  // Voice cues — the coach speaks ONLY what the engine elects to say.
  const voice = useVoiceCues();
  // handlePose speaks at detection rate, and `cue` changes identity whenever the
  // voice preference or persona changes. Reading it through a ref keeps the pose
  // callback — and the RunOnJS binding built from it — stable.
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; });
  // The last line the engine ELECTED to speak. lib/voiceCues keeps its own 10s
  // same-text guard for callers that fire blindly; the engine's decider is not
  // one of those, and it deliberately re-opens the mouth inside its own 9s
  // window when a fault ESCALATES (minor → critical). Same text, so that guard
  // would swallow exactly the cue a lifter must not miss. Tracked here so the
  // guard can be cleared on an elected repeat, and only then.
  const lastSpokenLineRef = useRef<string | null>(null);

  /**
   * Tracking lost — the single path, whichever direction it came from.
   *
   * Blanking the skeleton without abandoning the rep leaves a live judgement
   * hanging over a body nobody is looking at, which is the whole failure this
   * screen was rebuilt to stop. Reps and speech cooldowns survive: a dropout is
   * not a reason to forget either.
   */
  const loseTracking = useCallback(() => {
    if (targetKptsRef.current === null) return;
    targetKptsRef.current = null;
    smootherRef.current = new KeypointSmoother();
    engineRef.current?.abandon();
    visionRef.current = null;
    lastSpokenLineRef.current = null;
    voiceRef.current.stop();   // nobody in frame — stop talking to the room
    // The abandoned rep's evidence goes with it; banked reps (recentRepsRef)
    // and the per-rep score survive a dropout, exactly as the rep count does.
    curRepFindingsRef.current = new Set();
    spokenRef.current = null;
    jointTiersRef.current = null;
    lastTickAtRef.current = Date.now();
    setAnalysisTick((t) => t + 1);
  }, []);

  // The engine result lives in a ref and is published to the UI by this counter,
  // throttled to ~8Hz in handlePose. Detection runs at 15fps and re-rendering
  // the stage on every frame was a render storm that delayed pose delivery.
  const [analysisTick, setAnalysisTick] = useState(0);

  // Stop any speech when the user leaves the form coach screen
  useEffect(() => {
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MLKit pose result handler (runs on the JS thread via useRunOnJS) ────────
  // MLKit returns named landmark positions in UPRIGHT image-pixel space, and
  // ONLY when its detector sees a real body (empty object otherwise → no
  // hallucination). We map coords to the camera view (cover-fit + front mirror),
  // build the 33-index Kpt array, smooth it, and hand it to the engine.
  const mirrorFront = facing === 'front';
  const handlePose = useCallback((data: any, frameW: number, frameH: number, mirror: boolean, ts?: number) => {
    // Camera-frame timestamp for the One-Euro clock (Android: ns since boot).
    const tMs = typeof ts === 'number' && ts > 0 ? (ts > 1e13 ? ts / 1e6 : ts) : Date.now();

    // Stamped for EVERY answered detection, accepted or rejected: the watchdog
    // below asks "is the detector still talking to us", which the rejection
    // hysteresis already answers on its own terms.
    lastDetectAtRef.current = Date.now();

    // Throttled analysis tick (~8Hz) — analysis re-runs don't need every frame,
    // and per-frame setState was a render storm that delayed pose delivery.
    const tickAnalysis = (force = false) => {
      const now = Date.now();
      if (force || now - lastTickAtRef.current >= 120) {
        lastTickAtRef.current = now;
        // Checklist tiers ride the same ~8Hz clock as the rest of the engine's
        // readings, from the ANALYSED pose — see computeJointTiers.
        jointTiersRef.current = computeJointTiers(targetKptsRef.current);
        setAnalysisTick((t) => t + 1);
      }
    };
    // Reject with HYSTERESIS: a single bad detection (MLKit stream dropout,
    // joint likelihoods dipping at 0.5) must not blank the skeleton — that
    // caused freeze/flicker and status flapping. We coast on the last good pose
    // and only blank after N consecutive rejects, then also reset the smoother
    // so re-acquisition doesn't blend from stale state.
    const rejectDetection = () => {
      rejectStreakRef.current += 1;
      if (rejectStreakRef.current < REJECT_STREAK_TO_BLANK) return; // coast
      // Tracking is genuinely lost: drop the rep in progress so it can never be
      // completed across the blackout.
      loseTracking();
    };

    const nose = data?.nosePosition;
    // No person detected → (hysteresis) blank the skeleton and stay silent.
    if (!data || !nose || (nose.x === 0 && nose.y === 0)) {
      rejectDetection();
      return;
    }
    // MLKit coords are upright; portrait view → image width=min, height=max.
    const imgW = Math.min(frameW, frameH);
    const imgH = Math.max(frameW, frameH);
    const viewW = screenWidth, viewH = cameraHeight;
    // Cover-fit (matches the camera preview's resizeMode="cover").
    const scale = Math.max(viewW / imgW, viewH / imgH);
    const offX = (viewW - imgW * scale) / 2;
    const offY = (viewH - imgH * scale) / 2;

    const raw: Kpt[] = [];
    for (let i = 0; i < NUM_LANDMARKS; i++) raw.push([0, 0, 0]);
    for (const name in MLKIT_TO_INDEX) {
      const p = data[name];
      if (!p) continue;
      // Only count joints actually WITHIN the camera frame (±3% tolerance —
      // MLKit STREAM_MODE returns slightly negative coords for real joints at
      // the frame edge; the old strict >0 check zeroed them and destabilized
      // the gates for users near the edge). (0,0) is the native null sentinel.
      const isSentinel = p.x === 0 && p.y === 0;
      const tolX = imgW * 0.03, tolY = imgH * 0.03;
      const inFrame = !isSentinel &&
        p.x > -tolX && p.y > -tolY && p.x <= imgW + tolX && p.y <= imgH + tolY;
      // Real MLKit confidence (Android now emits inFrameLikelihood via patch;
      // fall back to a binary in-frame flag on older native builds).
      const lk = typeof p.inFrameLikelihood === 'number' ? p.inFrameLikelihood : 1;
      let sx = p.x * scale + offX;
      const sy = p.y * scale + offY;
      if (mirror) sx = viewW - sx;
      raw[MLKIT_TO_INDEX[name]] = [sx, sy, inFrame ? lk : 0];
    }

    // Alignment diagnostic: frame space, view box, and where the NOSE lands
    // raw → mapped. If the mapped nose isn't on the person's nose on screen,
    // these numbers tell us exactly how the transform is off. Built only while
    // the panel is open — this is the hot path, and nine string concatenations
    // per detection to feed a hidden <Text> is pure waste.
    if (showAlignRef.current) {
      alignDebugRef.current =
        'frame ' + frameW + '×' + frameH + ' → img ' + imgW + '×' + imgH +
        ' | view ' + viewW + '×' + viewH +
        ' | nose raw ' + Math.round(nose.x) + ',' + Math.round(nose.y) +
        ' → ' + Math.round(raw[0][0]) + ',' + Math.round(raw[0][1]) +
        ' | mir ' + (mirror ? 'Y' : 'N');
    }

    // ── REJECT non-real "humans" ───────────────────────────────────────────
    // MLKit also detects human shapes in PHOTOS / SCREENS / POSTERS in view —
    // those appear small & clustered. A real person doing an exercise fills a
    // large vertical span of the frame. So require the pose's bounding box to be
    // tall enough; otherwise it's a picture-of-a-person, not a person.
    // Only count landmarks MLKit is genuinely confident about (real body points),
    // not every hallucinated joint. This is what stops a hand held to the lens
    // from rendering a full skeleton.
    const STRONG = 0.5;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, strong = 0;
    for (const k of raw) {
      if (k[2] >= STRONG) {
        strong += 1;
        if (k[0] < minX) minX = k[0]; if (k[0] > maxX) maxX = k[0];
        if (k[1] < minY) minY = k[1]; if (k[1] > maxY) maxY = k[1];
      }
    }
    // Span uses the LARGER bbox dimension: a vertical-only 45% gate rejected
    // the bottom of deep squats and every horizontal exercise (push-ups).
    const span = Math.max(maxY - minY, maxX - minX);
    const minSpan = viewH * 0.30;
    // The proportion test now lives in lib/vision alongside the temporal lock
    // that consumes it, so the screen and the engine can never disagree about
    // what counts as a human body.
    const implausible = !anatomyPlausible(raw);
    poseLog('strong=' + strong + '/33 span=' + Math.round(span) + ' need>' + Math.round(minSpan) + (implausible ? ' IMPLAUSIBLE' : ''));

    // Reject (with hysteresis) unless enough HIGH-CONFIDENCE joints span a
    // large-enough box AND the proportions could be a real human.
    if (strong < 8 || span < minSpan || implausible) {
      rejectDetection();
      return;
    }

    rejectStreakRef.current = 0;

    // ── Smoothing stays HERE (One-Euro on the camera clock); analysis is the
    // engine's. It receives SMOOTHED, screen-space landmarks and returns the
    // whole judgement: quality, calibration, phase, reps and what to say.
    const smoothed = smootherRef.current.smooth(raw, tMs);
    targetKptsRef.current = smoothed;

    const engine = engineRef.current;
    if (!engine) return;
    const res = engine.process(smoothed, tMs, viewW, viewH);
    visionRef.current = res;

    // Speak ONLY the engine's elected cue. It already applies temporal
    // confirmation and the anti-nag cooldown, so a second throttle here would
    // silently swallow the one line it decided was worth hearing — and speaking
    // findings directly would bypass the gate entirely.
    //
    // lib/voiceCues carries such a second throttle for its blind callers: the
    // same cue text stays silent for 10s. The decider's own window is 9s, and it
    // opens EARLY (≥1.5s) when a fault escalates minor → critical — same id,
    // same text, so that guard would eat the one repeat that carries new
    // information. `stop()` clears it. Only on a repeat: cutting speech dead
    // immediately before starting it is not worth doing on the common path.
    const speak = res.verdict.speak;
    if (speak) {
      if (speak.message === lastSpokenLineRef.current) voiceRef.current.stop();
      lastSpokenLineRef.current = speak.message;
      voiceRef.current.cue('form_issue', { issue: speak.message });
      // Latch the elected line for the on-screen correction (see spokenRef).
      spokenRef.current = { finding: speak, atMs: Date.now() };
    }

    // Every confirmed finding this frame is evidence against the rep in flight.
    // Ids, not messages: the re-trigger rule matches on check identity.
    for (const f of res.verdict.findings) curRepFindingsRef.current.add(f.id);

    if (res.completedRep) {
      const r = res.completedRep;
      repLog('REP #' + r.index + ' bottom=' + Math.round(r.bottomAngle) +
             ' rom=' + Math.round(r.rom) + ' dur=' + Math.round(r.totalMs) + 'ms' +
             ' cat=' + (categoryRef.current ?? 'none'));
      // Bank the per-rep score the readout shows between reps.
      const graded = toRepData(r, categoryRef.current);
      lastRepScoreRef.current = graded.score;
      repIndexRef.current = graded.index;
      // Close the rep's evidence and ask whether the pattern warrants a
      // walkthrough. getEntry is null until memory has hydrated; the rule
      // treats that as "never prompted", which is the safe reading.
      recentRepsRef.current.push([...curRepFindingsRef.current]);
      if (recentRepsRef.current.length > RECENT_REPS_CAP) recentRepsRef.current.shift();
      curRepFindingsRef.current = new Set();
      const key = formKeyRef.current;
      const hit = shouldRetrigger(
        recentRepsRef.current, getEntry(key), Date.now(), promptedThisSetRef.current,
      );
      if (hit) {
        promptedThisSetRef.current = true;
        void recordRetrigger(key);
        track('technique_retrigger_shown', { exercise: key, check: hit.checkId });
        setRetriggerCheckId(hit.checkId);
      }
    }

    // One compact line per sample: why the screen is showing what it is showing.
    // Read with `adb logcat -s ReactNativeJS | grep pose`.
    poseLog('phase=' + res.phase +
            ' q=' + Math.round(res.quality.overall) +
            ' judge=' + (res.quality.canJudge ? 'Y' : 'n') +
            ' cal=' + (res.calibrating ? Math.round(res.calibrationProgress * 100) + '%' : 'ok') +
            ' score=' + (res.verdict.score == null ? '--' : Math.round(res.verdict.score)) +
            ' conf=' + Math.round(res.verdict.confidence) +
            ' reps=' + engine.repCount);

    // A banked rep must reach the counter now, not up to 120ms later.
    tickAnalysis(res.completedRep != null);
  }, [screenWidth, cameraHeight, loseTracking]);

  // One-time error surface if the native frame-processor plugin isn't linked.
  const reportPluginError = useCallback((msg: string) => {
    if (pluginErrorReportedRef.current) return;
    pluginErrorReportedRef.current = true;
    poseLog('plugin error: ' + msg);
    setModelErrorMsg('Pose engine unavailable. Please reinstall the app.');
    setModelState('error');
  }, []);

  const onPoseJS = useRunOnJS(handlePose, [handlePose]);
  const onPluginErrorJS = useRunOnJS(reportPluginError, [reportPluginError]);

  // ── Frame processor: MLKit pose on every camera frame (worklet thread) ──────
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      // Throttle inference to DETECT_FPS: unthrottled per-frame detection with
      // a blocking MLKit call chewed through queues of progressively STALE
      // frames and burst-delivered results to JS (300ms+ perceived lag).
      runAtTargetFps(DETECT_FPS, () => {
        'worklet';
        const data = detectPose(frame, { mode: 'stream', performanceMode: 'max' });
        onPoseJS(data, frame.width, frame.height, mirrorFront, Number(frame.timestamp));
      });
    } catch (e: any) {
      onPluginErrorJS(String(e?.message ?? e));
    }
  }, [onPoseJS, onPluginErrorJS, mirrorFront]);

  // ── Render loop (~30fps interpolation) ─────────────────────────────────────
  // Glides displayKpts toward targetKptsRef.current with a dt-scaled catch-up
  // factor (frame-rate independent). 30fps halves the render load of the old
  // 60fps storm that delayed pose deliveries on the JS thread.
  useEffect(() => {
    let lastTick = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      // WATCHDOG. The rejection hysteresis only fires on detections MLKit
      // answered; when the detector goes quiet altogether (camera released on
      // background, a screen pushed on top, the plugin dying after a good run)
      // nothing expired the last result — so the stage held a frozen skeleton
      // and a live FORM number over a camera that was seeing nothing at all.
      // That is the number-the-camera-never-earned failure arriving by the back
      // door, so it lands in the same place as any other tracking loss.
      if (targetKptsRef.current !== null &&
          Date.now() - lastDetectAtRef.current > STALE_DETECTION_MS) {
        loseTracking();
      }
      const target = targetKptsRef.current;
      if (!target) {
        // FUNCTIONAL update — the old `if (displayKpts !== null)` read a stale
        // closure (always null), so the skeleton NEVER cleared: it froze at the
        // last pose (ghost skeleton = the "misaligned" complaint) and kept the
        // LIVE pill stuck after the user left frame.
        setDisplayKpts((curr) => (curr === null ? curr : null));
        return;
      }
      const alpha = 1 - Math.exp(-dt / RENDER_TAU_MS);
      setDisplayKpts((curr) => {
        if (!curr) return target;          // first detection — snap to position
        return lerpKpts(curr, target, alpha);
      });
    }, RENDER_INTERVAL_MS);
    return () => clearInterval(id);
    // Interval reads targetKptsRef directly + uses functional setState only.
    // loseTracking is ref-only and stable, so this still mounts exactly once.
  }, [loseTracking]);

  // Flipping the camera mirrors the coordinate space: the same lifter jumps to
  // the other side of the frame in a single detection. Smoothing across that
  // feeds the engine a burst of impossible motion — enough to bank a rep out of
  // it, and enough to poison the body scale — so a flip is what it is: tracking
  // lost. No-op on mount, when there is nothing to lose.
  useEffect(() => { loseTracking(); }, [facing, loseTracking]);

  // ── Coach cue (instant — local library) ───────────────────────────────────
  const [aiFeedback, setAiFeedback]     = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const lastCallAt    = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGetCoachCue = useCallback(() => {
    if (Date.now() - lastCallAt.current < CUE_COOLDOWN_MS) return;
    lastCallAt.current = Date.now();
    const form = getExerciseForm(exerciseName ?? '');
    const cue = form ? getCoachCue(form, personaTheme.id) : 'Focus on controlled tempo and full range of motion.';
    setAiFeedback(cue);
    let remaining = Math.ceil(CUE_COOLDOWN_MS / 1000);
    setCooldownLeft(remaining);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      remaining -= 1;
      setCooldownLeft(remaining);
      if (remaining <= 0 && cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    }, 1_000);
  }, [exerciseName, personaTheme.id]);

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  const canCallCue = Date.now() - lastCallAt.current >= CUE_COOLDOWN_MS;

  // The technique walkthrough in review mode (preview only, ends with back).
  // Persona goes across as the canonical PersonaId; technique normalises
  // whatever it gets, but there is no reason to hand it a program id here.
  const openTechniqueReview = useCallback(() => {
    router.push({
      pathname: '/technique',
      params: { exerciseName: exerciseName ?? '', persona: personaTheme.id, mode: 'review' },
    } as any);
  }, [router, exerciseName, personaTheme.id]);

  // ── Engine state, published to the UI by the ~8Hz analysisTick ─────────────
  // Read from refs on purpose: the values change at detection rate and this
  // screen re-renders far less often than that. `analysisTick` is what makes
  // these reads fresh.
  const vision      = visionRef.current;
  const quality     = vision?.quality ?? null;
  const verdict     = vision?.verdict ?? null;
  const calibrating = vision?.calibrating ?? false;
  const canJudge    = quality?.canJudge ?? false;
  const repCount    = engineRef.current?.repCount ?? 0;
  // The ONE correction on screen. The line the coach just SAID wins for the
  // decider's own window, so eye and ear agree; otherwise the worst confirmed
  // finding (the engine orders findings worst-first).
  const spoken      = spokenRef.current;
  const topFinding: Finding | null =
    spoken && Date.now() - spoken.atMs < SPOKEN_HOLD_MS
      ? spoken.finding
      : verdict?.findings[0] ?? null;
  // Per-REP readout state. `awaiting` until the first rep lands (the dash is
  // explained as "First rep sets your score", never blamed on the camera);
  // `tracking` while a rep is in flight; `scored` between reps.
  const inRep       = phaseInRep(vision?.phase);
  const readoutState: FormReadoutState =
    repCount === 0 ? 'awaiting' : inRep ? 'tracking' : 'scored';
  const lastRepScore = repCount > 0 ? lastRepScoreRef.current : null;
  const readoutRep   = inRep ? repIndexRef.current + 1 : repIndexRef.current;
  // Calibration edge → timestamp, so the pill can say POSITION GOOD briefly.
  // Written during render on purpose: the value is only ever read by this same
  // render path, and an effect would land one tick late.
  if (calibrating) calibratedAtRef.current = 0;
  else if (calibratedAtRef.current === 0 && vision) calibratedAtRef.current = Date.now();
  const positionGood =
    canJudge && repCount === 0 && !calibrating &&
    calibratedAtRef.current > 0 && Date.now() - calibratedAtRef.current < POSITION_GOOD_MS;
  const jointTiers  = jointTiersRef.current ?? undefined;
  // Re-trigger prompt copy: the library's human label for the check. Labels
  // are check NAMES ("Depth", "Lockout"), not faults, so the sentence is built
  // around "flagged" to read right for every one of them. A check the library
  // has not named falls back to a neutral line — never a raw id like
  // "squat.depth" on the stage.
  const retriggerLabel = retriggerCheckId
    ? formLibraryData?.detectedFaults?.find((f) => f.checkId === retriggerCheckId)?.label ?? null
    : null;
  const retriggerCopy = retriggerLabel
    ? `${retriggerLabel} flagged in 3 of your last 4 reps`
    : 'Same issue flagged in 3 of your last 4 reps';
  // `canJudge` is a claim about the CAMERA; `judged` is a claim about the
  // JUDGEMENT, and they are not the same fact. Pose quality asks each joint
  // group for one usable member, so it is satisfied by a shoulder seen on the
  // left and an elbow seen only on the right — a pose from which no limb chain
  // can be measured. The engine then refuses to judge and returns a null score
  // with an empty findings list. Read as "canJudge && no findings", that empty
  // list is indistinguishable from flawless form, which is how "Form looks
  // solid" ends up printed over a body the engine explicitly declined to grade.
  // A null score is the engine's refusal, so anything that ASSERTS something
  // about the lifter's form gates on this, not on canJudge.
  const judged      = verdict?.score != null;

  // Joints the DISPLAYED finding implicated — only that one, so the highlighted
  // chain and the correction sheet make the same claim. The decision layer's
  // finding type declares only `joint?: string`, but the engine deliberately
  // passes the biomechanics layer's `joints` index array through untouched so
  // overlays can highlight exactly the landmarks the check used.
  const flaggedJoints = new Set<number>();
  {
    const idxs = (topFinding as unknown as { joints?: number[] } | null)?.joints;
    if (Array.isArray(idxs)) for (const i of idxs) flaggedJoints.add(i);
  }

  // SKELETON HONESTY: a joint is drawn at the confidence the engine assigns it,
  // and a joint we cannot see is not drawn at all. Solid = high, dimmed =
  // medium, absent = low — so the overlay can never imply we are tracking a limb
  // that is out of shot. Same tier function the gate itself uses, so the picture
  // and the judgement cannot drift apart.
  //
  // The whole skeleton is now a quiet reference layer; only the flagged chain
  // is drawn at full strength, so the eye lands on the fault, not the figure.
  const conf = (idx: number): number => displayKpts?.[idx]?.[2] ?? 0;
  const tier = (idx: number) => jointConfidenceTier(conf(idx));
  const boneVisible = (a: number, b: number): boolean =>
    tier(a) !== 'low' && tier(b) !== 'low';
  // A bone is part of the flagged chain only when BOTH ends are: one flagged
  // knee should not light every bone that happens to touch it.
  const boneFlagged = (a: number, b: number): boolean =>
    flaggedJoints.has(a) && flaggedJoints.has(b);
  const boneColor = (a: number, b: number): string =>
    boneFlagged(a, b) ? stage.danger : stageAccent;
  const boneOpacity = (a: number, b: number): number =>
    boneFlagged(a, b) ? 0.95 : tier(a) === 'high' && tier(b) === 'high' ? 0.32 : 0.16;
  const jointColor = (idx: number): string =>
    flaggedJoints.has(idx) ? stage.danger : stageAccent;
  const jointOpacity = (idx: number, solid: boolean, isFace: boolean): number =>
    flaggedJoints.has(idx) ? 0.95 : solid ? (isFace ? 0.3 : 0.35) : 0.2;

  // Tracked-joint count for the readout: exactly the joints being drawn, so the
  // number on screen and the picture on screen are the same claim.
  const trackedJoints = displayKpts
    ? DRAW_POINTS.reduce((n, i) => n + (tier(i) === 'low' ? 0 : 1), 0)
    : 0;

  if (!hasPermission) {
    return (
      <CanvasScreen scroll={false} tabBar={false} topInset contentStyle={styles.gateBody}>
        <Text style={styles.gateEyebrow}>Form check</Text>
        <Text style={styles.gateTitle}>Point the{'\n'}camera at{'\n'}yourself.</Text>
        <Text style={styles.gateText}>
          Camera access is required for live form coaching.
        </Text>
        <PressableScale
          style={styles.gateBtn}
          onPress={requestPermission}
          haptic="heavy"
          accessibilityRole="button"
        >
          <CameraIcon size={15} color={tokens.accentInk} />
          <Text style={styles.gateBtnText}>Grant camera access</Text>
        </PressableScale>
      </CanvasScreen>
    );
  }
  if (!device) {
    // Skeleton shaped like the screen that is coming: a tall camera stage with
    // its floating readouts, not a bare spinner.
    return (
      <CanvasScreen scroll={false} tabBar={false} topInset contentStyle={styles.gateLoading}>
        <Text style={styles.gateEyebrow}>Form check</Text>
        <Skeleton height={Math.round(screenHeight * 0.46)} radius={26} />
        <View style={styles.gateLoadingRow}>
          <Skeleton width={96} height={44} radius={22} />
          <Skeleton width={64} height={44} radius={22} />
        </View>
        <Text style={styles.gateText}>Loading camera…</Text>
      </CanvasScreen>
    );
  }

  const isTracking   = displayKpts !== null;
  const modelLoading = modelState === 'loading';
  const modelError   = modelState === 'error';
  // The ⬤ glyph is now a real dot view, so the label carries text only. Every
  // state below is one the engine actually reports — the pill never claims a
  // live judgement while the engine is still measuring or cannot see.
  const statusLabel  =
    modelError                  ? 'MODEL ERROR' :
    modelLoading                ? 'LOADING AI…' :
    !isTracking                 ? 'STEP INTO FRAME' :
    calibrating                 ? 'CALIBRATING' :
    // The SETTING UP checklist is on screen for exactly this state, naming
    // the joints still missing. The pill tells the same story, in the same
    // words, rather than a second tone for one moment.
    !canJudge                   ? 'SETTING UP' :
    // Pose quality is satisfied but no single limb chain reads end-to-end (a
    // shoulder on the left, an elbow only on the right), so the engine returned
    // a null score. LIVE here would be the pill making the very claim this
    // comment promises it never makes.
    !judged                     ? 'NO CLEAR VIEW' :
    // Calibration just completed and nothing has been lifted: answer the
    // question the lifter is actually asking ("am I set up?"), briefly.
    positionGood                ? 'POSITION GOOD' :
    // 'setup' means armed but not lifting. Calling that LIVE would claim a live
    // judgement of a rep nobody has started.
    vision?.phase === 'setup'   ? 'READY' :
                                  'LIVE · ' + (vision?.phase ?? 'setup').toUpperCase();
  const statusColor =
    modelError                  ? stage.danger :
    !isTracking                 ? stage.crownTextDim :
    calibrating || !canJudge    ? stage.warning :
    !judged                     ? stage.warning :
    positionGood                ? stage.success :
    vision?.phase === 'setup'   ? stage.warning :
                                  stage.crownText;

  return (
    <View style={styles.root}>
      {/* This screen has no <Crown>, so it owes the same status-bar contract: the
          dark head runs under the bar and the shell's light-scheme dark-content
          icons would vanish against it. */}
      {screenFocused ? <StatusBar barStyle="light-content" /> : null}

      {/* Dark head block — reads as one surface with the camera stage below it. */}
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close form coach"
          style={styles.headBtn}
        >
          <XIcon size={19} color={stage.crownText} />
        </PressableScale>
        <View style={styles.headTitleWrap}>
          <Text style={styles.headEyebrow}>Live form check</Text>
          <Text
            style={styles.headTitle}
            numberOfLines={1}
            onLongPress={() => setShowAlign((s) => !s)}
            suppressHighlighting
          >
            {exerciseName ?? 'Form Coach'}
          </Text>
        </View>
        {/* Back to the walkthrough without leaving the set: a PUSH, so the
            camera screen (and its banked reps) is still here on return. */}
        <PressableScale
          onPress={openTechniqueReview}
          haptic="light"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Review technique"
          style={styles.headTextBtn}
        >
          <Text style={styles.headTextBtnText}>Technique</Text>
        </PressableScale>
        <PressableScale
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          haptic="light"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
          style={styles.headBtn}
        >
          <RefreshCw size={17} color={stage.crownText} />
        </PressableScale>
      </View>

      <View style={[styles.stage, { height: cameraHeight }]}>
        {/* Focus-gated: the Technique button and REVIEW NOW push /technique on
            top of this screen, and VisionCamera does not stop the session for a
            covered screen — MLKit at 15 fps, the 30 fps skeleton renders and the
            voice cues would all keep running under the clip player. Going
            inactive stops detections, so the stale watchdog runs loseTracking
            (voice off, in-flight rep dropped); banked reps survive the trip. */}
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={screenFocused}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />

        {/* Legibility scrims — the overlays are borderless, so the stage itself
            carries their contrast instead of a box around each one. They sit
            UNDER the Svg: painted on top they would dim the tracked legs, which
            is exactly the part of the skeleton a squat depends on. */}
        <LinearGradient
          pointerEvents="none"
          colors={[stage.overlay, 'transparent']}
          style={styles.scrimTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', stage.scrim]}
          style={styles.scrimBottom}
        />

        <Svg
          style={StyleSheet.absoluteFill}
          width={screenWidth}
          height={cameraHeight}
          pointerEvents="none"
        >
          {isTracking && displayKpts && (
            <>
              {SKELETON.map(([a, b], i) => {
                // A bone with a low-confidence end is NOT drawn: guessing where
                // an unseen limb lies is the same dishonesty as scoring a body
                // we cannot see.
                if (!boneVisible(a, b)) return null;
                const [ax, ay] = displayKpts[a];
                const [bx, by] = displayKpts[b];
                return (
                  <Line
                    key={`l-${i}`}
                    x1={ax} y1={ay} x2={bx} y2={by}
                    stroke={boneColor(a, b)}
                    strokeWidth={3}
                    strokeOpacity={boneOpacity(a, b)}
                    strokeLinecap="round"
                  />
                );
              })}
              {DRAW_POINTS.map((i) => {
                const t = tier(i);
                if (t === 'low') return null;   // not seen → not drawn
                const [cx, cy] = displayKpts[i];
                // Curated ~27 BlazePose joints (nose, ears, shoulders, elbows,
                // wrists, hands, hips, knees, ankles, heels, feet). Face points
                // get a smaller radius so they don't crowd the body joints.
                const isFace = FACE_POINTS.has(i);
                const solid = t === 'high';
                return (
                  <Circle
                    key={`k-${i}`}
                    cx={cx} cy={cy} r={isFace ? 4 : 6}
                    fill={jointColor(i)}
                    fillOpacity={jointOpacity(i, solid, isFace)}
                    stroke={stage.crown} strokeWidth={1.5}
                    strokeOpacity={flaggedJoints.has(i) ? 1 : solid ? 0.5 : 0.25}
                  />
                );
              })}
            </>
          )}
        </Svg>

        {showAlign && (
          <View style={styles.alignDebug} pointerEvents="none">
            {/* analysisTick drives re-render so this stays live */}
            <Text style={styles.alignDebugText}>{alignDebugRef.current}{analysisTick ? '' : ''}</Text>
          </View>
        )}

        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        <View style={styles.stageBottom} pointerEvents="box-none">
          {/* The ONE coaching line the engine confirmed. Findings are never
              rendered speculatively: this list is already temporally confirmed
              and confidence-gated by the decision layer. */}
          {isTracking && !calibrating && canJudge && topFinding && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.danger }]} />
              <AlertTriangle size={14} color={stage.danger} />
              <Text style={styles.sheetText} numberOfLines={2}>{topFinding.message}</Text>
            </View>
          )}
          {/* No mid-set praise sheet, by design. Nothing replaces it: the engine
              only ever emits fault findings ('info' is a mild fault, not praise),
              so a clean rep is silent. Its positive channels are the per-rep
              score above and the end-of-set verdict. A "form looks solid" plate
              under a live number was two channels asserting the same judgement,
              and it hid the readout. */}
          {/* Visible and judgeable, but no rep has begun: the engine reports
              'setup'. Say so rather than coaching a body that isn't lifting. */}
          {isTracking && !calibrating && canJudge && vision?.phase === 'setup' && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.crownTextDim }]} />
              <Pause size={14} color={stage.crownTextDim} />
              <Text style={styles.sheetText}>Start your set when you&apos;re ready</Text>
            </View>
          )}
          {!isTracking && !modelLoading && !modelError && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.crownTextDim }]} />
              <CameraIcon size={14} color={stage.crownTextDim} />
              {/* Category-aware: a SEATED press cannot show a full body, so asking
                  for one is impossible advice. Upper-body lifts only need the
                  torso and arms in shot. */}
              <Text style={styles.sheetText}>
                {isUpperBody(categoryRef.current)
                  ? 'Step into frame — head, torso and both arms'
                  : 'Step into frame — full body visible'}
              </Text>
            </View>
          )}
          {/* The same fault in 3 of the last 4 reps: offer the walkthrough ONCE
              per set. Buttons are PressableScale — this container is box-none,
              so a plain View would not take the tap. */}
          {retriggerCheckId && (
            <View style={styles.retriggerSheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.warning }]} />
              <Text style={styles.retriggerTitle}>REVIEW TECHNIQUE</Text>
              <Text style={styles.retriggerText}>{retriggerCopy}</Text>
              <View style={styles.retriggerRow}>
                <PressableScale
                  style={[styles.retriggerBtn, { backgroundColor: stageAccent }]}
                  onPress={() => { setRetriggerCheckId(null); openTechniqueReview(); }}
                  haptic="medium"
                  accessibilityRole="button"
                >
                  <Text style={[styles.retriggerBtnText, { color: stageAccentInk }]}>REVIEW NOW</Text>
                </PressableScale>
                <PressableScale
                  style={styles.retriggerBtnGhost}
                  onPress={() => setRetriggerCheckId(null)}
                  haptic="light"
                  accessibilityRole="button"
                >
                  <Text style={styles.retriggerBtnText}>CONTINUE SET</Text>
                </PressableScale>
              </View>
            </View>
          )}
          {modelLoading && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.crownTextDim }]} />
              <Skeleton width={40} height={8} radius={4} />
              <Text style={styles.sheetText}>Loading pose model…</Text>
            </View>
          )}
          {modelError && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.danger }]} />
              <AlertTriangle size={14} color={stage.danger} />
              <Text style={styles.sheetText} numberOfLines={3}>
                {modelErrorMsg ?? 'Pose model failed to load.'}
              </Text>
            </View>
          )}

          {/* Can't see well enough to judge: say exactly WHICH joints are the
              problem instead of a score. This panel is the whole point of the
              rebuild — it replaces a number the camera never earned. */}
          {isTracking && !calibrating && !modelError && quality && !canJudge && (
            <CameraCoach
              quality={quality}
              category={categoryRef.current}
              joints={jointTiers}
              variant="checklist"
            />
          )}

          {/* Judgeable: the live readout. The number is the LAST COMPLETED REP's
              grade, null until one lands — a per-frame score over a moving body
              was a frozen number nobody could act on. `advice` is the engine's
              camera guidance, passed only while it REFUSES to judge (the pill
              reads NO CLEAR VIEW), so a held rep number mid-set still explains
              itself; once a score is judged the slot stays clean. */}
          {isTracking && !calibrating && !modelError && canJudge && verdict && (
            <FormReadout
              score={lastRepScore}
              confidence={verdict.confidence}
              trackedJoints={trackedJoints}
              totalJoints={DRAW_POINTS.length}
              advice={judged ? null : verdict.advice}
              state={readoutState}
              repIndex={readoutRep}
              debug={showAlign}
            />
          )}

          {/* Rep counter + live rep phase (long-press to reset the set).
              Both come from the engine's state machine; refreshed by the ~8Hz
              analysis re-renders. */}
          {(repCount > 0 || (isTracking && !calibrating && canJudge)) && (
            <PressableScale
              style={styles.repRow}
              onLongPress={() => {
                // The FULL reset, calibration included — this is the lifter
                // saying "start over", not the end of a set.
                engineRef.current?.reset();
                visionRef.current = null;
                resetRepReadout();
                resetRetrigger();
                setAnalysisTick((t) => t + 1);
              }}
              haptic="light"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${repCount} reps counted. Long press to reset the set.`}
            >
              <View>
                <CountUp
                  value={repCount}
                  duration={420}
                  style={styles.repValue}
                />
                <Text style={styles.repLabel}>
                  REP{repCount === 1 ? '' : 'S'} counted
                </Text>
              </View>
              {isTracking && !calibrating && vision && (
                <View style={styles.repAngleCol}>
                  <Text style={styles.repPhaseValue}>{vision.phase.toUpperCase()}</Text>
                  <Text style={styles.repLabel}>Phase</Text>
                </View>
              )}
            </PressableScale>
          )}
        </View>

        {/* Body scale being measured. Sits above the stage controls but takes no
            touches, and the parent owns when it goes away. */}
        <CalibrationOverlay
          progress={vision?.calibrationProgress ?? 0}
          visible={isTracking && calibrating && !modelError}
          personaAccent={stageAccent}
        />
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + 44 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Finish set → grade the reps and show the report card.
            The one emerald moment on the light body. */}
        <PressableScale
          style={styles.ctaPrimary}
          onPress={finishSet}
          haptic="heavy"
          accessibilityRole="button"
        >
          <Check size={15} color={tokens.accentInk} strokeWidth={3} />
          <Text style={styles.ctaPrimaryText}>Finish set &amp; grade</Text>
        </PressableScale>

        {canAccess('video_review') && (
          <PressableScale
            style={styles.ctaGhost}
            onPress={() => router.push('/video-review' as any)}
            haptic="light"
            accessibilityRole="button"
          >
            <Video size={14} color={tokens.text} />
            <Text style={styles.ctaGhostText}>Record &amp; review</Text>
          </PressableScale>
        )}

        <PressableScale
          style={styles.cueBtn}
          onPress={handleGetCoachCue}
          disabled={!canCallCue}
          haptic="light"
          accessibilityRole="button"
        >
          <Sparkles size={14} color={tokens.textSecondary} />
          <Text style={styles.cueBtnText}>
            {cooldownLeft > 0
              ? `Ask ${coachName} again (${cooldownLeft}s)`
              : `Ask ${coachName} for a cue`}
          </Text>
        </PressableScale>

        {aiFeedback && (
          <View style={styles.cueCard}>
            <Text style={[styles.cueLabel, { color: pageAccent.accentText }]}>{claudePersonaLabel}</Text>
            <Text style={styles.cueText}>{aiFeedback}</Text>
          </View>
        )}

        <Section label={`Form cues · ${exerciseName ?? ''}`}>
          {libraryCheckpoints.length > 0
            ? libraryCheckpoints.map((cp, i) => (
                <View key={i}>
                  {i > 0 && <Hairline />}
                  <View style={styles.tipRow}>
                    <Text style={styles.tipPhase}>{cp.phase.slice(0, 3)}</Text>
                    <Text style={styles.tipText}>{cp.description}</Text>
                  </View>
                </View>
              ))
            : tips.map((tip, i) => (
                <View key={i}>
                  {i > 0 && <Hairline />}
                  <View style={styles.tipRow}>
                    <Text style={styles.tipPhase}>—</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                </View>
              ))
          }
        </Section>

        {libraryMistakes.length > 0 && (
          <Section label="Common mistakes">
            {libraryMistakes.map((m, i) => (
              <View key={i} style={styles.mistakeRow}>
                <XIcon size={14} color={tokens.danger} strokeWidth={3} style={styles.mistakeIcon} />
                <Text style={styles.tipText}>{m}</Text>
              </View>
            ))}
          </Section>
        )}

        {libraryBreathing && (
          <View style={styles.breathCard}>
            <Text style={styles.breathLabel}>Breathing</Text>
            <Text style={styles.breathText}>{libraryBreathing}</Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          Stop immediately if you feel pain. Pose detection is a guide — your trainer&apos;s eyes are final.
        </Text>
      </ScrollView>

      {/* ── END-OF-SET REPORT CARD ─────────────────────────────────────────── */}
      {setReport && setReport.reps < 1 && (
        <View style={styles.reportOverlay}>
          <View style={styles.reportCard}>
            <Text style={styles.reportEyebrow}>{personaTheme.shortName} · SET REPORT</Text>
            <Text style={styles.reportGrade}>No reps detected</Text>
            <Text style={styles.reportSentence}>{setVerdict ?? noRepsCopy(categoryRef.current)}</Text>
            <PressableScale
              style={styles.reportDone}
              onPress={() => { setSetReport(null); setSetVerdict(null); }}
              haptic="medium"
              accessibilityRole="button"
            >
              <Text style={styles.reportDoneText}>Done</Text>
            </PressableScale>
          </View>
        </View>
      )}
      {setReport && setReport.reps >= 1 && (
        <View style={styles.reportOverlay}>
          {/* The card is bounded to the overlay and its BODY scrolls; Done sits
              outside the scroll, pinned to the card's foot. With ≥6 reps the
              content runs ~740dp, more than a 640–760dp budget Android has,
              and a centred non-scrolling card clipped BOTH ends — the only
              dismiss went off-screen with them. */}
          <View style={styles.reportCard}>
            <ScrollView
              style={styles.reportBody}
              contentContainerStyle={styles.reportBodyContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.reportEyebrow}>{personaTheme.shortName} · SET REPORT</Text>

              <View style={styles.reportHero}>
                <HeroNumber value={setReport.avgScore} color={pageAccent.accentText} size={74} />
                <Text style={styles.reportHeroUnit}>/100</Text>
              </View>
              <Text style={styles.reportScoreLabel}>Average quality</Text>
              <Text style={styles.reportGrade}>
                {setReport.avgScore >= 90 ? 'A · Excellent'
                  : setReport.avgScore >= 80 ? 'B · Strong'
                  : setReport.avgScore >= 70 ? 'C · Solid'
                  : setReport.avgScore >= 55 ? 'D · Work on it'
                  : 'Keep grinding'}
              </Text>

              <StatRow style={styles.reportStats}>
                <BigStat value={setReport.reps} label="Reps" size={30} />
                <BigStat
                  value={Number((setReport.avgTempoMs / 1000).toFixed(1))}
                  unit="s"
                  decimals={1}
                  label="Avg tempo"
                  size={30}
                />
                <BigStat
                  value={setReport.bestRep ? Math.round(setReport.bestRep.bottomDeg) : '—'}
                  unit="°"
                  label="Best depth"
                  size={30}
                />
              </StatRow>

              {/* One row per rep: REP n · score · ✓ clean or ! its dominant flaw.
                  A plain list — the card body is the one scroll surface, so a
                  20-rep set scrolls the whole report rather than a list inside it.
                  Each row is one accessibility node: the ✓ is an unlabeled SVG and
                  the ! a bare glyph, so without a label TalkBack read 'REP 3',
                  '71', 'shallow' as fragments and a clean row had no marker at all. */}
              <View style={styles.reportRows}>
                {setReport.data.map((r, i) => (
                  <View key={r.index}>
                    {i > 0 && <Hairline />}
                    <View
                      style={styles.reportRow}
                      accessible
                      accessibilityLabel={`Rep ${r.index}, ${r.score} out of 100, ${r.flaw ?? 'clean'}`}
                    >
                      <Text style={styles.reportRowRep}>REP {r.index}</Text>
                      <Text style={styles.reportRowScore}>{r.score}</Text>
                      {r.flaw ? (
                        <View style={styles.reportRowFlagWrap}>
                          <Text style={[styles.reportRowFlag, { color: tokens.warning }]}>!</Text>
                          <Text style={styles.reportRowFlaw}>{r.flaw}</Text>
                        </View>
                      ) : (
                        <View style={styles.reportRowFlagWrap}>
                          <Check size={13} color={tokens.success} strokeWidth={3} />
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* The coach's one sentence — the same line that was spoken. */}
              {setVerdict && (
                <View style={styles.reportCrown}>
                  <Text style={styles.reportCrownEyebrow}>{claudePersonaLabel}</Text>
                  <Text style={styles.reportCrownText}>{setVerdict}</Text>
                </View>
              )}
            </ScrollView>

            <PressableScale
              style={styles.reportDone}
              onPress={() => { setSetReport(null); setSetVerdict(null); }}
              haptic="medium"
              accessibilityRole="button"
            >
              <Text style={styles.reportDoneText}>Done</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Bold Canvas presentation layer.
 *
 * Two grounds live on this screen. The head + camera stage are DARK in both
 * schemes (a camera feed always is), so everything floating there reads the
 * dark token set; the body below is the themed page. `useThemedStyles` keys on
 * the scheme, so this factory must stay a stable module-level function.
 */
function makeStyles(t: SemanticTokens) {
  // See the component: the video is a dark ground regardless of app scheme.
  const stage = TOKENS.dark;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },

    // ── Permission / no-device gates ─────────────────────────────────────────
    gateBody: { justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
    gateLoading: { justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
    gateLoadingRow: { flexDirection: 'row', gap: 10 },
    gateEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.9,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    gateTitle: {
      fontFamily: Fonts.displayBold, fontSize: 44, lineHeight: 46,
      letterSpacing: -1.98, color: t.text,
    },
    gateText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 23, color: t.textSecondary },
    gateBtn: {
      marginTop: 6, alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 9,
      paddingHorizontal: 24, paddingVertical: 16, borderRadius: 26,
      // Brand emerald is 2.54:1 on white — the deep hairline is what gives the
      // control a legible edge on a light page.
      backgroundColor: t.accent, borderWidth: 1, borderColor: t.accentLine,
    },
    gateBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: t.accentInk,
    },

    // ── Dark head, continuous with the stage ─────────────────────────────────
    head: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingBottom: 14, backgroundColor: t.crown,
    },
    headBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: stage.crownLine,
    },
    // Left-aligned on purpose. The row is [X][title][Technique][flip], so a
    // centred title sat visibly off-centre; a balancing spacer would leave a
    // 360dp phone ~36dp for the exercise name.
    headTitleWrap: { flex: 1, alignItems: 'flex-start' },
    headEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },
    headTitle: {
      fontFamily: Fonts.displayBold, fontSize: 20, letterSpacing: -0.9,
      color: stage.crownText, textAlign: 'left', marginTop: 5,
    },
    // A word, not an icon: "Technique" has no glyph a lifter would read at a
    // glance, and headBtn is a 38px circle that cannot hold one.
    headTextBtn: {
      height: 38, paddingHorizontal: 12, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: stage.crownLine,
    },
    headTextBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownText,
    },

    // ── Camera stage — the hero; every overlay floats, none is boxed ─────────
    stage: { width: '100%', overflow: 'hidden', backgroundColor: t.crown },
    scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 104 },
    // Taller than the old 262: the readout stack (coaching line + FORM hero +
    // rep row) is what the scrim has to keep legible, and borderless type
    // sitting above the gradient would be read against raw video.
    scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 330 },

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

    alignDebug: {
      position: 'absolute', top: 52, left: 14, right: 14,
      borderRadius: 10, padding: 8, backgroundColor: stage.scrim,
    },
    alignDebugText: {
      fontFamily: Fonts.legacyMono, fontSize: 9, lineHeight: 13,
      color: stage.crownAccent, textAlign: 'center',
    },

    stageBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 16 },

    // Borderless floating sheet: a soft dark plate + a 3px state bar, no outline.
    sheet: {
      flexDirection: 'row', alignItems: 'center', gap: 11,
      paddingLeft: 16, paddingRight: 16, paddingVertical: 14,
      borderRadius: 22, backgroundColor: stage.overlay, overflow: 'hidden',
    },
    sheetBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    sheetText: {
      flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 13, lineHeight: 18,
      color: stage.crownText,
    },

    // Re-trigger prompt: the same plate as `sheet`, stacked (title, line,
    // two buttons) instead of a single row.
    retriggerSheet: {
      paddingLeft: 18, paddingRight: 16, paddingVertical: 16, gap: 6,
      borderRadius: 22, backgroundColor: stage.overlay, overflow: 'hidden',
    },
    retriggerTitle: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.9,
      textTransform: 'uppercase', color: stage.warning,
    },
    retriggerText: {
      fontFamily: Fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: stage.crownText,
    },
    retriggerRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    retriggerBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 999,
      alignItems: 'center', justifyContent: 'center',
    },
    retriggerBtnGhost: {
      flex: 1, paddingVertical: 12, borderRadius: 999,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: stage.crownLine,
    },
    retriggerBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 9.5, letterSpacing: 1.8,
      textTransform: 'uppercase', color: stage.crownText,
    },

    // The dramatic pairing: an oversized numeral straight onto an 8px mono
    // label. 36px, not the old 68: the honest FORM readout above it is now the
    // stage's single hero, and two 70px numerals stacked is two heroes.
    repRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    repValue: {
      fontFamily: Fonts.displayBold, fontVariant: ['tabular-nums'],
      fontSize: 36, lineHeight: 37, letterSpacing: -1.62, color: stage.crownText,
    },
    repLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownTextDim, marginTop: 3,
    },
    repAngleCol: { alignItems: 'flex-end', paddingBottom: 3 },
    // Rep phase, straight from the engine's state machine — a word, not a
    // number, so it takes the mono voice rather than the numeral voice.
    repPhaseValue: {
      fontFamily: Fonts.legacyMono, fontSize: 13, letterSpacing: 1.8,
      color: stage.crownText,
    },

    // ── Light body ───────────────────────────────────────────────────────────
    panel: { flex: 1, backgroundColor: t.bg },
    panelContent: { paddingHorizontal: 20, paddingTop: 24 },

    ctaPrimary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      paddingVertical: 17, borderRadius: 26,
      backgroundColor: t.accent, borderWidth: 1, borderColor: t.accentLine,
    },
    ctaPrimaryText: {
      fontFamily: Fonts.legacyMono, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: t.accentInk,
    },

    ctaGhost: {
      marginTop: 10,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      paddingVertical: 16, borderRadius: 26, backgroundColor: t.surfaceAlt,
    },
    ctaGhostText: {
      fontFamily: Fonts.legacyMono, fontSize: 10, letterSpacing: 1.8,
      textTransform: 'uppercase', color: t.text,
    },

    cueBtn: {
      marginTop: 4,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      paddingVertical: 16,
    },
    cueBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 10, letterSpacing: 1.8,
      textTransform: 'uppercase', color: t.textSecondary,
    },

    cueCard: { marginTop: 6, borderRadius: 24, padding: 20, backgroundColor: t.surfaceAlt },
    cueLabel: { fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9, textTransform: 'uppercase' },
    cueText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 24, color: t.text, marginTop: 10 },

    tipRow: { flexDirection: 'row', gap: 14, paddingVertical: 13, alignItems: 'flex-start' },
    tipPhase: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.5,
      textTransform: 'uppercase', color: t.textTertiary, minWidth: 30, marginTop: 5,
    },
    tipText: { flex: 1, fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 22, color: t.text },

    mistakeRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, alignItems: 'flex-start' },
    mistakeIcon: { marginTop: 4 },

    breathCard: { marginTop: 30, borderRadius: 24, padding: 20, backgroundColor: t.surfaceAlt },
    breathLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    breathText: { fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 22, color: t.text, marginTop: 9 },

    disclaimer: {
      fontFamily: Fonts.body, fontSize: 11.5, lineHeight: 18,
      color: t.textTertiary, textAlign: 'center', marginTop: 34,
    },

    // ── End-of-set report card ───────────────────────────────────────────────
    reportOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center', padding: 22,
      backgroundColor: t.scrim,
    },
    reportCard: {
      // Bounded to the overlay's inner height so the body ScrollView (flexShrink)
      // gives way on short phones instead of the card overflowing the screen.
      width: '100%', maxWidth: 380, maxHeight: '100%', borderRadius: 30, padding: 26,
      backgroundColor: t.surface,
      // Depth from shadow, never an outline.
      shadowColor: t.crown, shadowOpacity: 0.24, shadowRadius: 34,
      shadowOffset: { width: 0, height: 18 }, elevation: 16,
    },
    // The scrolling body. flexGrow 0 keeps a short card content-sized; flexShrink
    // 1 is what lets it yield to the maxHeight above. Done lives OUTSIDE it.
    reportBody: { flexGrow: 0, flexShrink: 1 },
    reportBodyContent: { paddingBottom: 2 },
    reportEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    reportHero: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 18 },
    reportHeroUnit: { fontFamily: Fonts.bodySemi, fontSize: 13, color: t.textTertiary, paddingBottom: 11 },
    reportScoreLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.6,
      textTransform: 'uppercase', color: t.textTertiary, marginTop: 7,
    },
    reportGrade: {
      fontFamily: Fonts.displayBold, fontSize: 21, letterSpacing: -0.75,
      color: t.text, marginTop: 14,
    },
    reportStats: { marginTop: 26 },
    // Per-rep rows. No cap: the card body scrolls as one surface (see reportBody).
    reportRows: { marginTop: 22 },
    reportRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
    reportRowRep: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.6,
      textTransform: 'uppercase', color: t.textTertiary, minWidth: 44,
    },
    reportRowScore: {
      fontFamily: Fonts.displayBold, fontVariant: ['tabular-nums'], fontSize: 17,
      letterSpacing: -0.5, color: t.text, minWidth: 34,
    },
    reportRowFlagWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
    reportRowFlag: { fontFamily: Fonts.displayBold, fontSize: 15, lineHeight: 18 },
    reportRowFlaw: {
      fontFamily: Fonts.body, fontSize: 13.5, color: t.textSecondary,
      textTransform: 'capitalize',
    },
    // The coach's sentence in a dark crown block — the one place on the card
    // that speaks in a voice rather than a number.
    reportCrown: { marginTop: 18, borderRadius: 20, padding: 18, backgroundColor: t.crown },
    reportCrownEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: t.crownTextDim,
    },
    reportCrownText: {
      fontFamily: Fonts.bodyMedium, fontSize: 14.5, lineHeight: 22,
      color: t.crownText, marginTop: 8,
    },
    // Plain sentence for the 0-rep card (no capitalize: it is a sentence).
    reportSentence: {
      fontFamily: Fonts.body, fontSize: 14, lineHeight: 21, color: t.textSecondary, marginTop: 14,
    },
    // Neutral ink fill — the emerald is already spent on the hero numeral.
    reportDone: {
      marginTop: 26, paddingVertical: 17, borderRadius: 26,
      alignItems: 'center', backgroundColor: t.text,
    },
    reportDoneText: {
      fontFamily: Fonts.legacyMono, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: t.bg,
    },
  });
}
