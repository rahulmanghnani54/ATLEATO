/**
 * BIOMECHANICS — per-exercise profiles and phase-aware form checks.
 *
 * One universal form algorithm cannot serve a squat and a curl, so each exercise
 * declares the joints it needs, the angle that defines its rep, and which checks
 * run in which phase. Three rules hold throughout:
 *
 *  1. Nothing is judged in raw pixels or bare absolute angles — every measurement
 *     is divided by a calibrated body dimension, so a lifter 1m from the lens and
 *     one 4m away produce the same number. Device video of a seated press showed
 *     shoulder span swinging 11->83px frame to frame while torso length held
 *     steady (CV 0.06): pixel thresholds measure the camera, not the body.
 *  2. Every finding carries its OWN confidence, taken from the landmarks that
 *     check actually used — its weakest one, because a chain is only as good as
 *     the joint we are least sure we can see. The app said "ELBOWS TOO WIDE"
 *     while the founder's hands rested on a desk; the elbows were never reliably
 *     visible, and nothing downstream could tell, because the verdict arrived
 *     with no confidence attached.
 *  3. Checks are phase-scoped. Elbow flare is a fault at the BOTTOM of a press and
 *     meaningless at the top; lockout is the reverse.
 *
 * Pure functions over landmark frames — no React, no camera, no side effects — so
 * the engine can be replayed against recorded video instead of device builds.
 *
 * Torso-relative distances go through calibration's own `toBodyUnits`, so this
 * module never re-derives a normaliser that already exists.
 */

import { toBodyUnits, type BodyCalibration, type Kpt } from './calibration';
import type { RepPhase } from './exerciseState';

// BlazePose / MLKit 33-landmark indices, mirrored from app/form-coach.tsx.
const KP = {
  l_ear: 7, r_ear: 8,
  l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13, r_elbow: 14,
  l_wrist: 15, r_wrist: 16,
  l_hip: 23, r_hip: 24,
  l_knee: 25, r_knee: 26,
  l_ankle: 27, r_ankle: 28,
} as const;

export interface FormFinding {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  /** What to DO, imperative, one sentence. Never a diagnosis, never alarming. */
  message: string;
  /** KP indices to highlight on the skeleton overlay. */
  joints: number[];
  /** 0..1 — how sure we are THIS finding is real, from the joints it used. */
  confidence: number;
}

export interface FormCheck {
  id: string;
  /** Only runs during these phases. */
  phases: RepPhase[];
  run(kpts: Kpt[], cal: BodyCalibration, phase: RepPhase): FormFinding | null;
}

export interface ExerciseProfile {
  category: string;
  requiredJoints: number[];
  /** `low`/`high` bound the rep's angle cycle; `minRom` is the sweep a rep must cover. */
  thresholds: { low: number; high: number; minRom: number };
  primaryAngle: 'elbow' | 'knee' | 'hip';
  checks: FormCheck[];
}

// ── Geometry primitives ──────────────────────────────────────────────────────

/** Below this a landmark is a guess, and a check built on it must not speak. */
const MIN_JOINT_CONF = 0.35;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** A body scale in pixels. Guards a zero/NaN unit from making every normalized
 *  ratio infinite, which would fire every check at once. */
const scale = (v: unknown): number | null => {
  const n = finite(v);
  return n != null && n > 1 ? n : null;
};

/** A landmark, or null when it is missing or too weak to build a verdict on. */
function pt(kpts: Kpt[], i: number): Kpt | null {
  const k = kpts[i];
  if (!k || finite(k[0]) == null || finite(k[1]) == null) return null;
  return finite(k[2]) != null && k[2] >= MIN_JOINT_CONF ? k : null;
}

/** A chain is exactly as trustworthy as the joint we are least sure we can see. */
function weakest(parts: (Kpt | null)[]): number {
  let lo = 1;
  for (const p of parts) {
    if (!p) return 0;
    lo = Math.min(lo, clamp01(p[2]));
  }
  return lo;
}

