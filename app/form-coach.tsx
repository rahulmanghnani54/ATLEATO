/**
 * Live Form Coach (V1.5 — snapshot + 60fps interpolation)
 *
 * Detection: MoveNet Lightning runs every 150ms via the snapshot pipeline (~6 fps).
 * Rendering: An animation loop runs at ~60fps and linearly interpolates the
 *   on-screen skeleton from its previous position to the latest detection.
 *
 * Why this design:
 *   - True 15-30fps worklet inference would need a Vision Camera + fast-tflite
 *     + nitro-modules version triplet that's currently fragile ("cannot get
 *     hybrid property" cross-thread errors).
 *   - Inference at 6fps + interpolation at 60fps LOOKS just as smooth as
 *     true 30fps to the eye, because pose changes between frames are
 *     near-linear at human speeds.
 *   - 100% on JS thread — no worklet stability risk, no native module
 *     juggling, no rebuild needed.
 *
 * The form analysis (knees caving, depth, elbow flare etc.) still fires every
 * detection (6×/sec). Visual smoothing only affects how the skeleton GLIDES.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTensorflowModel } from 'react-native-fast-tflite';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { Colors, Spacing, Fonts } from '@/constants/theme';
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { getExerciseForm, getCoachCue, type ExerciseForm } from '@/constants/exerciseFormLibrary';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { canAccess } from '@/lib/featureGates';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DETECTION_INTERVAL_MS = 150;   // ~6.5 fps inference
const RENDER_INTERVAL_MS    = 16;    // ~60 fps render/interpolation
const INTERP_SPEED          = 0.30;  // 0..1 — lower = smoother (and filters jitter)
const MODEL_INPUT_SIZE      = 192;
const CONFIDENCE_THRESHOLD  = 0.30;
const MIN_VISIBLE_JOINTS    = 8;
const CUE_COOLDOWN_MS       = 5_000;

// ── Stability tuning ─────────────────────────────────────────────────────────
const ANGLE_DEADBAND_DEG    = 5;     // angle must cross threshold by this much to flag
const ISSUE_HISTORY_LEN     = 3;     // rolling window size
const ISSUE_REQUIRED_HITS   = 2;     // issue must appear in N of last frames to fire

// ── Motion detection ─────────────────────────────────────────────────────────
const MOTION_HISTORY_LEN     = 12;    // ~1.8s at 6.5fps — longer averaging = less flapping
const MOTION_PX_THRESHOLD    = 32;    // px — clearly above MoveNet noise floor (~10-18px)
const MOTION_HYSTERESIS_HITS = 2;     // need N consecutive frames of new state to flip

const PERSONA_LABELS: Record<string, string> = {
  cbum:        'CBUM SAYS',
  arnold:      'ARNOLD SAYS',
  nippard:     'NIPPARD SAYS',
  ct_fletcher: 'CT SAYS',
  dr_mike:     'DR MIKE SAYS',
};

const KP = {
  nose: 0, l_eye: 1, r_eye: 2, l_ear: 3, r_ear: 4,
  l_shoulder: 5, r_shoulder: 6,
  l_elbow: 7,    r_elbow: 8,
  l_wrist: 9,    r_wrist: 10,
  l_hip: 11,     r_hip: 12,
  l_knee: 13,    r_knee: 14,
  l_ankle: 15,   r_ankle: 16,
};

const SKELETON: [number, number][] = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];

type Kpt = [number, number, number]; // [x_px, y_px, confidence]

interface FormAnalysis {
  issues: string[];
  badJoints: Set<string>;
  status: 'GOOD' | 'WARNING' | 'BAD' | 'OUT' | 'STANDBY';
}

/**
 * Detect whether the person is actually moving across the last N detections.
 * Tracks key load-bearing joints (shoulders, hips, wrists) — these always move
 * during a real exercise, even slow eccentrics. If the average displacement is
 * under a few pixels, the person is static (sitting, standing still, etc.).
 */
