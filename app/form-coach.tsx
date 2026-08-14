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
import { StatusBar, View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { getExerciseForm, getCoachCue, type ExerciseForm } from '@/constants/exerciseFormLibrary';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { canAccess } from '@/lib/featureGates';
import {
  X as XIcon, RefreshCw, AlertTriangle, Check, Pause, Video, Sparkles,
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

const DETECT_FPS            = 15;    // MLKit inference target (enforced via runAtTargetFps in the worklet)
const RENDER_INTERVAL_MS    = 33;    // ~30 fps render/interpolation (60 was a render storm that delayed pose callbacks)
const RENDER_TAU_MS         = 60;    // time-constant for dt-scaled catch-up: alpha = 1 - exp(-dt/tau)
const REJECT_STREAK_TO_BLANK = 4;    // hysteresis: consecutive rejected detections before we blank the skeleton
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

// ─────────────────────────────────────────────────────────────────────────────
// Geometric plausibility gate — is this a REAL human body, or did MLKit map a
// 33-point skeleton onto a hand / face / object held close to the lens?
//
// MLKit will happily return a full pose for a hand; the giveaway is proportion.
// These checks are scale- and position-invariant (pure ratios) and only fire
// when the joints they need are confidently visible — so a real body at an odd
// angle (with occluded joints) is never falsely rejected. Returns true when the
// geometry can't be a human.
// ─────────────────────────────────────────────────────────────────────────────
const GEO_CONF = 0.4; // min confidence to use a landmark for geometry

function isImplausibleBody(raw: Kpt[]): boolean {
  const pt = (i: number): [number, number] | null =>
    raw[i] && raw[i][2] >= GEO_CONF ? [raw[i][0], raw[i][1]] : null;
  const dist = (a: [number, number] | null, b: [number, number] | null) =>
    a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN;
  const mid = (a: [number, number] | null, b: [number, number] | null): [number, number] | null =>
    a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;

  const lsh = pt(KP.l_shoulder), rsh = pt(KP.r_shoulder);
  const lhip = pt(KP.l_hip), rhip = pt(KP.r_hip);
  // Without a confident torso we can't judge proportion — let the confidence /
  // span gates decide instead of guessing (avoids false rejects of real bodies).
  if (!lsh || !rsh || !lhip || !rhip) return false;

  const shoulderW = dist(lsh, rsh);
  const hipW = dist(lhip, rhip);
  const torso = dist(mid(lsh, rsh), mid(lhip, rhip));
  // SIDE-ON views collapse shoulder/hip widths to near-zero for a REAL body
  // (side squat, side deadlift). Degenerate widths mean "can't judge", never
  // "fake" — the old code returned true here and rejected legit side views.
  const sideOn = shoulderW < 0.18 * torso || hipW < 0.18 * torso;
  if (!(torso > 0) || sideOn) return false;

  // 2-of-3 SIGNAL VOTE — any single check can misfire on a legit extreme pose
  // (deep hip hinge compresses the 2D torso; one limb pointed at the camera
  // shortens wildly). Require TWO independent "not human" signals to reject.
  let votes = 0;

  // 1) Torso collapsed relative to shoulder width (a hand scrunches it).
  //    0.30 (not 0.45): a ~70° hip hinge legitimately reads ~0.34-0.44.
  if (torso < 0.30 * shoulderW) votes += 1;

  // 2) Shoulder-to-hip width ratio outside the human range.
  const shHip = shoulderW / hipW;
  if (shHip < 0.35 || shHip > 3.6) votes += 1;

  // 2.5) Head-size sanity — a HARD reject, not a vote. Real eye separation is
  //      ~12% of torso length; even a face filling the lens can't reach 55%
  //      while the torso is still confidently visible. Hand-hallucinations
  //      scatter "face" points across the fingertips and blow straight past it.
  //      This was previously one vote of two, so it could fire on an obvious
  //      hand and still be outvoted into "human".
  const le = pt(KP.l_eye), re = pt(KP.r_eye);
  const eyeSpan = dist(le, re);
  if (isFinite(eyeSpan) && eyeSpan > 0.55 * torso) return true;

  // 3) Left/right limb asymmetry (4.0x — 3.0x tripped on single-limb-toward-
  //    camera foreshortening in real lifts).
  const lArm = dist(lsh, pt(KP.l_elbow)) + dist(pt(KP.l_elbow), pt(KP.l_wrist));
  const rArm = dist(rsh, pt(KP.r_elbow)) + dist(pt(KP.r_elbow), pt(KP.r_wrist));
  const lLeg = dist(lhip, pt(KP.l_knee)) + dist(pt(KP.l_knee), pt(KP.l_ankle));
  const rLeg = dist(rhip, pt(KP.r_knee)) + dist(pt(KP.r_knee), pt(KP.r_ankle));
  const armBad = isFinite(lArm) && isFinite(rArm) && lArm > 0 && rArm > 0 &&
    Math.max(lArm, rArm) / Math.min(lArm, rArm) > 4.0;
  const legBad = isFinite(lLeg) && isFinite(rLeg) && lLeg > 0 && rLeg > 0 &&
    Math.max(lLeg, rLeg) / Math.min(lLeg, rLeg) > 4.0;
  if (armBad || legBad) votes += 1;

  return votes >= 2;
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

// ─────────────────────────────────────────────────────────────────────────────
// REP COUNTING — hysteresis state machine on the exercise's PRIMARY joint angle.
//
// A rep = the angle crossing below `low` (bottom of the movement) then back
// above `high` (lockout). The low/high gap is the hysteresis band, so hovering
// at depth never double-counts. Works for both directions of movement: a curl's
// "bottom" is elbow flexion at the top of the lift — the cycle is identical.
// Runs on the SMOOTHED keypoints at detection rate (~15fps) with the camera
// frame clock, so tempo numbers are real.
// ─────────────────────────────────────────────────────────────────────────────
const REP_THRESHOLDS: Record<string, { low: number; high: number }> = {
  squat:    { low: 110, high: 155 },
  lunge:    { low: 110, high: 155 },
  deadlift: { low: 120, high: 160 },
  press:    { low: 100, high: 150 },
  pull:     { low: 100, high: 150 },
  curl:     { low: 90,  high: 140 },
};
const REP_DEFAULT_TH = { low: 105, high: 150 };
const MIN_REP_MS = 900;   // full cycles faster than this are tracking noise

/** The angle that defines the rep for this exercise category. `deg` = worst
 *  side (drives rep counting); `left`/`right` feed the per-rep symmetry score. */
function primaryAngle(kpts: Kpt[], category?: string): {
  label: string; deg: number | null; left: number | null; right: number | null;
} {
  const min2 = (a: number | null, b: number | null) =>
    a == null ? b : b == null ? a : Math.min(a, b);
  let label: string, l: number | null, r: number | null;
  if (category === 'squat' || category === 'lunge' || category === 'deadlift') {
    label = 'KNEE';
    l = jointAngle(kpts, KP.l_hip, KP.l_knee, KP.l_ankle);
    r = jointAngle(kpts, KP.r_hip, KP.r_knee, KP.r_ankle);
  } else {
    label = 'ELBOW';
    l = jointAngle(kpts, KP.l_shoulder, KP.l_elbow, KP.l_wrist);
    r = jointAngle(kpts, KP.r_shoulder, KP.r_elbow, KP.r_wrist);
  }
  return { label, deg: min2(l, r), left: l, right: r };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-REP QUALITY — every rep graded 0-100 on depth, tempo, and symmetry, so
// the set report reads like a coach ("8 reps · 2 shallow · left side leading").
// ─────────────────────────────────────────────────────────────────────────────
export interface RepData {
  index: number;
  bottomDeg: number;   // deepest primary angle reached (lower = deeper)
  tempoMs: number;     // full down-up duration
  symmetry: number;    // |left − right| at the bottom (deg; lower = balanced)
  score: number;       // 0-100
  flaw: 'shallow' | 'rushed' | 'grindy' | 'uneven' | null; // dominant issue
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function scoreRep(bottomDeg: number, tempoMs: number, symmetry: number, category?: string): {
  score: number; flaw: RepData['flaw'];
} {
  const th = (category && REP_THRESHOLDS[category]) || REP_DEFAULT_TH;
  // Depth: full credit at/below the target; falls off over the next 35°.
  const depth = clamp01((th.low + 35 - bottomDeg) / 35) * 100;
  // Tempo: ideal ~1.5-5s. Rushed (<1.2s) or grindy (>6s) lose points.
  const s = tempoMs / 1000;
  let tempo = 100, tempoFlaw: RepData['flaw'] = null;
  if (s < 1.2) { tempo = clamp01(s / 1.2) * 70; tempoFlaw = 'rushed'; }
  else if (s > 6) { tempo = Math.max(55, 100 - (s - 6) * 8); tempoFlaw = 'grindy'; }
  // Symmetry: ≤12° balanced, ≥45° poor.
  const sym = clamp01((45 - symmetry) / 33) * 100;
  const score = Math.round(depth * 0.5 + tempo * 0.25 + sym * 0.25);
  // Dominant flaw = whichever dimension scored worst (if any is weak).
  let flaw: RepData['flaw'] = null;
  const worst = Math.min(depth, tempo, sym);
  if (worst < 70) {
    if (worst === depth) flaw = 'shallow';
    else if (worst === tempo) flaw = tempoFlaw ?? 'rushed';
    else flaw = 'uneven';
  }
  return { score, flaw };
}

export interface SetReport {
  reps: number;
  avgScore: number;
  avgTempoMs: number;
  bestRep: RepData | null;
  worstRep: RepData | null;
  flawCounts: Record<string, number>;
  data: RepData[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON LOCK-ON — the un-fakeable "is this a real body?" test.
//
// Thresholds can't separate a hand-hallucination from a side-on deadlift: any
// strictness level blocks one or admits the other. PHYSICS can. A real tracked
// human has constant bone lengths — their 2D projections change SMOOTHLY as
// the body rotates. A hallucinated skeleton (MLKit mapping a hand/object) has
// "bones" whose lengths jump chaotically frame-to-frame (evidence: a static
// hand produced elbow 109°→131° and 6 phantom reps).
//
// So the coach must ACQUIRE a lock before anything renders/counts/coaches:
//   ACQUIRING → collect raw (pre-smoothing!) bone lengths; when ≥4 core bones
//               hold a coefficient-of-variation ≤ 22% over ~0.5s → LOCKED.
//   LOCKED    → render + reps + cues enabled. Brief mid-rep projection swings
//               don't revoke; only SUSTAINED instability (~1s) or a gate
//               reject drops the lock.
// A MOVING hand never locks (lengths never stabilise). A hand held STILL does
// stabilise, so stability is paired with hasHumanProportions() — steady bones
// that can't belong to a body are rejected.
// ─────────────────────────────────────────────────────────────────────────────
const STABILITY_BONES: [number, number][] = [
  [KP.l_shoulder, KP.l_elbow], [KP.r_shoulder, KP.r_elbow],
  [KP.l_elbow, KP.l_wrist],    [KP.r_elbow, KP.r_wrist],
  [KP.l_hip, KP.l_knee],       [KP.r_hip, KP.r_knee],
  [KP.l_shoulder, KP.l_hip],   [KP.r_shoulder, KP.r_hip],
];
const STAB_WINDOW = 8;        // frames (~0.5s at 15fps detection)
const STAB_MAX_CV = 0.22;     // per-bone length coefficient of variation
const STAB_MIN_READY = 5;     // frames before a verdict is possible
const UNLOCK_AFTER = 15;      // consecutive unstable frames to revoke a lock

/**
 * Are these bone lengths anatomically possible for a human?
 *
 * Stability alone is NOT enough. The premise "a hand never stabilises" only
 * holds for a MOVING hand; a hand held STILL in front of the lens produces
 * perfectly steady bone lengths and locks on — which is exactly how a palm
 * ended up wearing a full skeleton with live form cues.
 *
 * So the lock also has to ask whether the proportions could belong to a body.
 * Bounds are deliberately loose because foreshortening legitimately shortens a
 * limb pointed at the camera; a bone that is degenerate or low-confidence is
 * skipped rather than guessed at. Two independent violations are required, so a
 * single oddly-projected limb never rejects a real lifter.
 */
function hasHumanProportions(raw: Kpt[]): boolean {
  const len = (a: number, b: number): number => {
    const A = raw[a], B = raw[b];
    if (!A || !B || A[2] < 0.5 || B[2] < 0.5) return NaN;
    const d = Math.hypot(A[0] - B[0], A[1] - B[1]);
    return d >= 8 ? d : NaN;   // degenerate/foreshortened — no verdict
  };
  // Ratio of two bones that are near-equal on every human, with wide slack.
  const ratioBad = (x: number, y: number, lo: number, hi: number): boolean => {
    if (!isFinite(x) || !isFinite(y)) return false;
    const r = x / y;
    return r < lo || r > hi;
  };

  let bad = 0;
  // Upper arm vs forearm — near 1:1 on a human, chaotic on a mapped hand.
  if (ratioBad(len(KP.l_shoulder, KP.l_elbow), len(KP.l_elbow, KP.l_wrist), 0.45, 2.2)) bad += 1;
  if (ratioBad(len(KP.r_shoulder, KP.r_elbow), len(KP.r_elbow, KP.r_wrist), 0.45, 2.2)) bad += 1;
  // Thigh vs shin — likewise near 1:1.
  if (ratioBad(len(KP.l_hip, KP.l_knee), len(KP.l_knee, KP.l_ankle), 0.45, 2.2)) bad += 1;
  if (ratioBad(len(KP.r_hip, KP.r_knee), len(KP.r_knee, KP.r_ankle), 0.45, 2.2)) bad += 1;
  // Torso side vs upper arm — a torso is never a small fraction of an upper arm.
  if (ratioBad(len(KP.l_shoulder, KP.l_hip), len(KP.l_shoulder, KP.l_elbow), 0.5, 4.5)) bad += 1;
  if (ratioBad(len(KP.r_shoulder, KP.r_hip), len(KP.r_shoulder, KP.r_elbow), 0.5, 4.5)) bad += 1;

  return bad < 2;
}

/**
 * Why did this detection pass or fail? One compact line per sample, so a single
 * real reproduction (hold the offending object up for ~5s) replaces guesswork
 * about which gate a false positive slips through. Read with:
 *   adb logcat -s ReactNativeJS | grep GATE
 */
function gateDiag(raw: Kpt[]): string {
  const pt = (i: number) => (raw[i] && raw[i][2] >= 0.4 ? [raw[i][0], raw[i][1]] as [number, number] : null);
  const d = (a: [number, number] | null, b: [number, number] | null) =>
    a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN;
  const mid = (a: [number, number] | null, b: [number, number] | null) =>
    a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] : null;
  const lsh = pt(KP.l_shoulder), rsh = pt(KP.r_shoulder);
  const lhip = pt(KP.l_hip), rhip = pt(KP.r_hip);
  const shW = d(lsh, rsh), hipW = d(lhip, rhip);
  const torso = d(mid(lsh, rsh), mid(lhip, rhip));
  const eye = d(pt(KP.l_eye), pt(KP.r_eye));
  const r = (v: number) => (isFinite(v) ? Math.round(v) : -1);
  const f = (v: number) => (isFinite(v) ? v.toFixed(2) : 'na');
  return 'GATE torso=' + r(torso) + ' shW=' + r(shW) + ' hipW=' + r(hipW) +
    ' torso/shW=' + f(torso / shW) + ' sh/hip=' + f(shW / hipW) +
    ' eye/torso=' + f(eye / torso) +
    ' prop=' + (hasHumanProportions(raw) ? 'human' : 'NOT') +
    ' impl=' + (isImplausibleBody(raw) ? 'Y' : 'n');
}

class SkeletonLock {
  locked = false;
  private hist: number[][] = [];
  private unstableStreak = 0;

  push(raw: Kpt[]): void {
    const lens = STABILITY_BONES.map(([a, b]) => {
      const A = raw[a], B = raw[b];
      if (!A || !B || A[2] < 0.5 || B[2] < 0.5) return NaN;
      return Math.hypot(A[0] - B[0], A[1] - B[1]);
    });
    this.hist.push(lens);
    if (this.hist.length > STAB_WINDOW) this.hist.shift();

    // Steady AND anatomically possible. A still hand satisfies the first and
    // fails the second, which is the case that let a palm lock on.
    const stable = this.computeStable() && hasHumanProportions(raw);
    if (!this.locked) {
      if (stable) { this.locked = true; this.unstableStreak = 0; }
    } else if (stable) {
      this.unstableStreak = 0;
    } else {
      this.unstableStreak += 1;
      if (this.unstableStreak >= UNLOCK_AFTER) { this.locked = false; this.hist = []; this.unstableStreak = 0; }
    }
  }

  private computeStable(): boolean {
    if (this.hist.length < STAB_MIN_READY) return false;
    let checked = 0, ok = 0;
    for (let b = 0; b < STABILITY_BONES.length; b++) {
      const vals: number[] = [];
      for (const f of this.hist) { if (isFinite(f[b])) vals.push(f[b]); }
      if (vals.length < STAB_MIN_READY) continue;
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      if (mean < 8) continue; // degenerate/foreshortened bone — skip
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      checked += 1;
      if (sd / mean <= STAB_MAX_CV) ok += 1;
    }
    return checked >= 4 && ok / checked >= 0.75;
  }

  reset(): void { this.locked = false; this.hist = []; this.unstableStreak = 0; }
}

/** The joint chain this exercise NEEDS visible before coaching is credible. */
function hasRequiredChain(kpts: Kpt[], category?: string): boolean {
  const ok = (i: number) => !!kpts[i] && kpts[i][2] >= 0.5;
  const leg = (ok(KP.l_hip) && ok(KP.l_knee) && ok(KP.l_ankle)) ||
              (ok(KP.r_hip) && ok(KP.r_knee) && ok(KP.r_ankle));
  const arm = (ok(KP.l_shoulder) && ok(KP.l_elbow) && ok(KP.l_wrist)) ||
              (ok(KP.r_shoulder) && ok(KP.r_elbow) && ok(KP.r_wrist));
  const torso = (ok(KP.l_shoulder) || ok(KP.r_shoulder)) && (ok(KP.l_hip) || ok(KP.r_hip));
  if (category === 'squat' || category === 'deadlift' || category === 'lunge') return torso && leg;
  if (category === 'press' || category === 'pull' || category === 'curl') return torso && arm;
  return torso && (leg || arm);
}

class RepCounter {
  count = 0;
  lastTempoMs = 0;      // duration of the last counted rep
  lastScore = 0;        // quality of the last counted rep (for the live pill)
  bestBottomDeg = 180;  // deepest angle reached across the set (depth quality)
  reps: RepData[] = []; // per-rep graded history for the set report
  private phase: 'top' | 'bottom' = 'top';
  private cycleStart = 0;
  private bottomDeg = 180;
  private bottomSym = 0;   // |L−R| captured AT the deepest point of this rep

  update(deg: number | null, tMs: number, category?: string, symNow = 0): void {
    if (deg == null) return;
    const th = (category && REP_THRESHOLDS[category]) || REP_DEFAULT_TH;
    if (this.phase === 'top') {
      if (deg < th.low) {
        this.phase = 'bottom'; this.cycleStart = tMs;
        this.bottomDeg = deg; this.bottomSym = symNow;
      }
      return;
    }
    if (deg < this.bottomDeg) { this.bottomDeg = deg; this.bottomSym = symNow; }
    if (deg > th.high) {
      this.phase = 'top';
      const dur = tMs - this.cycleStart;
      if (dur >= MIN_REP_MS) {
        const { score, flaw } = scoreRep(this.bottomDeg, dur, this.bottomSym, category);
        this.count += 1;
        this.lastTempoMs = dur;
        this.lastScore = score;
        this.reps.push({ index: this.count, bottomDeg: this.bottomDeg, tempoMs: dur, symmetry: this.bottomSym, score, flaw });
        if (this.bottomDeg < this.bestBottomDeg) this.bestBottomDeg = this.bottomDeg;
      }
      this.bottomDeg = 180; this.bottomSym = 0;
    }
  }

  /** Summarize the set for the end-of-set report card. */
  report(): SetReport {
    const data = this.reps;
    const n = data.length;
    const flawCounts: Record<string, number> = {};
    for (const r of data) if (r.flaw) flawCounts[r.flaw] = (flawCounts[r.flaw] ?? 0) + 1;
    return {
      reps: n,
      avgScore: n ? Math.round(data.reduce((s, r) => s + r.score, 0) / n) : 0,
      avgTempoMs: n ? Math.round(data.reduce((s, r) => s + r.tempoMs, 0) / n) : 0,
      bestRep: n ? data.reduce((a, b) => (b.score > a.score ? b : a)) : null,
      worstRep: n ? data.reduce((a, b) => (b.score < a.score ? b : a)) : null,
      flawCounts,
      data,
    };
  }

  reset(): void {
    this.count = 0; this.lastTempoMs = 0; this.lastScore = 0; this.bestBottomDeg = 180;
    this.reps = [];
    this.phase = 'top'; this.cycleStart = 0; this.bottomDeg = 180; this.bottomSym = 0;
  }
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
  const router = useRouter();
  const { exerciseName, persona: personaParam } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
  }>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cameraHeight = Math.round(screenHeight * 0.62);

  const persona            = programIdToPersona(personaParam ?? 'cbum_evolved');
  const claudePersonaLabel = PERSONA_LABELS[persona] ?? 'COACH SAYS';

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
  const pageAccent   = personaAccent(personaTheme, scheme);           // on the page

  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);
  // On-screen alignment diagnostic (screenshot-able) — lets us fix skeleton
  // misalignment without adb. Toggle with the ⚙ chip; off by default.
  const [showAlign, setShowAlign] = useState(false);
  const alignDebugRef = useRef<string>('…');

  // Rep counter + live primary-angle readout. Updated in handlePose at
  // detection rate; rendered by the analysisTick re-renders (~8Hz). Refs (not
  // state) so counting never adds render pressure of its own.
  const repRef = useRef(new RepCounter());
  const liveAngleRef = useRef<{ label: string; deg: number | null }>({ label: '', deg: null });
  const categoryRef = useRef<string | undefined>(undefined);
  // End-of-set report card (null = hidden). Captured when "Finish set" is tapped.
  const [setReport, setSetReport] = useState<SetReport | null>(null);

  const finishSet = () => {
    const r = repRef.current.report();
    if (r.reps < 1) return;
    setSetReport(r);
    // Coach speaks a one-line verdict in their voice.
    const worstFlaw = Object.entries(r.flawCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const verdict =
      r.avgScore >= 85 ? `${r.reps} clean reps. That's the standard — keep it there.`
      : worstFlaw === 'shallow' ? `${r.reps} reps, but ${r.flawCounts.shallow} were shallow. Hit full depth every rep.`
      : worstFlaw === 'rushed' ? `${r.reps} reps — too fast. Control the eccentric, own the tempo.`
      : worstFlaw === 'uneven' ? `${r.reps} reps, but you're leaning to one side. Even it out.`
      : worstFlaw === 'grindy' ? `${r.reps} hard reps. Grind's fine near failure — watch the form.`
      : `${r.reps} solid reps. Small tweaks and these are perfect.`;
    try { voice.cue('form_issue', { issue: verdict }); } catch { /* ignore */ }
    repRef.current.reset();
    setAnalysisTick((t) => t + 1);
  };

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
  const rejectStreakRef = useRef(0);   // gate hysteresis (see rejectDetection)
  const lockRef = useRef(new SkeletonLock());  // bone-stability lock-on
  const lastTickAtRef   = useRef(0);   // analysis-tick throttle (~8Hz)
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
  // Bridge the category to handlePose via a ref (avoids re-creating the pose
  // callback — and its RunOnJS binding — when the exercise changes).
  useEffect(() => {
    categoryRef.current = formLibraryData?.category;
    repRef.current.reset();   // new exercise = new set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formLibraryData]);
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
  const handlePose = useCallback((data: any, frameW: number, frameH: number, mirror: boolean, ts?: number) => {
    // Camera-frame timestamp for the One-Euro clock (Android: ns since boot).
    const tMs = typeof ts === 'number' && ts > 0 ? (ts > 1e13 ? ts / 1e6 : ts) : Date.now();

    // Throttled analysis tick (~8Hz) — analysis re-runs don't need every frame,
    // and per-frame setState was a render storm that delayed pose delivery.
    const tickAnalysis = (force = false) => {
      const now = Date.now();
      if (force || now - lastTickAtRef.current >= 120) {
        lastTickAtRef.current = now;
        setAnalysisTick((t) => t + 1);
      }
    };
    // Reject with HYSTERESIS: a single bad detection (MLKit stream dropout,
    // joint likelihoods dipping at 0.5) must not blank the skeleton + wipe the
    // motion history — that caused freeze/flicker + STANDBY flapping. We coast
    // on the last good pose and only blank after N consecutive rejects, then
    // also reset the smoother so re-acquisition doesn't blend from stale state.
    const rejectDetection = () => {
      rejectStreakRef.current += 1;
      if (rejectStreakRef.current < REJECT_STREAK_TO_BLANK) return; // coast
      if (targetKptsRef.current !== null) {
        targetKptsRef.current = null;
        kptsHistoryRef.current = [];
        smootherRef.current = new KeypointSmoother();
        lockRef.current.reset();   // person gone → re-acquire from scratch
        liveAngleRef.current = { ...liveAngleRef.current, deg: null }; // rep count survives
        tickAnalysis(true);
      }
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
    // these numbers tell us exactly how the transform is off.
    alignDebugRef.current =
      'frame ' + frameW + '×' + frameH + ' → img ' + imgW + '×' + imgH +
      ' | view ' + viewW + '×' + viewH +
      ' | nose raw ' + Math.round(nose.x) + ',' + Math.round(nose.y) +
      ' → ' + Math.round(raw[0][0]) + ',' + Math.round(raw[0][1]) +
      ' | mir ' + (mirror ? 'Y' : 'N') +
      ' | lock ' + (lockRef.current.locked ? 'Y' : 'acquiring');

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
    const implausible = isImplausibleBody(raw);
    poseLog('strong=' + strong + '/33 span=' + Math.round(span) + ' need>' + Math.round(minSpan) + (implausible ? ' IMPLAUSIBLE' : ''));
    poseLog(gateDiag(raw));

    // Reject (with hysteresis) unless enough HIGH-CONFIDENCE joints span a
    // large-enough box AND the proportions could be a real human.
    if (strong < 8 || span < minSpan || implausible) {
      rejectDetection();
      return;
    }

    rejectStreakRef.current = 0;

    // ── LOCK-ON: physics test on RAW landmarks (smoothing hides the jitter
    // we're detecting). Until the skeleton's bone lengths are stable AND the
    // exercise's required joint chain is visible, nothing renders, counts or
    // coaches — a hand never locks; a real body locks in ~half a second.
    lockRef.current.push(raw);
    const chainOk = hasRequiredChain(raw, categoryRef.current);
    if (!lockRef.current.locked || !chainOk) {
      targetKptsRef.current = null;         // soft-hide (no smoother/history wipe)
      liveAngleRef.current = { ...liveAngleRef.current, deg: null };
      tickAnalysis();
      return;
    }

    const smoothed = smootherRef.current.smooth(raw, tMs);
    targetKptsRef.current = smoothed;
    kptsHistoryRef.current.push(smoothed);
    if (kptsHistoryRef.current.length > MOTION_HISTORY_LEN) kptsHistoryRef.current.shift();

    // Rep counting + live angle — on the smoothed pose, camera-clock timed.
    const pa = primaryAngle(smoothed, categoryRef.current);
    liveAngleRef.current = pa;
    const symNow = (pa.left != null && pa.right != null) ? Math.abs(pa.left - pa.right) : 0;
    repRef.current.update(pa.deg, tMs, categoryRef.current, symNow);

    tickAnalysis();
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
    if ((an && formAnalysis.badJoints.has(an)) || (bn && formAnalysis.badJoints.has(bn))) return stage.danger;
    if (formAnalysis.status === 'WARNING') return stage.warning;
    return stageAccent;
  };
  const jointColor = (idx: number): string => {
    const name = jointNameByIdx[idx];
    if (name && formAnalysis.badJoints.has(name)) return stage.danger;
    return stageAccent;
  };

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
  // The ⬤ glyph is now a real dot view, so the label carries text only.
  const statusLabel  =
    modelError                            ? 'MODEL ERROR' :
    modelLoading                          ? 'LOADING AI…' :
    isTracking && formAnalysis.status === 'NO_VIEW' ? 'CAN\'T SEE YOU' :
    isTracking && formAnalysis.status === 'UNSAFE'  ? 'SPOTTER NEEDED' :
    isTracking && formAnalysis.status === 'STANDBY' ? 'STANDBY · WAITING' :
    isTracking                            ? 'LIVE · 60FPS SMOOTH' :
                                            'STEP INTO FRAME';
  const statusColor =
    modelError                            ? stage.danger :
    isTracking && (formAnalysis.status === 'NO_VIEW' || formAnalysis.status === 'UNSAFE') ? stage.warning :
    isTracking && formAnalysis.status === 'STANDBY' ? stage.warning :
    isTracking                            ? stage.crownText :
                                            stage.crownTextDim;

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
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
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
                    stroke={stage.crown} strokeWidth={1.5}
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
          {isTracking && formAnalysis.issues.length > 0 && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.danger }]} />
              <AlertTriangle size={14} color={stage.danger} />
              <Text style={styles.sheetText} numberOfLines={2}>{formAnalysis.issues[0]}</Text>
            </View>
          )}
          {isTracking && formAnalysis.issues.length === 0 && formAnalysis.status === 'GOOD' && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stageAccent }]} />
              <Check size={14} color={stageAccent} strokeWidth={3} />
              <Text style={styles.sheetText}>Form looks solid — keep going</Text>
            </View>
          )}
          {isTracking && formAnalysis.status === 'STANDBY' && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.crownTextDim }]} />
              <Pause size={14} color={stage.crownTextDim} />
              <Text style={styles.sheetText}>Standby — start your set to begin form check</Text>
            </View>
          )}
          {!isTracking && !modelLoading && !modelError && (
            <View style={styles.sheet}>
              <View style={[styles.sheetBar, { backgroundColor: stage.crownTextDim }]} />
              <CameraIcon size={14} color={stage.crownTextDim} />
              <Text style={styles.sheetText}>Step into frame — full body visible</Text>
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

          {/* Rep counter + live primary angle (long-press to reset the set).
              Reads refs; refreshed by the ~8Hz analysis re-renders. */}
          {(repRef.current.count > 0 || (isTracking && liveAngleRef.current.deg != null)) && (
            <PressableScale
              style={styles.repRow}
              onLongPress={() => { repRef.current.reset(); setAnalysisTick((t) => t + 1); }}
              haptic="light"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${repRef.current.count} reps counted. Long press to reset the set.`}
            >
              <View>
                <CountUp
                  value={repRef.current.count}
                  duration={420}
                  style={styles.repValue}
                />
                <Text style={styles.repLabel}>
                  REP{repRef.current.count === 1 ? '' : 'S'} counted
                </Text>
              </View>
              {isTracking && liveAngleRef.current.deg != null && (
                <View style={styles.repAngleCol}>
                  <Text style={styles.repAngleValue}>
                    {Math.round(liveAngleRef.current.deg)}°
                  </Text>
                  <Text style={styles.repLabel}>{liveAngleRef.current.label}</Text>
                </View>
              )}
            </PressableScale>
          )}
        </View>
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
              ? `Ask ${claudePersonaLabel.split(' ')[0]} again (${cooldownLeft}s)`
              : `Ask ${claudePersonaLabel.split(' ')[0]} for a cue`}
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
      {setReport && (
        <View style={styles.reportOverlay}>
          <View style={styles.reportCard}>
            <Text style={styles.reportEyebrow}>{claudePersonaLabel} · SET REPORT</Text>

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

            {/* Per-rep bars — one per rep, clean / flawed / poor at a glance */}
            <View style={styles.reportDots}>
              {setReport.data.map((r) => (
                <View
                  key={r.index}
                  style={[
                    styles.reportDot,
                    { backgroundColor: r.score >= 80 ? tokens.success : r.score >= 60 ? tokens.warning : tokens.danger },
                  ]}
                />
              ))}
            </View>

            {Object.keys(setReport.flawCounts).length > 0 ? (
              <Text style={styles.reportFlaws}>
                {Object.entries(setReport.flawCounts)
                  .map(([f, n]) => `${n} ${f}`)
                  .join(' · ')}
              </Text>
            ) : (
              <Text style={styles.reportFlaws}>Every rep clean — nothing to fix.</Text>
            )}

            <PressableScale
              style={styles.reportDone}
              onPress={() => setSetReport(null)}
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
    headTitleWrap: { flex: 1, alignItems: 'center' },
    headEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },
    headTitle: {
      fontFamily: Fonts.displayBold, fontSize: 20, letterSpacing: -0.9,
      color: stage.crownText, textAlign: 'center', marginTop: 5,
    },

    // ── Camera stage — the hero; every overlay floats, none is boxed ─────────
    stage: { width: '100%', overflow: 'hidden', backgroundColor: t.crown },
    scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 104 },
    scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 262 },

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

    // The dramatic pairing: a 68px numeral straight onto an 8px mono label.
    repRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    repValue: {
      fontFamily: Fonts.displayBold, fontVariant: ['tabular-nums'],
      fontSize: 68, lineHeight: 69, letterSpacing: -3.06, color: stage.crownText,
    },
    repLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownTextDim, marginTop: 3,
    },
    repAngleCol: { alignItems: 'flex-end', paddingBottom: 7 },
    repAngleValue: {
      fontFamily: Fonts.legacyMono, fontSize: 20, letterSpacing: 0.4,
      fontVariant: ['tabular-nums'], color: stage.crownText,
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
      width: '100%', maxWidth: 380, borderRadius: 30, padding: 26,
      backgroundColor: t.surface,
      // Depth from shadow, never an outline.
      shadowColor: t.crown, shadowOpacity: 0.24, shadowRadius: 34,
      shadowOffset: { width: 0, height: 18 }, elevation: 16,
    },
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
    reportDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 28 },
    reportDot: { width: 6, height: 24, borderRadius: 3 },
    reportFlaws: {
      fontFamily: Fonts.body, fontSize: 14, lineHeight: 21, color: t.textSecondary,
      textTransform: 'capitalize', marginTop: 18,
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