/** Interior angle at joint `b`, degrees. Confidence is handled separately, so
 *  this deliberately does not gate on it. */
function angleAt(a: Kpt, b: Kpt, c: Kpt): number | null {
  const rad = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(a[1] - b[1], a[0] - b[0]);
  let deg = Math.abs(rad * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return Number.isFinite(deg) ? deg : null;
}

/** Midpoint of the visible members of a landmark group. */
function centroid(kpts: Kpt[], group: readonly number[]): Kpt | null {
  const ps = group.map((i) => pt(kpts, i)).filter((p): p is Kpt => p !== null);
  if (ps.length === 0) return null;
  return [
    ps.reduce((s, p) => s + p[0], 0) / ps.length,
    ps.reduce((s, p) => s + p[1], 0) / ps.length,
    Math.min(...ps.map((p) => p[2])),
  ];
}

/** Body midline plus the calibrated denominators every check divides by. */
interface Frame {
  midX: number;
  /** px -> torso units, via calibration's own normaliser. */
  u: (px: number) => number;
  /** px, calibrated shoulder width — the denominator for lateral limb offsets. */
  sw: number;
  /** px, calibrated shin length. NaN when the legs were never seen, which makes
   *  knee geometry silently unmeasurable — the correct outcome, not a failure. */
  shin: number;
}

/**
 * Null unless the calibration is `complete` and the torso is actually in frame.
 * That gate matters: calibration's `toBodyUnits` deliberately falls back to a
 * divisor of 1 for a degenerate profile, so an incomplete calibration would hand
 * back RAW PIXELS wearing the units of a normalized ratio — and every threshold
 * in this file would trip at once. Before calibration settles there is no body
 * scale, so there is no body-relative measurement to make.
 */
function frameOf(kpts: Kpt[], cal: BodyCalibration): Frame | null {
  if (!cal || !cal.complete) return null;
  const anchors = [KP.l_shoulder, KP.r_shoulder, KP.l_hip, KP.r_hip]
    .map((i) => pt(kpts, i))
    .filter((p): p is Kpt => p !== null);
  if (anchors.length < 2) return null;

  const sw = scale(cal.shoulderWidth);
  if (scale(cal.scale) == null || sw == null) return null;

  return {
    midX: anchors.reduce((s, p) => s + p[0], 0) / anchors.length,
    u: (px: number) => toBodyUnits(px, cal),
    sw,
    shin: scale(cal.shinLen) ?? NaN,
  };
}

/** Which way is "away from the midline" for this limb. Robust to a mirrored front
 *  camera, where the left-hand landmarks can render on either side. */
const outward = (x: number, midX: number): number => (x < midX ? -1 : 1);

/** `[infoAt, warnAt, critAt]` in the same body-relative unit the check measures.
 *  Below infoAt the check stays silent. A band whose critAt is Infinity can never
 *  escalate: a shallow squat is a progression note, not a hazard. */
type Band = [number, number, number];

function severityFor(v: number, [, warnAt, critAt]: Band): FormFinding['severity'] {
  if (v >= critAt) return 'critical';
  if (v >= warnAt) return 'warn';
  return 'info';
}

/** A finding nobody can trust is noise, not caution — dropped here rather than
 *  leaving every consumer to remember it. */
function emit(
  id: string, severity: FormFinding['severity'], message: string,
  joints: number[], confidence: number,
): FormFinding | null {
  const c = clamp01(confidence);
  return c > 0 ? { id, severity, message, joints, confidence: c } : null;
}

// ── Check factories ──────────────────────────────────────────────────────────
//
// Nearly every check is one of two shapes: measure the same thing on both sides
// and report the worse one, or measure once across landmark groups. Both take a
// `measure` returning HOW FAR PAST NEUTRAL the body is in body-relative units —
// higher is always worse, whatever the underlying geometry.

/** Per-side check reporting the WORST side, never the average: averaging hides one
 *  collapsing knee behind a good one. A side whose landmarks are occluded is
 *  skipped, not counted as passing — a side-on view legitimately hides one arm. */
function sideCheck(
  id: string, phases: RepPhase[], chains: readonly (readonly number[])[],
  measure: (ps: Kpt[], f: Frame) => number, band: Band, message: string,
): FormCheck {
  return {
    id,
    phases,
    run(kpts, cal) {
      const f = frameOf(kpts, cal);
      if (!f) return null;

      let worst: { mag: number; conf: number; joints: number[] } | null = null;
      for (const chain of chains) {
        const ps = chain.map((i) => pt(kpts, i));
        if (ps.some((p) => p === null)) continue;
        const conf = weakest(ps);
        if (conf < MIN_JOINT_CONF) continue;
        const mag = measure(ps as Kpt[], f);
        if (!Number.isFinite(mag)) continue;
        if (!worst || mag > worst.mag) worst = { mag, conf, joints: [...chain] };
      }

      if (!worst || worst.mag < band[0]) return null;
      return emit(id, severityFor(worst.mag, band), message, worst.joints, worst.conf);
    },
  };
}

/** Whole-body check. Each group collapses to its midpoint, so this still runs when
 *  only one shoulder or one hip is visible. */
function bodyCheck(
  id: string, phases: RepPhase[], groups: readonly (readonly number[])[],
  measure: (ms: Kpt[], f: Frame) => number, band: Band, message: string,
): FormCheck {
  return {
    id,
    phases,
    run(kpts, cal) {
      const f = frameOf(kpts, cal);
      if (!f) return null;
      const ms = groups.map((g) => centroid(kpts, g));
      if (ms.some((m) => m === null)) return null;
      const conf = weakest(ms);
      if (conf < MIN_JOINT_CONF) return null;

      const mag = measure(ms as Kpt[], f);
      if (!Number.isFinite(mag) || mag < band[0]) return null;
      return emit(id, severityFor(mag, band), message, groups.flatMap((g) => [...g]), conf);
    },
  };
}

/** The joint triples defining each primary angle, left side then right. */
const ANGLE_CHAIN: Record<ExerciseProfile['primaryAngle'], readonly (readonly number[])[]> = {
  elbow: [[KP.l_shoulder, KP.l_elbow, KP.l_wrist], [KP.r_shoulder, KP.r_elbow, KP.r_wrist]],
  knee: [[KP.l_hip, KP.l_knee, KP.l_ankle], [KP.r_hip, KP.r_knee, KP.r_ankle]],
  hip: [[KP.l_shoulder, KP.l_hip, KP.l_knee], [KP.r_shoulder, KP.r_hip, KP.r_knee]],
};

interface AngleRead { deg: number; conf: number; joints: number[]; }

/** Read a joint angle from one side. `pick` decides which side wins when both are
 *  visible — best-seen for range checks, most-flexed to find a lunge's front leg. */
function readAngle(
  kpts: Kpt[], kind: ExerciseProfile['primaryAngle'], pick: 'clearest' | 'flexed',
): AngleRead | null {
  let best: AngleRead | null = null;
  for (const chain of ANGLE_CHAIN[kind]) {
    const ps = chain.map((i) => pt(kpts, i));
    if (ps.some((p) => p === null)) continue;
    const [a, b, c] = ps as Kpt[];
    const deg = angleAt(a, b, c);
    if (deg == null) continue;
    const cand: AngleRead = { deg, conf: weakest(ps), joints: [...chain] };
    if (!best || (pick === 'flexed' ? cand.deg < best.deg : cand.conf > best.conf)) best = cand;
  }
  return best;
}

/** Did the joint finish the rep? `endDeg` is the profile's own lockout target, so
 *  this stays relative to the exercise instead of asserting that some absolute
 *  angle is universally correct. Short range is a coaching note — capped at warn. */
function endRangeCheck(
  id: string, phases: RepPhase[], kind: ExerciseProfile['primaryAngle'],
  endDeg: number, message: string,
): FormCheck {
  return {
    id,
    phases,
    run(kpts, cal) {
      const f = frameOf(kpts, cal);
      if (!f) return null;
      const a = readAngle(kpts, kind, 'clearest');
      if (!a) return null;
      const short = endDeg - a.deg;
      if (short < 8) return null;
      return emit(id, short >= 26 ? 'warn' : 'info', message, a.joints, a.conf);
    },
  };
}

// ── Shared measurements ──────────────────────────────────────────────────────

const L = {
  sh: [KP.l_shoulder, KP.r_shoulder], hip: [KP.l_hip, KP.r_hip],
  knee: [KP.l_knee, KP.r_knee], ankle: [KP.l_ankle, KP.r_ankle],
  ear: [KP.l_ear, KP.r_ear],
} as const;

/** Horizontal offset between two body points in TORSO LENGTHS — the one dimension
 *  that stayed stable across the device recordings, so the honest denominator. */
const leanBy = ([a, b]: Kpt[], f: Frame) => f.u(Math.abs(a[0] - b[0]));

/** Horizontal offset in SHOULDER-WIDTHS. Calibration profiles no hip width, and
 *  guessing one from the live frame would reintroduce exactly the unstable span
 *  the calibration layer exists to replace. */
const shiftBySpan = ([a, b]: Kpt[], f: Frame) => Math.abs(a[0] - b[0]) / f.sw;

/** Torso stacked over the hips. Shared by five exercises at different tolerances,
 *  because a squat legitimately pitches forward far more than a curl ever should.
 *
 *  `uprightOnly` silences the check when the torso is closer to horizontal than
 *  vertical. "Shoulders over hips" is a statement about an UPRIGHT lifter; a bench
 *  press, push-up, floor press or bent-over row has no stack to keep, and the
 *  lean of a lying torso reads ~1.0 torso lengths against a critAt of 0.38 — a
 *  critical "keep your shoulders over your hips" on every single bench rep. The
 *  same profile has to serve the overhead press and the bench, so the check
 *  decides per frame which one it is looking at. Squat and lunge keep the
 *  unconditional form: a torso past 45deg there IS the fault. */
const torsoStack = (
  id: string, phases: RepPhase[], band: Band, message: string, uprightOnly = false,
) =>
  bodyCheck(id, phases, [L.sh, L.hip], ([sh, hip], f) => {
    if (uprightOnly && Math.abs(sh[0] - hip[0]) >= Math.abs(sh[1] - hip[1])) return NaN;
    return leanBy([sh, hip], f);
  }, band, message);

// ── Profiles ─────────────────────────────────────────────────────────────────

const PRESS_TH = { low: 100, high: 150, minRom: 45 };
const CURL_TH = { low: 90, high: 140, minRom: 40 };
const SQUAT_TH = { low: 110, high: 155, minRom: 45 };
// Hip-hinge dominant, so the rep is driven by the HIP angle, not the knee — which
// is why this band differs from the knee-based squat band by design.
const DEADLIFT_TH = { low: 100, high: 162, minRom: 50 };
const PULL_TH = { low: 100, high: 150, minRom: 45 };
const LUNGE_TH = { low: 110, high: 155, minRom: 45 };

const ARM_JOINTS = [
  KP.l_shoulder, KP.r_shoulder, KP.l_elbow, KP.r_elbow,
  KP.l_wrist, KP.r_wrist, KP.l_hip, KP.r_hip,
];
const LEG_JOINTS = [
  KP.l_shoulder, KP.r_shoulder, KP.l_hip, KP.r_hip,
  KP.l_knee, KP.r_knee, KP.l_ankle, KP.r_ankle,
];

export const PROFILES: Record<string, ExerciseProfile> = {
  press: {
    category: 'press',
    requiredJoints: ARM_JOINTS,
    thresholds: PRESS_TH,
    primaryAngle: 'elbow',
    checks: [
      // Bottom only, where the shoulder is loaded in external rotation. At lockout
      // the elbows are SUPPOSED to travel outward, so the same number means nothing.
      sideCheck('press.elbow_flare', ['eccentric', 'bottom'],
        [[KP.l_shoulder, KP.l_elbow], [KP.r_shoulder, KP.r_elbow]],
        // Elbow's lateral offset outside its own shoulder, in shoulder-widths.
        ([s, e], f) => ((e[0] - s[0]) * outward(s[0], f.midX)) / f.sw,
        [0.5, 0.62, 0.95], 'Bring your elbows slightly forward under the bar.'),
      sideCheck('press.wrist_stack', ['concentric', 'top'],
        [[KP.l_elbow, KP.l_wrist], [KP.r_elbow, KP.r_wrist]],
        ([e, w], f) => Math.abs(w[0] - e[0]) / f.sw,
        [0.3, 0.38, 0.58], 'Stack your wrists directly over your elbows.'),
      endRangeCheck('press.lockout', ['top'], 'elbow', PRESS_TH.high,
        'Press all the way up until your arms are straight.'),
      // Upright only: the same profile judges the bench press and the push-up,
      // where the torso is horizontal by design.
      torsoStack('press.torso_stack', ['concentric', 'top'], [0.2, 0.26, 0.38],
        'Keep your ribs down and your shoulders over your hips.', true),
    ],
  },

  curl: {
    category: 'curl',
    requiredJoints: ARM_JOINTS,
    thresholds: CURL_TH,
    primaryAngle: 'elbow',
    checks: [
      // Peak contraction, where swinging the elbow forward is how the lift gets
      // stolen from the biceps.
      sideCheck('curl.elbow_drift', ['bottom'],
        [[KP.l_shoulder, KP.l_elbow], [KP.r_shoulder, KP.r_elbow]],
        // A pinned elbow hangs ~0.3 torso lengths BELOW its shoulder; that gap
        // collapses toward 0 as the elbow swings up and forward.
        ([s, e], f) => 0.2 - f.u(e[1] - s[1]),
        [0.0, 0.04, 0.13], 'Keep your elbows pinned at your sides.'),
      // Phases follow the ANGLE cycle, not gravity: for a curl 'eccentric' is the
      // elbow closing, i.e. the lift UP, which is exactly when the body swings to
      // cheat the weight. Scoping this to 'concentric' would watch the lowering
      // and miss the fault entirely.
      torsoStack('curl.body_swing', ['eccentric', 'bottom'], [0.14, 0.18, 0.28],
        'Stand tall and let your arms do the work.'),
      endRangeCheck('curl.full_extension', ['top'], 'elbow', CURL_TH.high,
        'Straighten your arms fully between reps.'),
    ],
  },

  squat: {
    category: 'squat',
    requiredJoints: LEG_JOINTS,
    thresholds: SQUAT_TH,
    primaryAngle: 'knee',
    checks: [
      bodyCheck('squat.depth', ['bottom'], [L.hip, L.knee],
        // At parallel the hip crease sits level with the knee, so this is ~0;
        // positive means the hip is still above the knee.
        ([hip, knee], f) => f.u(knee[1] - hip[1]),
        [0.12, 0.3, Infinity], 'Sit down a little deeper until your hips reach knee height.'),
      sideCheck('squat.knee_valgus', ['bottom', 'concentric'],
        [[KP.l_knee, KP.l_ankle], [KP.r_knee, KP.r_ankle]],
        // Knee collapsing INSIDE its own ankle, as a fraction of SHIN LENGTH —
        // valgus is that shin tilting, so the shin is its own honest denominator.
        // An unseen leg leaves shinLen NaN and the check simply never speaks.
        ([k, a], f) => ((a[0] - k[0]) * outward(a[0], f.midX)) / f.shin,
        [0.12, 0.18, 0.32], 'Push your knees out in line with your toes.'),
      bodyCheck('squat.hip_shift', ['bottom', 'concentric'], [L.hip, L.ankle],
        shiftBySpan, [0.25, 0.32, 0.45], 'Spread your weight evenly between both feet.'),
      torsoStack('squat.torso_pitch', ['eccentric', 'bottom', 'concentric'],
        [0.35, 0.44, 0.58], 'Keep your chest up as you sit back.'),
    ],
  },

  deadlift: {
    category: 'deadlift',
    requiredJoints: [...LEG_JOINTS, KP.l_wrist, KP.r_wrist],
    thresholds: DEADLIFT_TH,
    primaryAngle: 'hip',
    checks: [
      bodyCheck('deadlift.hip_height', ['bottom', 'concentric'], [L.sh, L.hip],
        // Vertical shoulder-to-hip separation over torso length: 1.0 is standing
        // upright, ~0.6-0.75 is a sound pull. As the hips rise the torso flattens
        // toward horizontal and this collapses toward 0.
        ([sh, hip], f) => 0.45 - f.u(hip[1] - sh[1]),
        [0.0, 0.05, 0.18], 'Drop your hips and lift your chest before you pull.'),
      sideCheck('deadlift.bar_path', ['bottom', 'concentric'],
        [[KP.l_hip, KP.l_knee, KP.l_wrist], [KP.r_hip, KP.r_knee, KP.r_wrist]],
        // Hands should track the leg line: wrist distance from the mid-thigh point.
        ([h, k, w], f) => Math.abs(w[0] - (h[0] + k[0]) / 2) / f.sw,
        [0.35, 0.44, 0.62], 'Keep the bar brushing your legs on the way up.'),
      bodyCheck('deadlift.hip_level', ['bottom'], [[KP.l_hip], [KP.r_hip]],
        ([l, r], f) => Math.abs(l[1] - r[1]) / f.sw,
        [0.22, 0.27, 0.4], 'Set your hips level before you pull.'),
      endRangeCheck('deadlift.lockout', ['top'], 'hip', DEADLIFT_TH.high,
        'Finish tall with your hips all the way through.'),
    ],
  },

  pull: {
    category: 'pull',
    requiredJoints: ARM_JOINTS,
    thresholds: PULL_TH,
    primaryAngle: 'elbow',
    checks: [
      // 'bottom' is the bottom of the ANGLE cycle — elbows most flexed, which for a
      // pull is peak contraction.
      sideCheck('pull.elbow_drive', ['bottom'],
        [[KP.l_shoulder, KP.l_elbow], [KP.r_shoulder, KP.r_elbow]],
        // A finished pull leaves the elbow below the shoulder line.
        ([s, e], f) => 0.06 - f.u(e[1] - s[1]),
        [0.0, 0.06, Infinity], 'Drive your elbows down toward your ribs.'),
      // Shoulders ride up at the dead hang, which on the angle cycle is 'top'
      // (arms straight) and the 'concentric' return that leads into it. Ears are
      // among the weakest landmarks on the body, so this finding's confidence
      // collapses honestly when the head is turned or cropped.
      bodyCheck('pull.shoulder_pack', ['concentric', 'top'], [L.ear, L.sh],
        ([ear, sh], f) => 0.14 - f.u(sh[1] - ear[1]),
        [0.0, 0.04, 0.1], 'Pull your shoulders down away from your ears.'),
      // 'eccentric' closes the elbow — the pull itself, and where kipping shows.
      // Upright only: a bent-over or inverted row is pitched past 45deg by design,
      // and that is a set-up, not a swing.
      torsoStack('pull.torso_swing', ['eccentric', 'bottom'], [0.22, 0.28, 0.4],
        'Keep your body still and pull with your back.', true),
      endRangeCheck('pull.full_stretch', ['top'], 'elbow', PULL_TH.high,
        'Let your arms straighten at the bottom of each rep.'),
    ],
  },

  lunge: {
    category: 'lunge',
    requiredJoints: LEG_JOINTS,
    thresholds: LUNGE_TH,
    primaryAngle: 'knee',
    checks: [
      {
        id: 'lunge.shin_angle',
        phases: ['bottom'],
        run(kpts, cal) {
          const f = frameOf(kpts, cal);
          if (!f) return null;
          // The front leg is whichever knee is more flexed at the bottom.
          const front = readAngle(kpts, 'knee', 'flexed');
          if (!front) return null;
          const [, kIdx, aIdx] = front.joints;
          const k = pt(kpts, kIdx), a = pt(kpts, aIdx);
          if (!k || !a) return null;

          // How far the knee sits ahead of the ankle, in shoulder-widths. In a
          // front view this offset is naturally near zero, so the check stays quiet
          // rather than guessing at a depth it cannot see.
          const band: Band = [0.45, 0.55, 0.78];
          const travel = Math.abs(k[0] - a[0]) / f.sw;
          if (travel < band[0]) return null;
          return emit('lunge.shin_angle', severityFor(travel, band),
            'Keep your front shin more upright over your ankle.',
            [kIdx, aIdx], weakest([k, a]));
        },
      },
      {
        id: 'lunge.depth',
        phases: ['bottom'],
        run(kpts, cal) {
          const f = frameOf(kpts, cal);
          if (!f) return null;
          const front = readAngle(kpts, 'knee', 'flexed');
          if (!front) return null;
          const short = front.deg - (LUNGE_TH.low + 25);
          if (short <= 0) return null;
          return emit('lunge.depth', short >= 20 ? 'warn' : 'info',
            'Sink until your back knee is close to the floor.',
            front.joints, front.conf);
        },
      },
      bodyCheck('lunge.shoulder_level', ['bottom', 'concentric'],
        [[KP.l_shoulder], [KP.r_shoulder]],
        ([l, r], f) => Math.abs(l[1] - r[1]) / f.sw,
        [0.22, 0.28, 0.42], 'Level your shoulders as you lower.'),
      torsoStack('lunge.torso_lean', ['eccentric', 'bottom', 'concentric'],
        [0.28, 0.35, 0.48], 'Stay tall through your chest as you step down.'),
    ],
  },

  // Unknown exercise: we still know where the torso is, so pose quality and rep
  // counting can run — but we declare NO checks. Coaching a movement we cannot name
  // is exactly the failure this engine exists to prevent.
  general: {
    category: 'general',
    requiredJoints: [KP.l_shoulder, KP.r_shoulder, KP.l_hip, KP.r_hip],
    thresholds: { low: 105, high: 150, minRom: 40 },
    primaryAngle: 'elbow',
    checks: [],
  },
};

/** Never throws and never returns undefined — an unrecognised category falls back
 *  to the silent `general` profile rather than borrowing another exercise's
 *  checks, which is how a curl ends up being coached like a press. */
export function getProfile(category?: string): ExerciseProfile {
  const key = (category ?? '').trim().toLowerCase();
  return PROFILES[key] ?? PROFILES.general;
}

const SEVERITY_RANK: Record<FormFinding['severity'], number> = { critical: 3, warn: 2, info: 1 };

/**
 * Run only the checks scoped to `phase`, worst first (severity, then confidence).
 *
 * Confidence is reported, NOT applied — deciding what is sure enough to say out
 * loud belongs to the form-decision layer, which weighs these against pose quality
 * and calibration state. A check that cannot see its joints returns nothing at all,
 * so silence here means "no view", never "good form".
 */
export function runChecks(
  profile: ExerciseProfile,
  kpts: Kpt[],
  cal: BodyCalibration,
  phase: RepPhase,
): FormFinding[] {
  if (!profile || !Array.isArray(profile.checks) || !Array.isArray(kpts) || kpts.length === 0) {
    return [];
  }

  const out: FormFinding[] = [];
  for (const check of profile.checks) {
    if (!check.phases.includes(phase)) continue;
    const f = check.run(kpts, cal, phase);
    if (f) out.push(f);
  }

  return out.sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence);
}