function detectMotion(history: Kpt[][]): boolean {
  if (history.length < 2) return false;
  const KEY = [KP.l_shoulder, KP.r_shoulder, KP.l_hip, KP.r_hip, KP.l_wrist, KP.r_wrist];
  let totalDisplacement = 0;
  let measured = 0;
  for (const idx of KEY) {
    // Compute max-vs-min spread across the window for this joint —
    // captures peak motion, not just first-vs-last (which a full rep ending
    // at the same position would miss).
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
    totalDisplacement += range;
    measured++;
  }
  if (measured === 0) return false;
  return (totalDisplacement / measured) > MOTION_PX_THRESHOLD;
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

/** Per-axis filter for each of 17 MoveNet keypoints. */
class KeypointSmoother {
  private filters: OneEuro[][] = Array.from({ length: 17 }, () => [
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

function analyzeForm(form: ExerciseForm | null, kpts: Kpt[]): FormAnalysis {
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

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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

  const tfliteModel = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/models/movenet.tflite') as number,
    [],
  );

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
  const formAnalysis: FormAnalysis = useMemo(() => {
    const t = targetKptsRef.current;
    if (!t) {
      issueHistoryRef.current = []; // reset when person leaves frame
      return { issues: [], badJoints: new Set(), status: 'OUT' };
    }
    const instant = analyzeForm(formLibraryData, t);

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

    let status: FormAnalysis['status'];
    if (stableIssues.length === 0) {
      status = moving ? 'GOOD' : 'STANDBY';
    } else {
      status = stableIssues.length === 1 ? 'WARNING' : 'BAD';
    }

    return { issues: stableIssues, badJoints: stableBadJoints, status };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTick, formLibraryData]);

  // Side-effect: speak the top issue when it changes.
  // Strip persona-specific punctuation to keep TTS clean.
  useEffect(() => {
    const topIssue = formAnalysis.issues[0] ?? '';
    if (!topIssue) {
      lastSpokenIssueRef.current = '';
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

  // ── Detection loop (snapshot @ ~6 fps) ─────────────────────────────────────
  useEffect(() => {
    if (tfliteModel.state !== 'loaded') return;
    const model = tfliteModel.model;

    const runOnce = async () => {
      if (detectingRef.current || !cameraRef.current) return;
      detectingRef.current = true;
      try {
        const snap = await cameraRef.current.takeSnapshot({ quality: 60 });
        const uri  = snap.path.startsWith('file://') ? snap.path : `file://${snap.path}`;
        const resized = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!resized.base64) return;

        const jpegBytes = base64ToUint8(resized.base64);
        const { data: rgba } = decodeJpeg(jpegBytes, { useTArray: true, formatAsRGBA: true });

        const px = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
        const rgb = new Uint8Array(px * 3);
        for (let i = 0; i < px; i++) {
          rgb[i * 3]     = rgba[i * 4];
          rgb[i * 3 + 1] = rgba[i * 4 + 1];
          rgb[i * 3 + 2] = rgba[i * 4 + 2];
        }

        const out = await model.run([rgb.buffer as ArrayBuffer]);
        const flat = new Float32Array(out[0]);

        const raw: Kpt[] = [];
        for (let i = 0; i < 17; i++) {
          const yNorm = flat[i * 3];
          const xNorm = flat[i * 3 + 1];
          const conf  = flat[i * 3 + 2];
          raw.push([xNorm * screenWidth, yNorm * cameraHeight, conf]);
        }
        // ── Apply One-Euro smoothing BEFORE storing as target ──
        // This is the key fix for "skeleton wobbles when you hold still".
        const smoothed = smootherRef.current.smooth(raw);
        const visible = smoothed.filter(([, , c]) => c >= CONFIDENCE_THRESHOLD).length;
        const usable = visible >= MIN_VISIBLE_JOINTS ? smoothed : null;
        targetKptsRef.current = usable;

        // Push to motion-history buffer (used to detect "actually exercising")
        if (usable) {
          kptsHistoryRef.current.push(usable);
          if (kptsHistoryRef.current.length > MOTION_HISTORY_LEN) {
            kptsHistoryRef.current.shift();
          }
        } else {
          kptsHistoryRef.current = []; // reset when subject leaves frame
        }

        setAnalysisTick((t) => t + 1); // trigger form-analysis recompute
      } catch {
        // single-frame error — try next tick
      } finally {
        detectingRef.current = false;
      }
    };

    const id = setInterval(runOnce, DETECTION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tfliteModel.state, screenWidth, cameraHeight]);

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
  const modelLoading = tfliteModel.state === 'loading';
  const modelError   = tfliteModel.state === 'error';
  const statusLabel  =
    modelError                            ? '⬤ MODEL ERROR' :
    modelLoading                          ? '⬤ LOADING AI…' :
    isTracking && formAnalysis.status === 'STANDBY' ? '⬤ STANDBY · WAITING' :
    isTracking                            ? '⬤ LIVE · 60FPS SMOOTH' :
                                            '⬤ STEP INTO FRAME';
  const statusColor =
    modelError                            ? '#ef4444' :
    isTracking && formAnalysis.status === 'STANDBY' ? '#facc15' :
    isTracking                            ? Colors.primary :
                                            '#9ca3af';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{exerciseName ?? 'Form Coach'}</Text>
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.iconBtn}
        >
          <Text style={styles.iconText}>↺</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.cameraContainer, { height: cameraHeight }]}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
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
              {displayKpts.map(([cx, cy, conf], i) => {
                if (conf < CONFIDENCE_THRESHOLD) return null;
                if (i <= 4) return null;
                return (
                  <Circle
                    key={`k-${i}`}
                    cx={cx} cy={cy} r={6}
                    fill={jointColor(i)} fillOpacity={0.95}
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
            <Text style={styles.formBannerText}>⚠  {formAnalysis.issues[0]}</Text>
          </View>
        )}
        {isTracking && formAnalysis.issues.length === 0 && formAnalysis.status === 'GOOD' && (
          <View style={[styles.formBanner, styles.formBannerGood]}>
            <Text style={styles.formBannerText}>✓  FORM LOOKS SOLID — keep going</Text>
          </View>
        )}
        {isTracking && formAnalysis.status === 'STANDBY' && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <Text style={styles.formBannerText}>⏸  STANDBY — start your set to begin form check</Text>
          </View>
        )}
        {!isTracking && !modelLoading && !modelError && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <Text style={styles.formBannerText}>📷  STEP INTO FRAME — full body visible</Text>
          </View>
        )}
        {modelLoading && (
          <View style={[styles.formBanner, styles.formBannerNeutral]}>
            <Text style={styles.formBannerText}>⏳  LOADING POSE MODEL…</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.feedbackPanel} contentContainerStyle={styles.feedbackContent}>
        {canAccess('video_review') && (
          <TouchableOpacity
            style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}
            onPress={() => router.push('/video-review' as any)}
          >
            <Text style={{ fontFamily: Fonts.display, fontSize: 11, color: Colors.bg, letterSpacing: 1 }}>
              📹 RECORD & REVIEW
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.cueBtn, !canCallCue && styles.cueBtnDisabled]}
          onPress={handleGetCoachCue}
          disabled={!canCallCue}
          activeOpacity={0.85}
        >
          <Text style={styles.cueBtnText}>
            {cooldownLeft > 0
              ? `✦  ASK ${claudePersonaLabel.split(' ')[0]} AGAIN (${cooldownLeft}s)`
              : `✦  ASK ${claudePersonaLabel.split(' ')[0]} FOR A CUE`}
          </Text>
        </TouchableOpacity>

        {aiFeedback && (
          <View style={styles.cueCard}>
            <Text style={styles.cueLabel}>✦ {claudePersonaLabel}</Text>
            <Text style={styles.cueText}>{aiFeedback}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>FORM CUES — {(exerciseName ?? '').toUpperCase()}</Text>
        {libraryCheckpoints.length > 0
          ? libraryCheckpoints.map((cp, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipPhase}>{cp.phase.slice(0, 3).toUpperCase()}</Text>
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
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>COMMON MISTAKES</Text>
            {libraryMistakes.map((m, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.mistakeBullet}>✗</Text>
                <Text style={styles.tipText}>{m}</Text>
              </View>
            ))}
          </>
        )}

        {libraryBreathing && (
          <View style={styles.breathCard}>
            <Text style={styles.breathLabel}>BREATHING</Text>
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
  iconText: { fontSize: 18, color: '#fff' },
  title: { fontSize: 15, fontFamily: Fonts.display, color: '#fff', flex: 1, textAlign: 'center' },

  cameraContainer: { width: '100%', overflow: 'hidden', backgroundColor: '#0d0f11' },

  statusPill: {
    position: 'absolute', top: 10, left: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, borderWidth: 1,
  },
  statusText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2 },

  formBanner: {
    position: 'absolute', top: 10, right: 10, maxWidth: '70%',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1,
  },
  formBannerGood:    { backgroundColor: 'rgba(0,224,164,0.18)', borderColor: '#00e0a4' },
  formBannerBad:     { backgroundColor: 'rgba(239,68,68,0.22)', borderColor: '#ef4444' },
  formBannerNeutral: { backgroundColor: 'rgba(0,0,0,0.65)',     borderColor: 'rgba(255,255,255,0.15)' },
  formBannerText:    { fontFamily: Fonts.bodySemi, fontSize: 11, color: '#fff', letterSpacing: 0.3 },

  permissionText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text, textAlign: 'center' },
  permissionBtn: {
    marginTop: 18, backgroundColor: Colors.primary,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 4,
  },
  permissionBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accentInk, letterSpacing: 1 },

  feedbackPanel: { flex: 1, backgroundColor: '#111' },
  feedbackContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },

  cueBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center',
  },
  cueBtnDisabled: { opacity: 0.45 },
  cueBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accentInk, letterSpacing: 1 },

  cueCard: {
    backgroundColor: 'rgba(223,255,31,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(223,255,31,0.2)', borderRadius: 6, padding: 14,
  },
  cueLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary, letterSpacing: 1.4, marginBottom: 6 },
  cueText:  { fontFamily: Fonts.body, fontSize: 13, color: '#e5e7eb', lineHeight: 20, fontStyle: 'italic' },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginTop: 8,
  },
  tipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  tipBullet: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.primary, marginTop: 1 },
  tipPhase: {
    fontFamily: Fonts.mono, fontSize: 8, color: Colors.primary,
    letterSpacing: 0.8, marginTop: 4, minWidth: 28,
  },
  mistakeBullet: { fontFamily: Fonts.mono, fontSize: 11, color: '#ef4444', marginTop: 2 },
  tipText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: '#e5e7eb', lineHeight: 20 },

  breathCard: {
    backgroundColor: 'rgba(223,255,31,0.06)',
    borderLeftWidth: 2, borderLeftColor: Colors.primary,
    borderRadius: 4, padding: 12, marginTop: 10,
  },
  breathLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.primary, letterSpacing: 1.4, marginBottom: 5 },
  breathText:  { fontFamily: Fonts.body, fontSize: 12, color: '#e5e7eb', lineHeight: 18, fontStyle: 'italic' },

  disclaimer: {
    fontFamily: Fonts.mono, fontSize: 9, color: '#6b7280',
    textAlign: 'center', marginTop: 16, letterSpacing: 0.5, fontStyle: 'italic',
  },
});
