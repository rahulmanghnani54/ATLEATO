/**
 * VISION ENGINE — the single entry point form-coach talks to.
 *
 * The layers below this file are each pure and each ignorant of the others.
 * Wiring them by hand at the call site is how the original failure happened:
 * the screen judged elbows it had never established it could see, because
 * "detect pose" fed "judge form" directly with nothing in between.
 *
 * The order here IS the safety property, so it lives in one place:
 *
 *   quality -> calibration -> normalize -> state machine -> checks -> decision
 *
 * Two hard rules the orchestration enforces, neither of which any single layer
 * can enforce alone:
 *
 *  1. While calibration is incomplete there are NO reps and NO findings. The
 *     state machine is not even ticked, so it cannot bank a rep out of the
 *     frames collected before a body scale existed. Every biomechanical
 *     threshold is body-relative; without a scale they are all meaningless, and
 *     biomechanics' own `toBodyUnits` falls back to raw pixels rather than
 *     erroring — which would trip every check at once.
 *  2. When `quality.canJudge` is false the state machine is still ticked, but
 *     with a null angle. Null cannot advance a phase, so no rep can be born
 *     from an unseeable body; and ticking (rather than skipping) keeps the
 *     machine's dropout clock running, so a rep already in progress is
 *     abandoned instead of being completed across the blackout. Silently not
 *     calling update() is what let 7 reps appear before the lifter was in frame.
 *
 * Pure: no React, no camera, no timers, no I/O. The caller owns the clock and
 * passes camera frame timestamps, so the whole engine replays against recorded
 * landmark data instead of being validated by 26-minute device builds.
 */

import { Calibrator, normalize, type BodyCalibration, type Kpt } from './calibration';
import { getProfile, runChecks, type ExerciseProfile, type FormFinding } from './biomechanics';
import { ExerciseStateMachine, type RepPhase, type RepResult } from './exerciseState';
import { FormDecider, type FormVerdict } from './formDecision';
import type { FormFinding as DecisionFinding, RepPhase as DecisionPhase } from './formDecision';
import { assessPoseQuality, SkeletonLock, type PoseQuality } from './poseQuality';

export { anatomyPlausible, jointConfidenceTier, SkeletonLock } from './poseQuality';
export type { GroupQuality, JointGroup, PoseQuality } from './poseQuality';
export type { BodyCalibration, Kpt } from './calibration';
export type { ExerciseProfile, FormCheck, FormFinding } from './biomechanics';
export type { PhaseEvent, RepPhase, RepResult } from './exerciseState';
export type { FormSeverity, FormVerdict } from './formDecision';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning
// ─────────────────────────────────────────────────────────────────────────────

/** Landmark confidence below which a joint may not contribute to the rep angle. */
const MIN_ANGLE_CONF = 0.5;

/**
 * A cycle faster than this is a landmark twitching across a threshold, not a
 * rep. The phantom counts on device arrived in bursts far quicker than any
 * loaded repetition; nothing under this floor is credited.
 */
const MIN_REP_MS = 700;

/** Shown while the body scale is still being measured. */
const CALIBRATING_ADVICE = 'Hold still for a moment so I can measure your frame.';

/**
 * Shown when pose quality is satisfied but no single limb chain is readable
 * end-to-end — e.g. a shoulder visible on one side and the elbow only on the
 * other. Nothing about the movement can be measured from that, so it is a
 * positioning problem, not a form problem.
 */
const LIMB_UNREADABLE_ADVICE = 'Turn slightly so one whole side of your body stays in view.';

/** Landmark bar for the end-position shape test — matches form-coach's repShapeValid. */
const SHAPE_CONF = 0.3;

/** BlazePose / MLKit indices, mirrored from app/form-coach.tsx. */
const KP = {
  l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13, r_elbow: 14,
  l_wrist: 15, r_wrist: 16,
  l_hip: 23, r_hip: 24,
  l_knee: 25, r_knee: 26,
  l_ankle: 27, r_ankle: 28,
} as const;

type Triple = readonly [number, number, number];

