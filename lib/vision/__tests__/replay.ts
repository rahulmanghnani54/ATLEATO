/**
 * REPLAY HARNESS — runs the whole vision engine against synthetic landmark
 * frames instead of a gym and a 26-minute device build.
 *
 * Every module under lib/vision is a pure function over landmark frames, which
 * only pays off if something actually replays them. This file is that something:
 * it wires poseQuality -> calibration -> exerciseState -> biomechanics ->
 * formDecision in the shipping order and drives them with generators that
 * reproduce the failure signatures MEASURED ON DEVICE, not invented ones:
 *
 *   - hand held to the lens: shoulder span CV 0.42, hip span CV 0.48, torso
 *     length CV 0.06 (a real distance never varies 42% frame to frame; a torso
 *     fitted to a palm does)
 *   - desk fidgeting: a textbook elbow-angle cycle with the wrists never rising
 *     above the shoulders — the motion that counted 7 phantom reps in 28s
 *   - a clean bilateral press, as the control
 *
 * TWO PIECES OF WIRING HAVE NO PURE HOME YET and are mirrored here, marked
 * HARNESS-SUPPLIED. They are not part of lib/vision, so a replay cannot prove
 * anything about them; see the notes on each.
 *
 * Run standalone:  npx tsc --outDir <tmp> --module commonjs ... && node replay.js
 * (The repo's jest `roots` is <rootDir>/__tests__ only, so jest does not collect
 * this path today. The jest wiring at the bottom activates if that ever widens.)
 */

