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
 *     (cover-fit + front-camera mirror) → targetKpts → analysis + SVG draw.
 *
 * MLKit returns positions in the UPRIGHT image pixel space; we pass frame
 * width/height from the worklet and cover-fit them onto the camera view.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import Svg, { Circle, Line } from 'react-native-svg';
import { useRunOnJS } from 'react-native-worklets-core';
import { Colors, Spacing, Fonts } from '@/constants/theme';
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { getExerciseForm, getCoachCue, type ExerciseForm } from '@/constants/exerciseFormLibrary';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { canAccess } from '@/lib/featureGates';
import {
  X as XIcon, RefreshCw, AlertTriangle, Check, Pause, Loader, Video, Sparkles,
  Camera as CameraIcon,
} from 'lucide-react-native';

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

const DETECTION_INTERVAL_MS = 150;   // ~6.5 fps inference target
const RENDER_INTERVAL_MS    = 16;    // ~60 fps render/interpolation
const INTERP_SPEED          = 0.30;  // 0..1 — lower = smoother (and filters jitter)
const MODEL_INPUT_SIZE      = 256;   // BlazePose expects 256×256
const NUM_LANDMARKS         = 33;    // BlazePose body landmarks
const CONFIDENCE_THRESHOLD  = 0.30;
const MIN_VISIBLE_JOINTS    = 10;    // of 33 — need a credible body in frame
const CUE_COOLDOWN_MS       = 5_000;

// ── Stability tuning ─────────────────────────────────────────────────────────
const ANGLE_DEADBAND_DEG    = 5;     // angle must cross threshold by this much to flag
const ISSUE_HISTORY_LEN     = 3;     // rolling window size
const ISSUE_REQUIRED_HITS   = 2;     // issue must appear in N of last frames to fire

// ── Motion detection ─────────────────────────────────────────────────────────
const MOTION_HISTORY_LEN     = 12;    // ~1.8s at 6.5fps — longer averaging = less flapping
// px the SINGLE most-moving load-bearing joint must travel across the window for
// us to call it "exercising". Measured on the One-Euro-SMOOTHED history (jitter
// floor ~10px), so a real rep's moving joint (40-200px) clears it easily while
// standing still does not. (Was an AVERAGE of 6 joints @32px, which diluted any
// exercise that moves only a subset of joints — curls/presses — below threshold.)
const MOTION_PX_THRESHOLD    = 28;
const MOTION_HYSTERESIS_HITS = 2;     // need N consecutive frames of new state to flip

const PERSONA_LABELS: Record<string, string> = {
  cbum:        'THE SCULPTOR SAYS',
  arnold:      'THE GOVERNOR SAYS',
  nippard:     'THE SCIENTIST SAYS',
  ct_fletcher: 'THE COMMANDER SAYS',
  dr_mike:     'DR. GROWTH SAYS',
};

// BlazePose 33-landmark index map. The analysis code references these by name,
// so swapping the indices here automatically re-points angle checks, motion
// detection, visibility, etc. to the BlazePose layout.
const KP = {
  nose: 0,
  l_eye: 2, r_eye: 5,        // (BlazePose has inner/center/outer; use center)
  l_ear: 7, r_ear: 8,
  mouth_l: 9, mouth_r: 10,
  l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13,    r_elbow: 14,
  l_wrist: 15,    r_wrist: 16,
  l_pinky: 17,    r_pinky: 18,
  l_index: 19,    r_index: 20,
  l_thumb: 21,    r_thumb: 22,
  l_hip: 23,      r_hip: 24,
  l_knee: 25,     r_knee: 26,
  l_ankle: 27,    r_ankle: 28,
  l_heel: 29,     r_heel: 30,
  l_foot: 31,     r_foot: 32,
};

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