/** Left chain then right chain, matching biomechanics' ANGLE_CHAIN exactly. */
const ANGLE_CHAINS: Record<ExerciseProfile['primaryAngle'], readonly [Triple, Triple]> = {
  elbow: [[KP.l_shoulder, KP.l_elbow, KP.l_wrist], [KP.r_shoulder, KP.r_elbow, KP.r_wrist]],
  knee: [[KP.l_hip, KP.l_knee, KP.l_ankle], [KP.r_hip, KP.r_knee, KP.r_ankle]],
  hip: [[KP.l_shoulder, KP.l_hip, KP.l_knee], [KP.r_shoulder, KP.r_hip, KP.r_knee]],
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional injection point for the end-position geometry test that already
 * lives in app/form-coach.tsx (`repShapeValid`). Supplying it keeps that logic
 * in one place instead of being reimplemented here; omitting it falls back to
 * the visibility-only gate below.
 */
export type ShapeGate = (kpts: Kpt[], phase: RepPhase, angle: number | null) => boolean;

export interface VisionFrameResult {
  quality: PoseQuality;
  calibration: BodyCalibration | null;
  calibrating: boolean;
  calibrationProgress: number;
  phase: RepPhase;
  completedRep: RepResult | null;
  verdict: FormVerdict;
  /**
   * Landmarks in torso units about the mid-shoulder origin, or null while
   * uncalibrated. Offered for overlays and logging: the checks themselves read
   * RAW pixels, because they divide by calibrated pixel dimensions internally.
   */
  normalized: Kpt[] | null;
}

interface AngleRead {
  deg: number;
  conf: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Interior angle at the middle landmark, or null if any of the three is unusable. */
function readSide(kpts: Kpt[], chain: Triple): AngleRead | null {
  let conf = 1;
  const ps: Kpt[] = [];
  for (let i = 0; i < chain.length; i++) {
    const k = kpts[chain[i]];
    if (!k || !isNum(k[0]) || !isNum(k[1]) || !isNum(k[2])) return null;
    if (k[2] < MIN_ANGLE_CONF) return null;
    if (k[2] < conf) conf = k[2];
    ps.push(k);
  }
  const [a, b, c] = ps;
  const rad = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(a[1] - b[1], a[0] - b[0]);
  let deg = Math.abs(rad * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return isNum(deg) ? { deg, conf } : null;
}

/**
 * Severity vocabularies differ between the layers by design: biomechanics
 * grades a fault, formDecision grades an interruption. Mapping explicitly here
 * beats letting 'warn' fall through formDecision's unknown-value default, which
 * would quietly demote every warning to the mildest weight it has.
 */
const SEVERITY_MAP = { info: 'info', warn: 'major', critical: 'critical' } as const;

function toDecisionFinding(f: FormFinding): DecisionFinding {
  // `joints` rides along untouched so overlay code downstream keeps the
  // skeleton indices the check actually used.
  return { ...f, severity: SEVERITY_MAP[f.severity] };
}

/**
 * 'start' (armed at extension, no rep begun) has no counterpart in the decision
 * layer's vocabulary. 'setup' is its honest equivalent: both mean "standing
 * ready", and both are coachable moments.
 */
function toDecisionPhase(phase: RepPhase): DecisionPhase {
  return phase === 'start' ? 'setup' : phase;
}

/**
 * Fallback end-position gate, used only when the caller injects none.
 *
 * The previous fallback was `return true`, i.e. no gate at all — and the state
 * machine's `shapeOk` argument is the ONLY thing standing between a valid-looking
 * angle cycle and a counted rep. Replayed against the recorded desk-fidget motion
 * (hands resting on a desk, a textbook 95->160deg elbow cycle) the no-gate default
 * counted 18 reps in 30 seconds. That is the exact failure this engine exists to
 * prevent, arriving through its own default.
 *
 * The rule is deliberately the weakest one that is universally true for a
 * pressing or pulling motion: the hand finishes on the far side of the elbow from
 * the ground. It is NOT the stricter wrist-above-SHOULDER test, which would read
 * as a lockout failure on a bench press filmed from the side and lock out a real
 * lifter — losing tracking mid-set is as damaging as a phantom rep. Callers who
 * can see the camera angle should inject the stricter gate.
 *
 * Absent landmarks mean no evidence, and no evidence never rejects a rep.
 */
function defaultShapeGate(category: string | undefined): ShapeGate | null {
  const key = (category ?? '').trim().toLowerCase();
  if (key !== 'press' && key !== 'pull') return null;

  return (kpts: Kpt[]): boolean => {
    const usable = (i: number): Kpt | null => {
      const k = kpts[i];
      return k && isNum(k[0]) && isNum(k[1]) && isNum(k[2]) && k[2] >= SHAPE_CONF ? k : null;
    };
    const le = usable(KP.l_elbow);
    const lw = usable(KP.l_wrist);
    const re = usable(KP.r_elbow);
    const rw = usable(KP.r_wrist);
    const leftOk = le && lw ? lw[1] < le[1] : null;
    const rightOk = re && rw ? rw[1] < re[1] : null;
    if (leftOk === null && rightOk === null) return true;
    return Boolean(leftOk || rightOk);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VisionEngine
// ─────────────────────────────────────────────────────────────────────────────

export class VisionEngine {
  private category: string | undefined;
  private profile: ExerciseProfile;
  private machine: ExerciseStateMachine;
  private readonly calibrator = new Calibrator();
  private readonly decider = new FormDecider();
  /**
   * Runs ahead of the quality gate, not beside it: "can I see the joints" is
   * unanswerable until "is this a body at all" is settled, and only a run of
   * frames can settle that.
   */
  private readonly lock = new SkeletonLock();
  private readonly shapeGate: ShapeGate | null;
  /** Used only when no gate was injected — see defaultShapeGate. */
  private autoGate: ShapeGate | null;
  /** Last usable timestamp, so a malformed frame clock cannot rewind the engine. */
  private lastT = 0;

  constructor(category: string | undefined, shapeGate?: ShapeGate) {
    this.category = category;
    this.profile = getProfile(category);
    this.machine = this.buildMachine();
    this.shapeGate = shapeGate ?? null;
    this.autoGate = defaultShapeGate(category);
  }

  /**
   * Switching exercise invalidates the rep cycle and the coaching evidence, but
   * NOT the body scale: the lifter's torso is the same length in the next set,
   * and re-measuring it would blank the coach for another second for nothing.
   */
  setCategory(c: string | undefined): void {
    if (c === this.category) return;
    this.category = c;
    this.profile = getProfile(c);
    this.machine = this.buildMachine();
    this.autoGate = defaultShapeGate(c);
    this.decider.reset();
  }

  process(kpts: Kpt[], tMs: number, viewW: number, viewH: number): VisionFrameResult {
    const safe = Array.isArray(kpts) ? kpts : [];
    const t = isNum(tMs) ? tMs : this.lastT;
    this.lastT = t;

    // ── 1. Is this a body, and can we see it? ─────────────────────────────
    const skeletonTrusted = this.lock.push(safe);
    const quality = assessPoseQuality(safe, this.category, viewW, viewH, { skeletonTrusted });

    // ── 2. Body scale. Calibrator self-gates on confident shoulders+hips and
    //       on a non-degenerate torso, so a folded skeleton contributes nothing.
    //       Untrusted frames are withheld entirely: a scale measured off a hand
    //       is worse than no scale, because every body-relative threshold
    //       downstream would then be wrong while looking calibrated.
    if (skeletonTrusted) this.calibrator.push(safe);
    const calibration = this.calibrator.get();
    const calibrationProgress = this.calibrator.progress();

    if (!calibration || !calibration.complete) {
      // Deliberately reported as un-judgeable rather than as a clean sheet: with
      // no findings the decider would otherwise hand back a confident 100, which
      // is a claim about form made before the body had even been measured.
      const verdict = this.decider.update(
        {
          overall: quality.overall,
          canJudge: false,
          advice: quality.advice ?? CALIBRATING_ADVICE,
        },
        [],
        'idle',
        t,
      );
      return {
        quality,
        calibration,
        calibrating: true,
        calibrationProgress,
        phase: this.machine.phase,
        completedRep: null,
        verdict,
        normalized: null,
      };
    }

    // ── 3. Normalize (for overlays/logging; the checks below read raw px). ──
    const normalized = normalize(safe, calibration);

    // ── 4. Rep cycle. The angle comes from the CLEAREST side, the same side
    //       biomechanics reads, so the phase and the findings always describe
    //       the same limb rather than silently disagreeing.
    const chains = ANGLE_CHAINS[this.profile.primaryAngle];
    const left = readSide(safe, chains[0]);
    const right = readSide(safe, chains[1]);
    const best = !left ? right : !right ? left : right.conf > left.conf ? right : left;

    // NaN, not 0, when only one side is visible: 0 would assert perfect
    // symmetry about a limb we never saw. NaN compares false everywhere
    // downstream, so an unknown never masquerades as a measurement.
    const symmetry = left && right ? Math.abs(left.deg - right.deg) : NaN;

    const judgeable = quality.canJudge && best !== null;
    const angle = judgeable && best ? best.deg : null;
    const shapeOk = judgeable && this.shapeOk(safe, angle);

    const completedRep = this.machine.update(angle, t, symmetry, shapeOk);
    const phase = this.machine.phase;

    // ── 5. Phase-scoped biomechanics, only on a body we can actually see. ──
    const findings = judgeable ? runChecks(this.profile, safe, calibration, phase) : [];

    // ── 6. Confidence-gated decision: what, if anything, to say. ──────────
    //
    // `judgeable`, not `quality.canJudge`. Pose quality asks each joint GROUP for
    // one usable member, so it can be satisfied by a shoulder seen on the left and
    // an elbow seen only on the right — a pose from which no limb chain, and
    // therefore no movement, can be measured at all. The checks correctly emit
    // nothing there, and an empty findings list is exactly what the decider reads
    // as flawless form: measured, that pose reported a confident 100/100 on 702
    // consecutive frames. Silence from the checks means "no view", never "good
    // form", so the gate has to hear about it.
    const verdict = this.decider.update(
      judgeable
        ? quality
        : { overall: quality.overall, canJudge: false, advice: quality.advice ?? LIMB_UNREADABLE_ADVICE },
      findings.map(toDecisionFinding),
      toDecisionPhase(phase),
      t,
    );

    return {
      quality,
      calibration,
      calibrating: false,
      calibrationProgress,
      phase,
      completedRep,
      verdict,
      normalized,
    };
  }

  /**
   * Tracking lost. Drops the rep in progress and keeps the count; the machine
   * returns to 'setup', so the lifter must be seen back at extension before
   * another rep can begin. Coaching cooldowns survive on purpose — a dropout is
   * not a reason to repeat a cue the user just heard.
   */
  abandon(): void {
    this.machine.abandon();
  }

  reset(): void {
    this.machine.reset();
    this.decider.reset();
    this.calibrator.reset();
    this.lock.reset();
    this.lastT = 0;
  }

  get repCount(): number {
    return this.machine.count;
  }

  get reps(): RepResult[] {
    return this.machine.reps;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private buildMachine(): ExerciseStateMachine {
    const { low, high, minRom } = this.profile.thresholds;
    return new ExerciseStateMachine({
      lowThreshold: low,
      highThreshold: high,
      minRepMs: MIN_REP_MS,
      minRom,
    });
  }

  /**
   * Whether the frame's geometry is sound enough to credit a rep. An injected
   * gate always wins; otherwise `defaultShapeGate` supplies the minimum
   * end-position test for the category, because "no gate" means every valid-
   * looking angle cycle becomes a rep whether or not it was the exercise.
   */
  private shapeOk(kpts: Kpt[], angle: number | null): boolean {
    const gate = this.shapeGate ?? this.autoGate;
    if (!gate) return true;
    return gate(kpts, this.machine.phase, angle);
  }
}
