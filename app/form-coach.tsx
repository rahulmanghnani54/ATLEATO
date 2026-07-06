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
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy, runAtTargetFps } from 'react-native-vision-camera';
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

  // 2.5) Head-size sanity: human eye-to-eye span is a small fraction of torso
  //      length. Hand-hallucinations scatter "face" points across fingertips,
  //      producing a face wider than half the torso — instant tell.
  const le = pt(KP.l_eye), re = pt(KP.r_eye);
  const eyeSpan = dist(le, re);
  if (isFinite(eyeSpan) && eyeSpan > 0.55 * torso) votes += 1;

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

/** The angle that defines the rep for this exercise category (worst side). */
function primaryAngle(kpts: Kpt[], category?: string): { label: string; deg: number | null } {
  const min2 = (a: number | null, b: number | null) =>
    a == null ? b : b == null ? a : Math.min(a, b);
  if (category === 'squat' || category === 'lunge' || category === 'deadlift') {
    return {
      label: 'KNEE',
      deg: min2(
        jointAngle(kpts, KP.l_hip, KP.l_knee, KP.l_ankle),
        jointAngle(kpts, KP.r_hip, KP.r_knee, KP.r_ankle),
      ),
    };
  }
  return {
    label: 'ELBOW',
    deg: min2(
      jointAngle(kpts, KP.l_shoulder, KP.l_elbow, KP.l_wrist),
      jointAngle(kpts, KP.r_shoulder, KP.r_elbow, KP.r_wrist),
    ),
  };
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
// Hands never lock (no real structure → lengths never stabilise).
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

    const stable = this.computeStable();
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
  bestBottomDeg = 180;  // deepest angle reached across the set (depth quality)
  private phase: 'top' | 'bottom' = 'top';
  private cycleStart = 0;
  private bottomDeg = 180;

  update(deg: number | null, tMs: number, category?: string): void {
    if (deg == null) return;
    const th = (category && REP_THRESHOLDS[category]) || REP_DEFAULT_TH;
    if (this.phase === 'top') {
      if (deg < th.low) { this.phase = 'bottom'; this.cycleStart = tMs; this.bottomDeg = deg; }
      return;
    }
    if (deg < this.bottomDeg) this.bottomDeg = deg;
    if (deg > th.high) {
      this.phase = 'top';
      const dur = tMs - this.cycleStart;
      if (dur >= MIN_REP_MS) {
        this.count += 1;
        this.lastTempoMs = dur;
        if (this.bottomDeg < this.bestBottomDeg) this.bestBottomDeg = this.bottomDeg;
      }
      this.bottomDeg = 180;
    }
  }

  reset(): void {
    this.count = 0; this.lastTempoMs = 0; this.bestBottomDeg = 180;
    this.phase = 'top'; this.cycleStart = 0; this.bottomDeg = 180;
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
    repRef.current.update(pa.deg, tMs, categoryRef.current);

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
        <Text
          style={styles.title}
          onLongPress={() => setShowAlign((s) => !s)}
          suppressHighlighting
        >
          {exerciseName ?? 'Form Coach'}
        </Text>
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

        {showAlign && (
          <View style={styles.alignDebug} pointerEvents="none">
            {/* analysisTick drives re-render so this stays live */}
            <Text style={styles.alignDebugText}>{alignDebugRef.current}{analysisTick ? '' : ''}</Text>
          </View>
        )}

        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {/* Rep counter + live primary angle (long-press to reset the set).
            Reads refs; refreshed by the ~8Hz analysis re-renders. */}
        {(repRef.current.count > 0 || (isTracking && liveAngleRef.current.deg != null)) && (
          <TouchableOpacity
            style={styles.repPill}
            onLongPress={() => { repRef.current.reset(); setAnalysisTick((t) => t + 1); }}
            activeOpacity={0.8}
          >
            <Text style={styles.repPillCount}>
              {repRef.current.count} REP{repRef.current.count === 1 ? '' : 'S'}
            </Text>
            {isTracking && liveAngleRef.current.deg != null && (
              <Text style={styles.repPillAngle}>
                {liveAngleRef.current.label} {Math.round(liveAngleRef.current.deg)}°
              </Text>
            )}
          </TouchableOpacity>
        )}

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
  repPill: {
    position: 'absolute', bottom: 12, right: 10,   // top-right is the form banner's spot
    alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(18,185,129,0.7)',
  },
  repPillCount: { fontFamily: Fonts.display, fontSize: 18, letterSpacing: 0.5, color: '#7DEBC4' },
  repPillAngle: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: '#CFE8DD', marginTop: 1 },
  alignDebug: {
    position: 'absolute', bottom: 8, left: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6, padding: 6,
  },
  alignDebugText: { fontFamily: Fonts.mono, fontSize: 10, color: '#7DEBC4', textAlign: 'center' },

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