interface FormAnalysis {
  issues: string[];
  badJoints: Set<string>;
  status: 'GOOD' | 'WARNING' | 'BAD' | 'OUT' | 'STANDBY' | 'NO_VIEW' | 'UNSAFE';
  /** V2 §7 safety layer: if true, we can't see the user well enough to coach */
  visibilityLow?: boolean;
  /** V2 §7 safety layer: human-readable safety message that overrides coaching cues */
  safetyMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 §7 — SAFETY LAYER for the Form Coach
//
// Principle: an inaccurate form coach is WORSE than no form coach. Before
// emitting any coaching cue, verify the pose is actually visible and
// credible. If not, surface a "reposition / can't see" message instead of
// pretending to know what's happening.
//
// Also: never coach near-1RM efforts. If the angles look like a true max
// attempt (slow grind, partial range), back off and tell the user we won't
// coach maxes — they should have a real spotter.
// ─────────────────────────────────────────────────────────────────────────────

// A joint counts as "visible" if MoveNet confidence is above this threshold.
const VISIBILITY_THRESHOLD = 0.35;
// We need this many of the load-bearing joints visible to trust the analysis.
const MIN_VISIBLE_LOAD_JOINTS = 4; // out of 6 (l/r: hip, knee, ankle for legs OR shoulder, elbow, wrist for upper)

function evaluateVisibility(kpts: Kpt[], category: string | undefined): {
  visibilityLow: boolean;
  reason: string;
} {
  // Use whichever joint set the exercise category cares about
  const upperJoints = [KP.l_shoulder, KP.r_shoulder, KP.l_elbow, KP.r_elbow, KP.l_wrist, KP.r_wrist];
  const lowerJoints = [KP.l_hip, KP.r_hip, KP.l_knee, KP.r_knee, KP.l_ankle, KP.r_ankle];
  const watch = category === 'squat' || category === 'deadlift' || category === 'lunge'
    ? lowerJoints
    : category === 'press' || category === 'pull' || category === 'curl'
      ? upperJoints
      : [...upperJoints.slice(0, 2), ...lowerJoints.slice(0, 4)]; // hybrid fallback

  let visibleCount = 0;
  let avgConf = 0;
  for (const idx of watch) {
    const conf = kpts[idx]?.[2] ?? 0;
    avgConf += conf;
    if (conf >= VISIBILITY_THRESHOLD) visibleCount += 1;
  }
  avgConf /= watch.length;

  if (visibleCount < MIN_VISIBLE_LOAD_JOINTS) {
    return {
      visibilityLow: true,
      reason: visibleCount === 0
        ? "Can't see you. Step into frame."
        : `Only ${visibleCount} of ${watch.length} joints visible — reposition phone or step back.`,
    };
  }
  if (avgConf < 0.45) {
    return {
      visibilityLow: true,
      reason: 'Low light or motion blur — pause, brighten the area, then resume.',
    };
  }
  return { visibilityLow: false, reason: '' };
}

/**
 * Heuristic for "looks like a true max attempt" — we refuse to coach these.
 * Signals: very slow tempo (no significant motion across 12 frames = grinding rep)
 * combined with bar-path indicators (significant horizontal hip drift).
 * Returns true if we should hand control back to the user with a safety message.
 */
function looksLikeMaxAttempt(history: Kpt[][], category: string | undefined): boolean {
  if (category !== 'squat' && category !== 'deadlift') return false;
  if (history.length < 12) return false;

  // Measure hip vertical displacement over last 12 frames
  const recent = history.slice(-12);
  const hipYs: number[] = [];
  for (const frame of recent) {
    const lh = frame[KP.l_hip]; const rh = frame[KP.r_hip];
    if (!lh || !rh) continue;
    const y = (lh[1] + rh[1]) / 2;
    if (!isNaN(y)) hipYs.push(y);
  }
  if (hipYs.length < 6) return false;

  const range = Math.max(...hipYs) - Math.min(...hipYs);
  // < 6 px hip travel over 2 seconds during squat/deadlift = stuck / grinding rep
  // (in a true max grind, the user is fighting and barely moving)
  return range < 6;
}

/**
 * Detect whether the person is actually moving across the last N detections.
 *
 * We look at the SINGLE most-moving load-bearing joint, not the average. Every
 * exercise moves a different subset of joints — a curl moves the wrists/elbows
 * while the torso stays put; a squat moves hips/knees. Averaging across all
 * joints diluted the one that's actually moving below the threshold (especially
 * on slow reps), so the coach sat in STANDBY mid-set. Taking the MAX means "is
 * ANY key joint travelling like a rep?" — which is what we actually care about.
 */
function detectMotion(history: Kpt[][]): boolean {
  if (history.length < 2) return false;
  // Broad set: whichever limb the exercise drives, its joint will spike.
  const KEY = [
    KP.l_shoulder, KP.r_shoulder, KP.l_elbow, KP.r_elbow, KP.l_wrist, KP.r_wrist,
    KP.l_hip, KP.r_hip, KP.l_knee, KP.r_knee, KP.l_ankle, KP.r_ankle,
  ];
  let maxRange = 0;
  for (const idx of KEY) {
    // Max-vs-min spread across the window for this joint — captures peak motion,
    // not just first-vs-last (which a full rep ending where it started would miss).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let validFrames = 0;
    for (const frame of history) {
      const [x, y, c] = frame[idx];
      if (c < CONFIDENCE_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      validFrames++;
    }
    if (validFrames < 3) continue;
    const range = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    if (range > maxRange) maxRange = range;
  }
  // Evidence: actual motion px vs threshold (visible via `adb logcat | grep pose`).
  poseLog('motionMax=' + Math.round(maxRange) + 'px need>' + MOTION_PX_THRESHOLD);
  return maxRange > MOTION_PX_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function programIdToPersona(programId: string): string {
  if (programId.startsWith('cbum'))        return 'cbum';
  if (programId.startsWith('arnold'))      return 'arnold';
  if (programId.startsWith('nippard'))     return 'nippard';
  if (programId.startsWith('ct_fletcher')) return 'ct_fletcher';
  if (programId.startsWith('dr_mike'))     return 'dr_mike';
  return 'cbum';
}

function getTipsForExercise(exerciseName: string): string[] {
  for (const group of EXERCISE_LIBRARY) {
    const ex = group.exercises.find(
      (e) => e.name.toLowerCase() === exerciseName?.toLowerCase()
    );
    if (ex) return ex.tips;
  }
  return ['Focus on controlled tempo.', 'Mind-muscle connection is key.'];
}

function jointAngle(kpts: Kpt[], a: number, b: number, c: number): number | null {
  const [ax, ay, ca] = kpts[a];
  const [bx, by, cb] = kpts[b];
  const [cx, cy, cc] = kpts[c];
  if (ca < CONFIDENCE_THRESHOLD || cb < CONFIDENCE_THRESHOLD || cc < CONFIDENCE_THRESHOLD) return null;
  const rad = Math.atan2(cy - by, cx - bx) - Math.atan2(ay - by, ax - bx);
  let deg = Math.abs(rad * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
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
    const dt = Math.max(0.001, (time - this.prevTime) / 1000);
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
  private filters: OneEuro[][] = Array.from({ length: NUM_LANDMARKS }, () => [
    new OneEuro(0.25, 0.012),  // x — heavy smoothing at rest
    new OneEuro(0.25, 0.012),  // y
  ]);
  smooth(kpts: Kpt[]): Kpt[] {
    const t = Date.now();
    return kpts.map(([x, y, c], i) => [
      this.filters[i][0].filter(x, t),
      this.filters[i][1].filter(y, t),
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

function analyzeForm(form: ExerciseForm | null, kpts: Kpt[], history?: Kpt[][]): FormAnalysis {
  // ── V2 §7 SAFETY LAYER · Step 1: visibility check ──
  // If we can't actually SEE the user well enough, do NOT emit any coaching
  // cues. Saying "deeper!" when the camera can't see the user is theater
  // at best, dangerous at worst. Surface a reposition prompt instead.
  const vis = evaluateVisibility(kpts, form?.category);
  if (vis.visibilityLow) {
    return {
      issues: [vis.reason],
      badJoints: new Set(),
      status: 'NO_VIEW',
      visibilityLow: true,
      safetyMessage: vis.reason,
    };
  }

  // ── V2 §7 SAFETY LAYER · Step 2: max-attempt refusal ──
  // If the rep tempo + posture indicates a near-1RM grind, we refuse to
  // coach. A spotter is required for true maxes; we won't pretend.
  if (history && looksLikeMaxAttempt(history, form?.category)) {
    return {
      issues: ['Looks like a near-max rep. Use a spotter — form-coach off.'],
      badJoints: new Set(),
      status: 'UNSAFE',
      safetyMessage: 'Near-max rep detected — form coach won\'t cue. Use a spotter.',
    };
  }

  const issues: string[] = [];
  const badJoints = new Set<string>();
  const angles: Record<string, number | null> = {
    left_knee:   jointAngle(kpts, KP.l_hip,      KP.l_knee,  KP.l_ankle),
    right_knee:  jointAngle(kpts, KP.r_hip,      KP.r_knee,  KP.r_ankle),
    left_hip:    jointAngle(kpts, KP.l_shoulder, KP.l_hip,   KP.l_knee),
    right_hip:   jointAngle(kpts, KP.r_shoulder, KP.r_hip,   KP.r_knee),
    left_elbow:  jointAngle(kpts, KP.l_shoulder, KP.l_elbow, KP.l_wrist),
    right_elbow: jointAngle(kpts, KP.r_shoulder, KP.r_elbow, KP.r_wrist),
  };
  if (form) {
    for (const check of form.angleChecks) {
      const deg = angles[check.joint];
      if (deg == null) continue;
      // Deadband: angle must cross the threshold by ANGLE_DEADBAND_DEG to flag.
      // Prevents the banner from flapping when you're hovering near the limit.
      if (deg < check.minDeg - ANGLE_DEADBAND_DEG) {
        issues.push(check.tooLowMsg);
        badJoints.add(check.joint);
      } else if (deg > check.maxDeg + ANGLE_DEADBAND_DEG) {
        issues.push(check.tooHighMsg);
        badJoints.add(check.joint);
      }
    }
    if (form.category === 'squat') {
      // Knee cave needs a bigger gap too — 18px instead of 12px — same noise-floor reasoning
      const lCave = kpts[KP.l_knee][2] > CONFIDENCE_THRESHOLD && kpts[KP.l_hip][2] > CONFIDENCE_THRESHOLD && kpts[KP.l_knee][0] > kpts[KP.l_hip][0] + 18;
      const rCave = kpts[KP.r_knee][2] > CONFIDENCE_THRESHOLD && kpts[KP.r_hip][2] > CONFIDENCE_THRESHOLD && kpts[KP.r_knee][0] < kpts[KP.r_hip][0] - 18;
      if (lCave || rCave) {
        issues.push('KNEES CAVING IN — drive knees out over toes');
        if (lCave) badJoints.add('left_knee');
        if (rCave) badJoints.add('right_knee');
      }
    }
  }
  const status: FormAnalysis['status'] =
    issues.length === 0 ? 'GOOD' : issues.length === 1 ? 'WARNING' : 'BAD';
  return { issues, badJoints, status };
}

// Throttled debug logger (visible via `adb logcat | grep pose`).
// Logs ~1 in 4 calls so it doesn't spam. Safe to leave — cheap, dev-only signal.
let _poseLogN = 0;
function poseLog(msg: string) {
  if (_poseLogN++ % 4 === 0) console.log('[pose]', msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FormCoach() {
  const router = useRouter();
  const { exerciseName, persona: personaParam } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
  }>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cameraHeight = Math.round(screenHeight * 0.62);

  const persona            = programIdToPersona(personaParam ?? 'cbum_evolved');
  const claudePersonaLabel = PERSONA_LABELS[persona] ?? 'COACH SAYS';

  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    if (!canAccess('ai_form_coach')) {
      router.replace('/paywall?feature=ai_form_coach' as any);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const detectingRef   = useRef(false);
  // One-Euro smoother — applied to RAW keypoints before they become target.
  // Kills the ±2-3px MoveNet jitter on a still body.
  const smootherRef = useRef(new KeypointSmoother());
  // Rolling window of recent issue-sets for temporal hysteresis.
  // An issue only fires if it appears in >= ISSUE_REQUIRED_HITS of last frames.
  const issueHistoryRef = useRef<Set<string>[]>([]);
  // Rolling window of recent keypoint frames — used for motion detection.
  // "Form solid" should never fire if the person isn't actually moving.
  const kptsHistoryRef = useRef<Kpt[][]>([]);
  // Motion-gate hysteresis: tracks how many recent evaluations agree on the
  // new state before we actually flip. Prevents single-frame flapping.
  const motionStateRef    = useRef<'moving' | 'still'>('still');
  const motionPendingRef  = useRef<{ state: 'moving' | 'still'; count: number }>({ state: 'still', count: 0 });

  const formLibraryData    = useMemo(() => getExerciseForm(exerciseName ?? ''), [exerciseName]);
  const libraryCheckpoints = formLibraryData?.checkpoints ?? [];
  const libraryMistakes    = formLibraryData?.commonMistakes ?? [];
  const libraryBreathing   = formLibraryData?.breathingCue ?? null;
  const tips = formLibraryData ? [] : getTipsForExercise(exerciseName ?? '');

  // Voice cues — coach speaks form issues as they're confirmed
  const voice = useVoiceCues();

  // Track the last issue spoken so we don't repeat it every analysis tick.
  // Built-in cooldown in voiceCues.ts (10s for same cue) prevents spam,
  // but this also ensures a NEW issue is announced quickly even if a
  // previous issue is in cooldown.
  const lastSpokenIssueRef = useRef<string>('');

  // Form analysis runs against the LATEST DETECTION (not interpolated frame)
  // — we want truth, not animation. Re-runs each time targetKpts changes,
  // which we trigger via a tick counter.
  // Plus: temporal hysteresis — an issue is only "real" if it shows up in
  // >= ISSUE_REQUIRED_HITS of the last ISSUE_HISTORY_LEN detections. Prevents
  // single-frame noise from flipping the banner from OK → BAD.
  const [analysisTick, setAnalysisTick] = useState(0);
  // Rolling keypoint history for max-attempt detection (V2 §7 safety layer)
  const kptHistoryRef = useRef<Kpt[][]>([]);
  const KPT_HISTORY_MAX = 18;
  const formAnalysis: FormAnalysis = useMemo(() => {
    const t = targetKptsRef.current;
    if (!t) {
      issueHistoryRef.current = []; // reset when person leaves frame
      kptHistoryRef.current = [];
      return { issues: [], badJoints: new Set(), status: 'OUT' };
    }
    // Push current frame into rolling history (for safety heuristics)
    kptHistoryRef.current.push(t);
    if (kptHistoryRef.current.length > KPT_HISTORY_MAX) kptHistoryRef.current.shift();
    const instant = analyzeForm(formLibraryData, t, kptHistoryRef.current);

    // Safety first: if we can't actually SEE the user well enough (or it looks
    // like a max attempt), surface THAT and never fall through to "form looks
    // solid". This is what stops the coach approving form it can't even see.
    if (instant.status === 'NO_VIEW' || instant.status === 'UNSAFE') {
      issueHistoryRef.current = [];
      return {
        issues: instant.issues, badJoints: new Set(),
        status: instant.status, safetyMessage: instant.safetyMessage,
      };
    }

    // Push the latest issue-set into the rolling window
    const issueSet = new Set(instant.issues);
    issueHistoryRef.current.push(issueSet);
    if (issueHistoryRef.current.length > ISSUE_HISTORY_LEN) {
      issueHistoryRef.current.shift();
    }

    // Count how many recent frames each candidate issue appeared in
    const counts = new Map<string, number>();
    for (const set of issueHistoryRef.current) {
      for (const issue of set) counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }

    // Keep only issues that crossed the hits threshold
    const stableIssues = Array.from(counts.entries())
      .filter(([, n]) => n >= ISSUE_REQUIRED_HITS)
      .map(([issue]) => issue);

    // For bad-joint coloring: re-derive from the stable issues
    // Map known issue prefixes back to joint names — keep it simple
    const stableBadJoints = new Set<string>();
    for (const issue of stableIssues) {
      const u = issue.toUpperCase();
      if (u.includes('KNEE'))  { stableBadJoints.add('left_knee');  stableBadJoints.add('right_knee'); }
      if (u.includes('HIP') || u.includes('CHEST') || u.includes('BACK') || u.includes('SWING'))
                               { stableBadJoints.add('left_hip');   stableBadJoints.add('right_hip'); }
      if (u.includes('ELBOW') || u.includes('CURL') || u.includes('PRESS') || u.includes('ROM'))
                               { stableBadJoints.add('left_elbow'); stableBadJoints.add('right_elbow'); }
    }

    // ── Motion gate with hysteresis: a single noisy frame can no longer
    // flip GOOD↔STANDBY. We require MOTION_HYSTERESIS_HITS consecutive
    // evaluations of the new state before committing the flip.
    const instantMoving = detectMotion(kptsHistoryRef.current);
    const instantState: 'moving' | 'still' = instantMoving ? 'moving' : 'still';
    if (instantState === motionPendingRef.current.state) {
      motionPendingRef.current.count++;
    } else {
      motionPendingRef.current = { state: instantState, count: 1 };
    }
    if (
      motionPendingRef.current.count >= MOTION_HYSTERESIS_HITS &&
      motionPendingRef.current.state !== motionStateRef.current
    ) {
      motionStateRef.current = motionPendingRef.current.state;
    }
    const moving = motionStateRef.current === 'moving';

    // ── Only COACH during an actual rep ──────────────────────────────────────
    // If the user is just standing / holding the phone (not moving), do NOT emit
    // form cues — otherwise the coach "shouts" things like "elbows too narrow"
    // when they aren't even doing the exercise. Show STANDBY and stay quiet.
    if (!moving) {
      return { issues: [], badJoints: new Set(), status: 'STANDBY' };
    }

    const status: FormAnalysis['status'] =
      stableIssues.length === 0 ? 'GOOD'
      : stableIssues.length === 1 ? 'WARNING'
      : 'BAD';

    return { issues: stableIssues, badJoints: stableBadJoints, status };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTick, formLibraryData]);

  // Side-effect: speak the top issue when it changes.
  // Strip persona-specific punctuation to keep TTS clean.
  useEffect(() => {
    const topIssue = formAnalysis.issues[0] ?? '';
    if (!topIssue) {
      // Not actively coaching (STANDBY / no person / between reps) → SILENCE any
      // ongoing or queued speech immediately. We deliberately KEEP
      // lastSpokenIssueRef so a brief motion flicker back to the same cue doesn't
      // re-trigger it (that was the "voice won't stop repeating" bug).
      voice.stop();
      return;
    }
    // Use the part BEFORE the "—" as the spoken phrase (short + clear)
    const phrase = topIssue.split('—')[0].trim();
    if (phrase && phrase !== lastSpokenIssueRef.current) {
      lastSpokenIssueRef.current = phrase;
      voice.cue('form_issue', { issue: phrase });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formAnalysis.issues[0]]);

  // Stop any speech when the user leaves the form coach screen
  useEffect(() => {
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MLKit pose result handler (runs on the JS thread via useRunOnJS) ────────
  // MLKit returns named landmark positions in UPRIGHT image-pixel space, and
  // ONLY when its detector sees a real body (empty object otherwise → no
  // hallucination). We map coords to the camera view (cover-fit + front mirror),
  // build the 33-index Kpt array, then feed the SAME analysis + smoothing.
  const mirrorFront = facing === 'front';
  const handlePose = useCallback((data: any, frameW: number, frameH: number, mirror: boolean) => {
    const nose = data?.nosePosition;
    // DIAGNOSTIC: frame dims + raw MLKit coords (nose + ankle) so we can see the
    // exact coordinate space MLKit returns and compute the correct mapping.
    const la = data?.leftAnklePosition;
    poseLog(
      'f=' + frameW + 'x' + frameH +
      ' noseRaw=' + (nose ? Math.round(nose.x) + ',' + Math.round(nose.y) : '-') +
      ' ankleRaw=' + (la ? Math.round(la.x) + ',' + Math.round(la.y) : '-'),
    );
    // No person detected → blank the skeleton and stay silent.
    if (!data || !nose || (nose.x === 0 && nose.y === 0)) {
      targetKptsRef.current = null;
      kptsHistoryRef.current = [];
      setAnalysisTick((t) => t + 1);
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
      // Only count joints actually WITHIN the camera frame. MLKit ESTIMATES
      // off-screen joints (e.g. your legs when the phone is at face height) with
      // coordinates outside the image — counting those as "visible" made the coach
      // say "form looks solid" when it couldn't even see your lower body. Reject
      // anything outside the frame so the visibility gate is honest.
      const inFrame = p.x > 0 && p.y > 0 && p.x <= imgW && p.y <= imgH;
      let sx = p.x * scale + offX;
      const sy = p.y * scale + offY;
      if (mirror) sx = viewW - sx;
      raw[MLKIT_TO_INDEX[name]] = [sx, sy, inFrame ? 1 : 0];
    }

    // ── REJECT non-real "humans" ───────────────────────────────────────────
    // MLKit also detects human shapes in PHOTOS / SCREENS / POSTERS in view —
    // those appear small & clustered. A real person doing an exercise fills a
    // large vertical span of the frame. So require the pose's bounding box to be
    // tall enough; otherwise it's a picture-of-a-person, not a person.
    let minY = Infinity, maxY = -Infinity;
    for (const k of raw) {
      if (k[2] > 0) { if (k[1] < minY) minY = k[1]; if (k[1] > maxY) maxY = k[1]; }
    }
    const bboxH = maxY - minY;
    const minBodyH = viewH * 0.45;   // body must span ≥45% of the camera view
    const visible = raw.filter(([, , c]) => c > 0).length;
    poseLog('lm=' + visible + '/33 bboxH=' + Math.round(bboxH) + ' need>' + Math.round(minBodyH));

    if (visible < 12 || bboxH < minBodyH) {
      // Too few joints or too small → not a real person in frame. Blank + quiet.
      targetKptsRef.current = null;
      kptsHistoryRef.current = [];
      setAnalysisTick((t) => t + 1);
      return;
    }

    const smoothed = smootherRef.current.smooth(raw);
    targetKptsRef.current = smoothed;
    kptsHistoryRef.current.push(smoothed);
    if (kptsHistoryRef.current.length > MOTION_HISTORY_LEN) kptsHistoryRef.current.shift();
    setAnalysisTick((t) => t + 1);
  }, [screenWidth, cameraHeight]);

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
      const data = detectPose(frame, { mode: 'stream', performanceMode: 'max' });
      onPoseJS(data, frame.width, frame.height, mirrorFront);
    } catch (e: any) {
      onPluginErrorJS(String(e?.message ?? e));
    }
  }, [onPoseJS, onPluginErrorJS, mirrorFront]);

  // ── Render loop (60fps interpolation) ──────────────────────────────────────
  // Smoothly glides displayKpts toward targetKptsRef.current. Even though
  // detection is at 6fps, the visible skeleton moves at 60fps.
  useEffect(() => {
    const id = setInterval(() => {
      const target = targetKptsRef.current;
      if (!target) {
        if (displayKpts !== null) setDisplayKpts(null);
        return;
      }
      setDisplayKpts((curr) => {
        if (!curr) return target;          // first detection — snap to position
        return lerpKpts(curr, target, INTERP_SPEED);
      });
    }, RENDER_INTERVAL_MS);
    return () => clearInterval(id);
    // We intentionally don't depend on displayKpts — the interval reads
    // targetKptsRef.current directly and uses functional setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Coach cue (instant — local library) ───────────────────────────────────
  const [aiFeedback, setAiFeedback]     = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const lastCallAt    = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGetCoachCue = useCallback(() => {
    if (Date.now() - lastCallAt.current < CUE_COOLDOWN_MS) return;
    lastCallAt.current = Date.now();
    const form = getExerciseForm(exerciseName ?? '');
    const cue = form ? getCoachCue(form, persona) : 'Focus on controlled tempo and full range of motion.';
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
  }, [exerciseName, persona]);

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  const canCallCue = Date.now() - lastCallAt.current >= CUE_COOLDOWN_MS;

  const jointNameByIdx: Record<number, string> = {
    [KP.l_knee]: 'left_knee',  [KP.r_knee]: 'right_knee',
    [KP.l_hip]: 'left_hip',    [KP.r_hip]: 'right_hip',
    [KP.l_elbow]: 'left_elbow',[KP.r_elbow]: 'right_elbow',
  };
  const lineColor = (a: number, b: number): string => {
    const an = jointNameByIdx[a]; const bn = jointNameByIdx[b];
    if ((an && formAnalysis.badJoints.has(an)) || (bn && formAnalysis.badJoints.has(bn))) return '#ef4444';
    if (formAnalysis.status === 'WARNING') return '#facc15';
    return Colors.primary;
  };
  const jointColor = (idx: number): string => {
    const name = jointNameByIdx[idx];
    if (name && formAnalysis.badJoints.has(name)) return '#ef4444';
    return Colors.primary;
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permissionText}>Camera access is required for live form coaching.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>GRANT CAMERA ACCESS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (!device) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={[styles.permissionText, { marginTop: 12 }]}>Loading camera…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isTracking   = displayKpts !== null;
  const modelLoading = modelState === 'loading';
  const modelError   = modelState === 'error';
  const statusLabel  =
    modelError                            ? '⬤ MODEL ERROR' :
    modelLoading                          ? '⬤ LOADING AI…' :
    isTracking && formAnalysis.status === 'NO_VIEW' ? '⬤ CAN\'T SEE YOU' :
    isTracking && formAnalysis.status === 'UNSAFE'  ? '⬤ SPOTTER NEEDED' :
    isTracking && formAnalysis.status === 'STANDBY' ? '⬤ STANDBY · WAITING' :
    isTracking                            ? '⬤ LIVE · 60FPS SMOOTH' :
                                            '⬤ STEP INTO FRAME';
  const statusColor =
    modelError                            ? '#ef4444' :
    isTracking && (formAnalysis.status === 'NO_VIEW' || formAnalysis.status === 'UNSAFE') ? '#facc15' :
    isTracking && formAnalysis.status === 'STANDBY' ? '#facc15' :
    isTracking                            ? Colors.primary :
                                            '#9ca3af';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <XIcon size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{exerciseName ?? 'Form Coach'}</Text>
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <RefreshCw size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.cameraContainer, { height: cameraHeight }]}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
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
                const [ax, ay, ca] = displayKpts[a];
                const [bx, by, cb] = displayKpts[b];
                if (ca < CONFIDENCE_THRESHOLD || cb < CONFIDENCE_THRESHOLD) return null;
                return (
                  <Line
                    key={`l-${i}`}
                    x1={ax} y1={ay} x2={bx} y2={by}
                    stroke={lineColor(a, b)}
                    strokeWidth={3}
                    strokeOpacity={0.9}
                    strokeLinecap="round"
                  />
                );
              })}
              {DRAW_POINTS.map((i) => {
                const [cx, cy, conf] = displayKpts[i];
                if (conf < CONFIDENCE_THRESHOLD) return null;
                // Curated ~27 BlazePose joints (nose, ears, shoulders, elbows,
                // wrists, hands, hips, knees, ankles, heels, feet). Face points
                // get a smaller radius so they don't crowd the body joints.
                const isFace = FACE_POINTS.has(i);
                return (
                  <Circle
                    key={`k-${i}`}
                    cx={cx} cy={cy} r={isFace ? 4 : 6}
                    fill={jointColor(i)} fillOpacity={isFace ? 0.85 : 0.95}
                    stroke="#000" strokeWidth={1.5}
                  />
                );
              })}
            </>
          )}
        </Svg>

        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {isTracking && formAnalysis.issues.length > 0 && (
          <View style={[styles.formBanner, styles.formBannerBad]}>
            <AlertTriangle size={14} color="#fff" />
            <Text style={styles.formBannerText}>{formAnalysis.issues[0]}</Text>
          </View>
        )}
        {isTracking && formAnalysis.issues.length === 0 && formAnalysis.status === 'GOOD' && (
          <View style={[styles.formBanner, styles.formBannerGood]}>
            <Check size={14} color="#fff" strokeWidth={3} />
            <Text style={styles.formBannerText}>Form looks solid — keep going</Text>
          </View>
        )}
        {isTracking && formAnalysis.status === 'STANDBY' && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <Pause size={14} color="#fff" />
            <Text style={styles.formBannerText}>Standby — start your set to begin form check</Text>
          </View>
        )}
        {!isTracking && !modelLoading && !modelError && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <CameraIcon size={14} color="#fff" />
            <Text style={styles.formBannerText}>Step into frame — full body visible</Text>
          </View>
        )}
        {modelLoading && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <Loader size={14} color="#fff" />
            <Text style={styles.formBannerText}>Loading pose model…</Text>
          </View>
        )}
        {modelError && (
          <View style={[styles.formBanner, styles.formBannerBad, { maxWidth: '85%' }]}>
            <AlertTriangle size={14} color="#fff" />
            <Text style={styles.formBannerText} numberOfLines={3}>
              {modelErrorMsg ?? 'Pose model failed to load.'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.feedbackPanel} contentContainerStyle={styles.feedbackContent}>
        {canAccess('video_review') && (
          <TouchableOpacity
            style={{
              backgroundColor: Colors.primary, borderRadius: 100,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 10,
            }}
            onPress={() => router.push('/video-review' as any)}
          >
            <Video size={14} color={Colors.bg} />
            <Text style={{ fontFamily: Fonts.displayMedium, fontSize: 13, color: Colors.bg, letterSpacing: 0.2 }}>
              Record & review
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.cueBtn, !canCallCue && styles.cueBtnDisabled]}
          onPress={handleGetCoachCue}
          disabled={!canCallCue}
          activeOpacity={0.85}
        >
          <Sparkles size={14} color={Colors.primary} />
          <Text style={styles.cueBtnText}>
            {cooldownLeft > 0
              ? `Ask ${claudePersonaLabel.split(' ')[0]} again (${cooldownLeft}s)`
              : `Ask ${claudePersonaLabel.split(' ')[0]} for a cue`}
          </Text>
        </TouchableOpacity>

        {aiFeedback && (
          <View style={styles.cueCard}>
            <View style={styles.cueLabelRow}>
              <Sparkles size={12} color={Colors.primary} />
              <Text style={styles.cueLabel}>{claudePersonaLabel}</Text>
            </View>
            <Text style={styles.cueText}>{aiFeedback}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Form cues — {exerciseName ?? ''}</Text>
        {libraryCheckpoints.length > 0
          ? libraryCheckpoints.map((cp, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipPhase}>{cp.phase.slice(0, 3)}</Text>
                <Text style={styles.tipText}>{cp.description}</Text>
              </View>
            ))
          : tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBullet}>—</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))
        }

        {libraryMistakes.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Common mistakes</Text>
            {libraryMistakes.map((m, i) => (
              <View key={i} style={styles.tipRow}>
                <XIcon size={14} color="#ef4444" strokeWidth={3} style={{ marginTop: 2 }} />
                <Text style={styles.tipText}>{m}</Text>
              </View>
            ))}
          </>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: '#000',
  },
  iconBtn: { padding: 6, minWidth: 32, alignItems: 'center' },
  title: { fontSize: 15, fontFamily: Fonts.display, color: '#fff', flex: 1, textAlign: 'center' },

  cameraContainer: { width: '100%', overflow: 'hidden', backgroundColor: '#0d0f11' },

  statusPill: {
    position: 'absolute', top: 10, left: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 100, borderWidth: 1,
  },
  statusText: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.1 },

  formBanner: {
    position: 'absolute', top: 10, right: 10, maxWidth: '70%',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1,
  },
  formBannerGood:    { backgroundColor: 'rgba(0,224,164,0.18)', borderColor: '#00e0a4' },
  formBannerBad:     { backgroundColor: 'rgba(239,68,68,0.22)', borderColor: '#ef4444' },
  formBannerNeutral: { backgroundColor: 'rgba(0,0,0,0.65)',     borderColor: 'rgba(255,255,255,0.15)' },
  formBannerText:    { fontFamily: Fonts.bodyMedium, fontSize: 12, color: '#fff', letterSpacing: 0.1, flexShrink: 1 },

  permissionText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text, textAlign: 'center' },
  permissionBtn: {
    marginTop: 18, backgroundColor: Colors.primary,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 100,
  },
  permissionBtnText: { fontFamily: Fonts.displayMedium, fontSize: 13, color: Colors.accentInk, letterSpacing: 0.2 },