import { getProfile, runChecks, type FormFinding as BioFinding } from '../biomechanics';
import { Calibrator, type BodyCalibration, type Kpt } from '../calibration';
import { ExerciseStateMachine, type RepPhase } from '../exerciseState';
import {
  FormDecider,
  type FormFinding as DecisionFinding,
  type RepPhase as DecisionPhase,
} from '../formDecision';
import { assessPoseQuality, SkeletonLock } from '../poseQuality';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shape (mirrors app/form-coach.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayFrame {
  kpts: Kpt[];
  tMs: number;
}

const NUM_LANDMARKS = 33;
const VIEW_W = 720;
const VIEW_H = 1280;
const CX = VIEW_W / 2;

const KP = {
  nose: 0,
  l_eye: 2, r_eye: 5,
  l_ear: 7, r_ear: 8,
  l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13, r_elbow: 14,
  l_wrist: 15, r_wrist: 16,
  l_hip: 23, r_hip: 24,
} as const;

/** Full cycles faster than this are tracking noise, not reps (form-coach.tsx). */
const MIN_REP_MS = 900;
/** repShapeValid's landmark bar in form-coach.tsx. */
const SHAPE_CONF = 0.3;
/** biomechanics' own floor, mirrored so the harness reads angles the same way. */
const MIN_JOINT_CONF = 0.35;

// Seated-lifter skeleton. Sized so the pose box clears poseQuality's framing
// band (0.35..0.95 of view height) — a body that reads 'too_far' would confound
// every assertion with a framing complaint.
const SHOULDER_SPAN = 200;
const SHOULDER_Y = 520;
const HIP_SPAN = 150;
const HIP_Y = 820;
const FOREARM = 170;

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mirrorX = (x: number) => 2 * CX - x;

/** Deterministic PRNG — a replay that cannot be re-run is not evidence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rescale a sequence to EXACTLY zero mean and unit sd, so a requested CV is the
 *  CV the generated frames actually have rather than one they approach. */
function standardize(xs: number[]): number[] {
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
  return sd > 0 ? xs.map((v) => (v - mean) / sd) : xs.map(() => 0);
}

/** Coefficient of variation — the statistic the device logs were reported in. */
export function cv(xs: number[]): number {
  const f = xs.filter((v) => Number.isFinite(v));
  if (f.length === 0) return NaN;
  const mean = f.reduce((s, v) => s + v, 0) / f.length;
  if (mean === 0) return NaN;
  const sd = Math.sqrt(f.reduce((s, v) => s + (v - mean) ** 2, 0) / f.length);
  return sd / mean;
}

function blank(): Kpt[] {
  return Array.from({ length: NUM_LANDMARKS }, () => [0, 0, 0] as Kpt);
}

/** Head + shoulders + hips. Knees and ankles stay at confidence 0: a seated
 *  press physically cannot show legs, and poseQuality is built to accept that. */
function setTorso(k: Kpt[], c: number): void {
  k[KP.nose] = [CX, 400, c];
  k[KP.l_eye] = [CX - 20, 385, c];
  k[KP.r_eye] = [CX + 20, 385, c];
  k[KP.l_ear] = [CX - 35, 395, c];
  k[KP.r_ear] = [CX + 35, 395, c];
  k[KP.l_shoulder] = [CX - SHOULDER_SPAN / 2, SHOULDER_Y, c];
  k[KP.r_shoulder] = [CX + SHOULDER_SPAN / 2, SHOULDER_Y, c];
  k[KP.l_hip] = [CX - HIP_SPAN / 2, HIP_Y, c];
  k[KP.r_hip] = [CX + HIP_SPAN / 2, HIP_Y, c];
}

function jitter(k: Kpt[], amount: number, rnd: () => number): void {
  if (amount <= 0) return;
  for (let i = 0; i < k.length; i++) {
    if (k[i][2] <= 0) continue;
    k[i] = [k[i][0] + (rnd() * 2 - 1) * amount, k[i][1] + (rnd() * 2 - 1) * amount, k[i][2]];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────────

const PRESS_PERIOD_MS = 2400;

/**
 * A clean bilateral overhead press. `p` runs 0 (racked) to 1 (lockout); the
 * elbow/wrist path is chosen so the 2D elbow angle sweeps ~42deg to ~174deg and
 * every biomechanics band stays quiet, so a finding in this run is the engine's,
 * not the fixture's.
 *
 * `wristAbovShoulder: false` translates the arm chain DOWN as a rigid body.
 * Translation preserves every angle exactly, which isolates the end-position
 * shape gate: identical rep cycle, wrists no longer overhead.
 */
export function synthPress(opts: {
  reps: number;
  fps?: number;
  noise?: number;
  confidence?: number;
  wristAbovShoulder?: boolean;
}): ReplayFrame[] {
  const fps = opts.fps ?? 30;
  const conf = opts.confidence ?? 0.9;
  const noise = opts.noise ?? 0;
  const overhead = opts.wristAbovShoulder !== false;
  const drop = overhead ? 0 : 330;
  const dt = 1000 / fps;
  const rnd = mulberry32(0xa11ce);
  const total = Math.ceil((opts.reps * PRESS_PERIOD_MS) / dt) + 4;

  const frames: ReplayFrame[] = [];
  for (let i = 0; i < total; i++) {
    const tMs = i * dt;
    // Starts AT lockout so rep 1 arms from extension, as the state machine
    // requires; a set that starts mid-descent legitimately loses its first rep.
    const p = (Math.cos((2 * Math.PI * tMs) / PRESS_PERIOD_MS) + 1) / 2;
    const k = blank();
    setTorso(k, conf);

    const sx = CX - SHOULDER_SPAN / 2;
    const ex = sx + lerp(-85, -45, p);
    const ey = SHOULDER_Y + lerp(95, -130, p) + drop;
    const wx = ex + lerp(0, -40, p);
    const wy = ey + lerp(-160, -170, p);

    k[KP.l_elbow] = [ex, ey, conf];
    k[KP.r_elbow] = [mirrorX(ex), ey, conf];
    k[KP.l_wrist] = [wx, wy, conf];
    k[KP.r_wrist] = [mirrorX(wx), wy, conf];

    jitter(k, noise, rnd);
    frames.push({ kpts: k, tMs });
  }
  return frames;
}

const FIDGET_PERIOD_MS = 1600;

/**
 * Hands on a desk. Reproduces the phantom-rep motion exactly: a valid elbow
 * cycle (below 100deg, above 150deg, 1.6s round trip) with both wrists BELOW
 * the shoulders for every frame of it. Pose quality is deliberately perfect —
 * the lifter really is sitting there in full view — so this isolates the one
 * question that matters: does anything ask whether the motion IS the exercise?
 */
export function synthDeskFidget(opts: { seconds: number; fps?: number }): ReplayFrame[] {
  const fps = opts.fps ?? 30;
  const dt = 1000 / fps;
  const conf = 0.9;
  const frames: ReplayFrame[] = [];
  const total = Math.ceil((opts.seconds * 1000) / dt);

  const sx = CX - SHOULDER_SPAN / 2;
  const ex = sx - 60;
  const ey = SHOULDER_Y + 180;
  const phi = Math.atan2(SHOULDER_Y - ey, sx - ex) / DEG;

  for (let i = 0; i < total; i++) {
    const tMs = i * dt;
    const p = (1 - Math.cos((2 * Math.PI * tMs) / FIDGET_PERIOD_MS)) / 2;
    const theta = lerp(95, 160, p);
    const d = (phi + theta) * DEG;
    const wx = ex + FOREARM * Math.cos(d);
    const wy = ey + FOREARM * Math.sin(d);

    const k = blank();
    setTorso(k, conf);
    k[KP.l_elbow] = [ex, ey, conf];
    k[KP.r_elbow] = [mirrorX(ex), ey, conf];
    k[KP.l_wrist] = [wx, wy, conf];
    k[KP.r_wrist] = [mirrorX(wx), wy, conf];
    frames.push({ kpts: k, tMs });
  }
  return frames;
}

/**
 * A hand held to the lens, reproduced from the device measurements: the
 * detector returns a full, confident 33-point skeleton (MLKit's
 * inFrameLikelihood is high because the hand IS in frame — likelihood is not
 * correctness), the spans thrash, and torso length holds steady because it is
 * the one dimension a palm can fake.
 *
 * Spans are standardized so the emitted CVs are exactly 0.42 / 0.48 / 0.06.
 */
export function synthHandToLens(opts: { seconds: number; fps?: number }): ReplayFrame[] {
  const fps = opts.fps ?? 30;
  const dt = 1000 / fps;
  const total = Math.ceil((opts.seconds * 1000) / dt);
  const rnd = mulberry32(0x8ead);
  const conf = 0.85;

  const seq = (n: number) => standardize(Array.from({ length: n }, () => rnd() * 2 - 1));
  const zSh = seq(total);
  const zHip = seq(total);
  const zTorso = seq(total);

  // Means from the device frames: shoulder span swung 11->83px, hip span 2->57px.
  const SH_MEAN = 45;
  const HIP_MEAN = 29;
  const TORSO_MEAN = 100;

  const frames: ReplayFrame[] = [];
  for (let i = 0; i < total; i++) {
    const shSpan = SH_MEAN * (1 + 0.42 * zSh[i]);
    const hipSpan = HIP_MEAN * (1 + 0.48 * zHip[i]);
    const torso = TORSO_MEAN * (1 + 0.06 * zTorso[i]);
    const mx = CX + (rnd() * 2 - 1) * 30;
    const my = 560 + (rnd() * 2 - 1) * 30;

    const k = blank();
    k[KP.nose] = [mx, my - 60, conf];
    k[KP.l_eye] = [mx - 10, my - 70, conf];
    k[KP.r_eye] = [mx + 10, my - 70, conf];
    k[KP.l_ear] = [mx - 18, my - 65, conf];
    k[KP.r_ear] = [mx + 18, my - 65, conf];
    k[KP.l_shoulder] = [mx - shSpan / 2, my, conf];
    k[KP.r_shoulder] = [mx + shSpan / 2, my, conf];
    k[KP.l_hip] = [mx - hipSpan / 2, my + torso, conf];
    k[KP.r_hip] = [mx + hipSpan / 2, my + torso, conf];
    // The tell from the logs: one arm's landmarks thrown across the frame, which
    // is how the ELBOW readout reached 7deg while the user merely gestured.
    for (const idx of [KP.l_elbow, KP.r_elbow, KP.l_wrist, KP.r_wrist]) {
      k[idx] = [mx + (rnd() * 2 - 1) * 190, my + (rnd() * 2 - 1) * 190, conf];
    }
    frames.push({ kpts: k, tMs: i * dt });
  }
  return frames;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine composition
// ─────────────────────────────────────────────────────────────────────────────

const ANGLE_CHAIN: Record<'elbow' | 'knee' | 'hip', readonly (readonly number[])[]> = {
  elbow: [[KP.l_shoulder, KP.l_elbow, KP.l_wrist], [KP.r_shoulder, KP.r_elbow, KP.r_wrist]],
  knee: [[KP.l_hip, 25, 27], [KP.r_hip, 26, 28]],
  hip: [[KP.l_shoulder, KP.l_hip, 25], [KP.r_shoulder, KP.r_hip, 26]],
};

function pt(kpts: Kpt[], i: number): Kpt | null {
  const k = kpts[i];
  if (!k || !Number.isFinite(k[0]) || !Number.isFinite(k[1])) return null;
  return Number.isFinite(k[2]) && k[2] >= MIN_JOINT_CONF ? k : null;
}

function angleAt(a: Kpt, b: Kpt, c: Kpt): number {
  const rad = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(a[1] - b[1], a[0] - b[0]);
  let deg = Math.abs(rad / DEG);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

/**
 * HARNESS-SUPPLIED. biomechanics owns this logic (`readAngle`) but does not
 * export it and exposes no "primary angle" reader, so every caller — the app and
 * this harness alike — has to re-derive the rep-driving angle. Kept identical:
 * same chains, same MIN_JOINT_CONF, same 'clearest' (highest-confidence) pick.
 */
function readPrimaryAngle(
  kpts: Kpt[],
  kind: 'elbow' | 'knee' | 'hip',
): { deg: number; conf: number; sides: number[] } | null {
  let best: { deg: number; conf: number } | null = null;
  const degs: number[] = [];
  for (const chain of ANGLE_CHAIN[kind]) {
    const ps = chain.map((i) => pt(kpts, i));
    if (ps.some((p) => p === null)) continue;
    const [a, b, c] = ps as Kpt[];
    const deg = angleAt(a, b, c);
    if (!Number.isFinite(deg)) continue;
    degs.push(deg);
    const conf = Math.min(a[2], b[2], c[2]);
    if (!best || conf > best.conf) best = { deg, conf };
  }
  return best ? { deg: best.deg, conf: best.conf, sides: degs } : null;
}

/**
 * HARNESS-SUPPLIED. Mirrors repShapeValid() in app/form-coach.tsx.
 * ExerciseStateMachine.update() takes `shapeOk` as a caller obligation, and no
 * module under lib/vision satisfies it — the only implementation lives in a
 * 2294-line .tsx that imports React and the camera, so it cannot be replayed.
 * That is a real gap, not a fixture detail: this gate is the ONLY thing standing
 * between the desk-fidget cycle and a counted rep.
 */
function repShapeValid(kpts: Kpt[], category: string): boolean {
  const p = (i: number): Kpt | null =>
    kpts[i] && kpts[i][2] >= SHAPE_CONF ? kpts[i] : null;

  if (category === 'press') {
    const ls = p(KP.l_shoulder), rs = p(KP.r_shoulder);
    const lw = p(KP.l_wrist), rw = p(KP.r_wrist);
    const leftOk = ls && lw ? lw[1] < ls[1] : null;
    const rightOk = rs && rw ? rw[1] < rs[1] : null;
    if (leftOk === null && rightOk === null) return true;
    return Boolean(leftOk || rightOk);
  }
  if (category === 'curl') {
    const le = p(KP.l_elbow), re = p(KP.r_elbow);
    const lw = p(KP.l_wrist), rw = p(KP.r_wrist);
    const leftOk = le && lw ? lw[1] < le[1] : null;
    const rightOk = re && rw ? rw[1] < re[1] : null;
    if (leftOk === null && rightOk === null) return true;
    return Boolean(leftOk || rightOk);
  }
  return true;
}

/** exerciseState and formDecision declare different phase vocabularies. */
function mapPhase(p: RepPhase): DecisionPhase {
  return p === 'start' ? 'setup' : p;
}

/**
 * HARNESS-SUPPLIED adapter. biomechanics emits severity 'info'|'warn'|'critical';
 * formDecision understands 'info'|'minor'|'major'|'critical' and silently
 * down-weights an unknown word to `minor` (0.35). Without this mapping every
 * biomechanical WARNING would be scored as the mildest non-info fault.
 */
function toDecisionFinding(f: BioFinding): DecisionFinding {
  const severity = f.severity === 'warn' ? 'major' : f.severity;
  return { id: f.id, severity, confidence: f.confidence, message: f.message };
}

export interface ReplayTrace {
  tMs: number;
  phase: RepPhase;
  angle: number | null;
  canJudge: boolean;
  quality: number;
  score: number | null;
  confidence: number;
  shapeOk: boolean;
  calibrated: boolean;
  findings: BioFinding[];
  spoke: DecisionFinding | null;
}

export interface ReplayOptions {
  onFrame?: (t: ReplayTrace) => void;
  /** Feed the state machine shapeOk=true always, to measure what the gate catches. */
  ignoreShapeGate?: boolean;
}

/**
 * Drive the full pipeline over recorded/synthetic frames.
 * Order is the shipping order: quality gate first, then calibration, then the
 * rep machine, then phase-scoped biomechanics, then the speak/stay-silent layer.
 */
export function replay(
  frames: ReplayFrame[],
  category: string,
  opts: ReplayOptions = {},
): { reps: number; spoken: string[]; nullScoreFrames: number; advice: string[] } {
  const profile = getProfile(category);
  const calibrator = new Calibrator();
  const sm = new ExerciseStateMachine({
    lowThreshold: profile.thresholds.low,
    highThreshold: profile.thresholds.high,
    minRepMs: MIN_REP_MS,
    minRom: profile.thresholds.minRom,
  });
  const decider = new FormDecider();
  const lock = new SkeletonLock();

  const spoken: string[] = [];
  const advice: string[] = [];
  let nullScoreFrames = 0;

  for (const frame of frames) {
    const { kpts, tMs } = frame;
    // Shipping order (VisionEngine.process): the skeleton lock settles "is this
    // a body" before the quality gate is asked "can I see it", because a palm
    // at the lens answers the second question perfectly well.
    const skeletonTrusted = lock.push(kpts);
    const quality = assessPoseQuality(kpts, category, VIEW_W, VIEW_H, { skeletonTrusted });

    // A body scale measured off an untrusted skeleton mis-scales every
    // body-relative threshold downstream while looking perfectly calibrated.
    if (skeletonTrusted) calibrator.push(kpts);
    const cal: BodyCalibration | null = calibrator.get();

    // A pose we cannot trust must not advance the rep machine. Null ages the gap
    // clock and nothing else — that is the whole contract of update().
    const read = quality.canJudge ? readPrimaryAngle(kpts, profile.primaryAngle) : null;
    const angle = read ? read.deg : null;
    const symmetry = read && read.sides.length === 2 ? Math.abs(read.sides[0] - read.sides[1]) : 0;
    const shapeOk = opts.ignoreShapeGate ? true : repShapeValid(kpts, category);

    sm.update(angle, tMs, symmetry, shapeOk);
    const phase = sm.phase;

    const findings: BioFinding[] =
      quality.canJudge && cal && cal.complete ? runChecks(profile, kpts, cal, phase) : [];

    const verdict = decider.update(
      quality,
      findings.map(toDecisionFinding),
      mapPhase(phase),
      tMs,
    );

    if (verdict.score === null) nullScoreFrames += 1;
    if (verdict.speak) spoken.push(verdict.speak.message);
    if (verdict.advice && !advice.includes(verdict.advice)) advice.push(verdict.advice);

    opts.onFrame?.({
      tMs,
      phase,
      angle,
      canJudge: quality.canJudge,
      quality: quality.overall,
      score: verdict.score,
      confidence: verdict.confidence,
      shapeOk,
      calibrated: Boolean(cal && cal.complete),
      findings,
      spoke: verdict.speak,
    });
  }

  return { reps: sm.count, spoken, nullScoreFrames, advice };
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame mutators — isolate ONE variable against the clean-press control
// ─────────────────────────────────────────────────────────────────────────────

function cloneFrames(frames: ReplayFrame[]): ReplayFrame[] {
  return frames.map((f) => ({ tMs: f.tMs, kpts: f.kpts.map((k) => [k[0], k[1], k[2]] as Kpt) }));
}

/** Drop every landmark's confidence inside a time window. */
function withLowConfidence(frames: ReplayFrame[], fromMs: number, toMs: number, c: number) {
  const out = cloneFrames(frames);
  for (const f of out) {
    if (f.tMs < fromMs || f.tMs > toMs) continue;
    f.kpts = f.kpts.map((k) => [k[0], k[1], k[2] > 0 ? c : 0] as Kpt);
  }
  return out;
}

/** Throw both wrists laterally on ONE frame — a single-frame landmark glitch. */
function withOneBadFrame(frames: ReplayFrame[], index: number, px: number) {
  const out = cloneFrames(frames);
  const f = out[index];
  f.kpts[KP.l_wrist] = [f.kpts[KP.l_wrist][0] - px, f.kpts[KP.l_wrist][1], f.kpts[KP.l_wrist][2]];
  f.kpts[KP.r_wrist] = [f.kpts[KP.r_wrist][0] + px, f.kpts[KP.r_wrist][1], f.kpts[KP.r_wrist][2]];
  return out;
}

/** A persistent, real fault: wrists carried outside the elbows on every frame. */
function withWristFlare(frames: ReplayFrame[], px: number) {
  const out = cloneFrames(frames);
  for (const f of out) {
    f.kpts[KP.l_wrist] = [f.kpts[KP.l_wrist][0] - px, f.kpts[KP.l_wrist][1], f.kpts[KP.l_wrist][2]];
    f.kpts[KP.r_wrist] = [f.kpts[KP.r_wrist][0] + px, f.kpts[KP.r_wrist][1], f.kpts[KP.r_wrist][2]];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────────────────────

export interface Assertion {
  n: number;
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const span = (kpts: Kpt[], a: number, b: number) =>
  Math.hypot(kpts[a][0] - kpts[b][0], kpts[a][1] - kpts[b][1]);

const torsoLen = (kpts: Kpt[]) =>
  Math.hypot(
    (kpts[KP.l_shoulder][0] + kpts[KP.r_shoulder][0]) / 2 -
      (kpts[KP.l_hip][0] + kpts[KP.r_hip][0]) / 2,
    (kpts[KP.l_shoulder][1] + kpts[KP.r_shoulder][1]) / 2 -
      (kpts[KP.l_hip][1] + kpts[KP.r_hip][1]) / 2,
  );

export function runAssertions(): Assertion[] {
  const rows: Assertion[] = [];
  const add = (n: number, name: string, expected: string, actual: string, pass: boolean) =>
    rows.push({ n, name, expected, actual, pass });

  // ── 0. fixture fidelity: do the generators reproduce the measured signature?
  const hand = synthHandToLens({ seconds: 30 });
  const shCv = cv(hand.map((f) => span(f.kpts, KP.l_shoulder, KP.r_shoulder)));
  const hipCv = cv(hand.map((f) => span(f.kpts, KP.l_hip, KP.r_hip)));
  const torCv = cv(hand.map((f) => torsoLen(f.kpts)));
  add(
    0,
    'fixture matches device signature (hand-to-lens)',
    'shoulder CV~0.42, hip CV~0.48, torso CV~0.06',
    `shoulder ${shCv.toFixed(3)}, hip ${hipCv.toFixed(3)}, torso ${torCv.toFixed(3)}`,
    Math.abs(shCv - 0.42) < 0.02 && Math.abs(hipCv - 0.48) < 0.02 && Math.abs(torCv - 0.06) < 0.01,
  );

  // ── 1. clean press counts its reps
  const press = synthPress({ reps: 10 });
  let cleanFindings = 0;
  const r1 = replay(press, 'press', {
    onFrame: (t) => {
      cleanFindings += t.findings.length;
    },
  });
  add(
    1,
    'synthPress(10 reps) counts 10 (+/-1)',
    '9..11 reps',
    `${r1.reps} reps, spoken=${r1.spoken.length}, findings=${cleanFindings}, nullFrames=${r1.nullScoreFrames}/${press.length}`,
    r1.reps >= 9 && r1.reps <= 11,
  );

  // ── 2. desk fidget counts nothing
  const fidget = synthDeskFidget({ seconds: 30 });
  const fidgetAngles: number[] = [];
  let fidgetJudged = 0;
  const r2 = replay(fidget, 'press', {
    onFrame: (t) => {
      if (t.angle != null) fidgetAngles.push(t.angle);
      if (t.canJudge) fidgetJudged += 1;
    },
  });
  const r2NoGate = replay(fidget, 'press', { ignoreShapeGate: true });
  const aMin = Math.min(...fidgetAngles);
  const aMax = Math.max(...fidgetAngles);
  add(
    2,
    'synthDeskFidget(30s) counts ZERO reps',
    '0 reps',
    `${r2.reps} reps (angle ${aMin.toFixed(0)}..${aMax.toFixed(0)}deg, canJudge on ${fidgetJudged}/${fidget.length} frames; ` +
      `without the harness shape gate: ${r2NoGate.reps} reps)`,
    r2.reps === 0,
  );

  // ── 3. hand-to-lens counts nothing and claims nothing
  let numericScores = 0;
  let handJudged = 0;
  let minElbow = Infinity;
  const r3 = replay(hand, 'press', {
    onFrame: (t) => {
      if (t.score !== null) numericScores += 1;
      if (t.canJudge) handJudged += 1;
      if (t.angle != null && t.angle < minElbow) minElbow = t.angle;
    },
  });
  add(
    3,
    'synthHandToLens(30s) counts 0 reps and never scores',
    '0 reps, 0 numeric score frames',
    `${r3.reps} reps, ${numericScores}/${hand.length} numeric score frames ` +
      `(canJudge ${handJudged}/${hand.length}, min elbow ${Number.isFinite(minElbow) ? minElbow.toFixed(1) : 'n/a'}deg, ` +
      `spoke ${r3.spoken.length}x: ${r3.spoken.length ? JSON.stringify(r3.spoken[0]) : '-'})`,
    r3.reps === 0 && numericScores === 0,
  );

  // ── 4. low confidence => score is null, never a number
  const dim = withLowConfidence(synthPress({ reps: 6 }), 4000, 8000, 0.2);
  let dimFrames = 0;
  let dimNumeric = 0;
  replay(dim, 'press', {
    onFrame: (t) => {
      if (t.tMs < 4000 || t.tMs > 8000) return;
      dimFrames += 1;
      if (t.score !== null) dimNumeric += 1;
    },
  });
  add(
    4,
    'low-confidence frames score null, never a number',
    '0 numeric scores in the dimmed window',
    `${dimNumeric} numeric of ${dimFrames} dimmed frames (conf 0.2, window 4000-8000ms)`,
    dimFrames > 0 && dimNumeric === 0,
  );

  // ── 5. one bad frame is never spoken
  const base = synthPress({ reps: 6 });
  const badIdx = Math.round(PRESS_PERIOD_MS / (1000 / 30)) + 1; // just past rep 1's lockout
  const glitched = withOneBadFrame(base, badIdx, 150);
  let glitchFindings = 0;
  const r5 = replay(glitched, 'press', {
    onFrame: (t) => {
      if (t.tMs === glitched[badIdx].tMs) glitchFindings += t.findings.length;
    },
  });
  const r5Clean = replay(base, 'press');
  add(
    5,
    'a single bad frame never produces speech',
    'spoken(glitched) === spoken(clean)',
    `glitch frame raised ${glitchFindings} finding(s); spoken clean=${r5Clean.spoken.length}, glitched=${r5.spoken.length}`,
    r5.spoken.length === r5Clean.spoken.length,
  );

  // ── 6. the same finding is not repeated inside its cooldown
  const flared = withWristFlare(synthPress({ reps: 12 }), 70);
  const utter: { id: string; tMs: number }[] = [];
  replay(flared, 'press', {
    onFrame: (t) => {
      if (t.spoke) utter.push({ id: t.spoke.id, tMs: t.tMs });
    },
  });
  let minGap = Infinity;
  const lastById = new Map<string, number>();
  for (const u of utter) {
    const prev = lastById.get(u.id);
    if (prev !== undefined) minGap = Math.min(minGap, u.tMs - prev);
    lastById.set(u.id, u.tMs);
  }
  const repeated = utter.length - lastById.size;
  add(
    6,
    'same finding not spoken twice inside its 9000ms cooldown',
    'min gap between repeats >= 9000ms',
    `${utter.length} utterance(s) of ${lastById.size} id(s), ${repeated} repeat(s), ` +
      `min same-id gap ${Number.isFinite(minGap) ? minGap.toFixed(0) + 'ms' : 'n/a (no repeat)'}`,
    repeated > 0 && minGap >= 9000,
  );

  return rows;
}

export function formatAssertions(rows: Assertion[]): string {
  const lines = rows.map(
    (r) => `${r.pass ? 'PASS' : 'FAIL'} | ${r.n} | ${r.name}\n       expected: ${r.expected}\n       actual:   ${r.actual}`,
  );
  const failed = rows.filter((r) => !r.pass).length;
  return `${lines.join('\n')}\n\n${rows.length - failed}/${rows.length} passed, ${failed} failed`;
}

export function main(): void {
  // eslint-disable-next-line no-console
  console.log(formatAssertions(runAssertions()));
}

// Jest wiring, active only if the repo's `roots` ever covers lib/. Reached
// through globalThis rather than the ambient jest globals so this file still
// type-checks (and runs) outside a test runner.
interface RunnerGlobals {
  describe?: (name: string, fn: () => void) => void;
  it?: (name: string, fn: () => void) => void;
  expect?: (v: unknown) => { toBe(x: unknown): void };
}
const runner = globalThis as unknown as RunnerGlobals;
if (runner.describe && runner.it && runner.expect) {
  const { describe: group, it: test, expect: assert } = runner;
  group('vision engine replay', () => {
    for (const row of runAssertions()) {
      test(`${row.n}. ${row.name} [${row.actual}]`, () => {
        assert(row.pass).toBe(true);
      });
    }
  });
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main();
}