  feedbackPanel: { flex: 1, backgroundColor: '#111' },
  feedbackContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },

  cueBtn: {
    backgroundColor: 'rgba(255,107,53,0.12)', borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  cueBtnDisabled: { opacity: 0.45 },
  cueBtnText: { fontFamily: Fonts.displayMedium, fontSize: 13, color: Colors.primary, letterSpacing: 0.2 },

  cueCard: {
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)', borderRadius: 10, padding: 14,
  },
  cueLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cueLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.primary, letterSpacing: 0.2 },
  cueText:  { fontFamily: Fonts.body, fontSize: 13, color: '#e5e7eb', lineHeight: 20, fontStyle: 'italic' },

  sectionLabel: {
    fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary,
    letterSpacing: 0.2, marginTop: 8,
  },
  tipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  tipBullet: { fontFamily: Fonts.body, fontSize: 13, color: Colors.primary, marginTop: 1 },
  tipPhase: {
    fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.primary,
    letterSpacing: 0.2, marginTop: 4, minWidth: 28, textTransform: 'capitalize',
  },
  tipText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: '#e5e7eb', lineHeight: 20 },

  breathCard: {
    backgroundColor: 'rgba(255,107,53,0.06)',
    borderLeftWidth: 2, borderLeftColor: Colors.primary,
    borderRadius: 8, padding: 12, marginTop: 10,
  },
  breathLabel: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.primary, letterSpacing: 0.2, marginBottom: 5 },
  breathText:  { fontFamily: Fonts.body, fontSize: 12, color: '#e5e7eb', lineHeight: 18, fontStyle: 'italic' },

  disclaimer: {
    fontFamily: Fonts.body, fontSize: 11, color: '#6b7280',
    textAlign: 'center', marginTop: 16, letterSpacing: 0.1, fontStyle: 'italic',
  },
});
