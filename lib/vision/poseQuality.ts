/**
 * Pose quality gate — "can I reliably SEE the joints this judgement needs?"
 *
 * This layer exists because the coach once told a seated user his elbows were
 * "too wide" while his hands rested on a desk: a hand held to the lens yields a
 * full 33-point skeleton, so downstream geometry always has numbers to chew on.
 * Numbers are not visibility. Nothing may correct form until this module says
 * the required joints are actually observable.
 *
 * Pure: no React, no camera, no I/O, no module-level mutable state. Runs ~15x/s,
 * so allocation is limited to the returned objects.
 */

// BlazePose / MLKit 33-landmark indices (mirrors app/form-coach.tsx).
const KP = {
  nose: 0,
  l_eye: 2, r_eye: 5,
  l_ear: 7, r_ear: 8,
  l_shoulder: 11, r_shoulder: 12,
  l_elbow: 13, r_elbow: 14,
  l_wrist: 15, r_wrist: 16,
  l_hip: 23, r_hip: 24,
  l_knee: 25, r_knee: 26,
  l_ankle: 27, r_ankle: 28,
} as const;

type Kpt = [number, number, number]; // [x_px, y_px, confidence 0..1]

export type JointGroup = 'head' | 'shoulders' | 'elbows' | 'wrists' | 'hips' | 'knees' | 'ankles';

export interface GroupQuality {
  group: JointGroup;
  score: number; // 0..100
  visible: boolean;
}

export interface PoseQuality {
  overall: number; // 0..100
  groups: Record<JointGroup, GroupQuality>;
  coverage: number; // fraction of the required joints usable, 0..1
  framing: 'ok' | 'too_close' | 'too_far' | 'out_of_frame' | 'partial';
  canJudge: boolean; // is form correction permitted at all
  advice: string | null; // ONE actionable sentence, or null when fine
}

// A joint is usable at this confidence. MLKit's inFrameLikelihood is a genuine
// 0..1 here (the Android plugin is patched to emit it), not a placeholder.
const VISIBLE_CONF = 0.5;
// Lower bar for "the detector thinks this landmark exists somewhere" — used only
// to decide whether an out-of-bounds coordinate is real clipping or junk.
const PLAUSIBLE_CONF = 0.3;

// Judgeable means "every required group cleared VISIBLE_CONF, with a little
// margin". It must stay anchored to VISIBLE_CONF: a bar of 70 demanded 0.70 on
// every required landmark while the module's own definition of usable is 0.50,
// so a fully-tracked lifter in a dim gym (uniform confidence ~0.6) was locked
// out of the whole engine — 0 reps, 0 scores — with advice he could not act on.
const CAN_JUDGE_OVERALL = 55;
// Pose box taller than this fraction of the view: the lifter is crowding the lens.
const BOX_TOO_CLOSE = 0.95;
// Torso shorter than this fraction of the view: too far for landmark precision to
// mean anything. Measured on TORSO, not the pose box: an upper-body lift shows no
// legs, so its box legitimately covers a third of the frame, and box-based
// distance called a correctly framed seated press 'too_far' on 40% of its frames
// (the box shrinks every time the lifter lowers the bar).
const TORSO_TOO_FAR = 0.1;
// Fallback for the same judgement when the torso itself cannot be measured.
const BOX_TOO_FAR = 0.35;

const GROUP_MEMBERS: Record<JointGroup, readonly number[]> = {
  head: [KP.nose, KP.l_eye, KP.r_eye],
  shoulders: [KP.l_shoulder, KP.r_shoulder],
  elbows: [KP.l_elbow, KP.r_elbow],
  wrists: [KP.l_wrist, KP.r_wrist],
  hips: [KP.l_hip, KP.r_hip],
  knees: [KP.l_knee, KP.r_knee],
  ankles: [KP.l_ankle, KP.r_ankle],
};

// Union of every group member, for the pose bounding box.
const ALL_MEMBERS: readonly number[] = [
  KP.nose, KP.l_eye, KP.r_eye,
  KP.l_shoulder, KP.r_shoulder,
  KP.l_elbow, KP.r_elbow,
  KP.l_wrist, KP.r_wrist,
  KP.l_hip, KP.r_hip,
  KP.l_knee, KP.r_knee,
  KP.l_ankle, KP.r_ankle,
];

// Upper-body lifts deliberately do NOT require knees/ankles. A seated barbell
// press physically cannot show legs; demanding them is what pushed the engine
// onto hallucinated lower-body landmarks and produced phantom reps.
const REQUIRED_UPPER: readonly JointGroup[] = ['shoulders', 'elbows', 'wrists'];
const REQUIRED_LOWER: readonly JointGroup[] = ['hips', 'knees', 'ankles'];
// Unknown exercise: demand only the torso anchors, the minimum honest claim.
const REQUIRED_UNKNOWN: readonly JointGroup[] = ['shoulders', 'hips'];

function requiredGroups(category: string | undefined): readonly JointGroup[] {
  switch (category) {
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

// What to DO to make each group observable. Never a diagnosis of the lift.
const GROUP_ADVICE: Record<JointGroup, string> = {
  head: 'Raise the camera so your head is in frame.',
  shoulders: 'Step back and square both shoulders to the camera.',
  elbows: 'Move back so both elbows are in frame.',
  wrists: 'Move back so both hands stay in frame.',
  hips: 'Move back so your hips are in frame.',
  knees: 'Move back so both knees are in frame.',
  ankles: 'Move back so both feet are in frame.',
};

const ADVICE_OUT_OF_FRAME = 'Step into the camera view so your body is visible.';
const ADVICE_TOO_FAR = 'Move closer until you fill more of the frame.';
const ADVICE_TOO_CLOSE = 'Move back so your whole body fits in the frame.';
const ADVICE_LOW_CONFIDENCE = 'Improve the lighting or clear the background so the camera can see you clearly.';
// Names the body the lift actually needs: a squat told to show its "upper
// body" would contradict the setup rows ("head to feet") it just read.
const ADVICE_NOT_A_BODY_UPPER = 'Point the camera at your whole upper body and step back into view.';
const ADVICE_NOT_A_BODY_FULL = 'Point the camera at your whole body and step back into view.';

// ─────────────────────────────────────────────────────────────────────────────
// Anatomical plausibility — "are these numbers a BODY?"
//
// Confidence answers "is this landmark where the detector thinks it is", never
// "is the detector looking at a person". MLKit returns a full, confident
// 33-point skeleton for a palm held to the lens, which is how the coach came to
// critique elbows that were resting on a desk.
//
// The check that separates the two is proportion. A 2D projection of a real
// limb can only ever be SHORTER than the limb (foreshortening); it cannot be
// longer. So every band below is a one-sided UPPER bound — a lifter turned
// side-on collapses a span toward zero and stays legal, while a skeleton fitted
// to a hand reports a forearm twice the length of its own torso and does not.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True segment lengths as a fraction of torso length (mid-shoulder -> mid-hip),
 * derived from standard anthropometry via stature: torso ~0.30H, biacromial
 * ~0.245H, bi-iliac ~0.19H, upper arm ~0.186H, forearm ~0.146H, thigh ~0.245H,
 * shank ~0.246H.
 */
const SEGMENTS: readonly { a: number; b: number; ofTorso: number }[] = [
  { a: KP.l_shoulder, b: KP.r_shoulder, ofTorso: 0.82 },
  { a: KP.l_hip, b: KP.r_hip, ofTorso: 0.63 },
  { a: KP.l_shoulder, b: KP.l_elbow, ofTorso: 0.62 },
  { a: KP.r_shoulder, b: KP.r_elbow, ofTorso: 0.62 },
  { a: KP.l_elbow, b: KP.l_wrist, ofTorso: 0.49 },
  { a: KP.r_elbow, b: KP.r_wrist, ofTorso: 0.49 },
  { a: KP.l_hip, b: KP.l_knee, ofTorso: 0.82 },
  { a: KP.r_hip, b: KP.r_knee, ofTorso: 0.82 },
  { a: KP.l_knee, b: KP.l_ankle, ofTorso: 0.82 },
  { a: KP.r_knee, b: KP.r_ankle, ofTorso: 0.82 },
];

/**
 * How far past its true length a segment may project before we call it
 * impossible. Perspective (a limb much nearer the lens than the torso) and
 * landmark slop both inflate a projection; 1.8x covers both with room to spare.
 * Measured margin on real lifts: the longest real segment reaches 0.67 torsos
 * against the loosest band of 1.48, so this bound is nowhere near live traffic.
 */
const PROJECTION_HEADROOM = 1.8;

/** Torso shorter than this is a collapsed skeleton, not a scale reference. */
const MIN_TORSO_PX = 8;

function xy(kpts: Kpt[], idx: number): Kpt | null {
  const k = kpts[idx];
  if (!k || !isFinite(k[0]) || !isFinite(k[1])) return null;
  return conf(kpts, idx) >= VISIBLE_CONF ? k : null;
}

function len(a: Kpt, b: Kpt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Torso length in px, or NaN when neither a shoulder/hip pair nor a single
 * intact side can be measured.
 *
 * The same-side fallback is not a nicety. Torso length is the scale reference
 * for the anatomy check, the skeleton lock and the calibrator, and demanding all
 * four anchors meant one occluded hip — a rack upright, a side-on view, a turn
 * mid-rep — took the reference away, revoked the lock and froze the engine mid
 * set. Measured: a single hip dropped to 0.2 confidence for six seconds cost
 * three of eleven reps. A shoulder-to-hip distance on one side is a real torso
 * measurement, not a degraded guess; the cross-body diagonal is not, so it is
 * refused rather than silently over-reporting the scale.
 */
function torsoLength(kpts: Kpt[]): number {
  const ls = xy(kpts, KP.l_shoulder);
  const rs = xy(kpts, KP.r_shoulder);
  const lh = xy(kpts, KP.l_hip);
  const rh = xy(kpts, KP.r_hip);
  let d = NaN;
  if (ls && rs && lh && rh) {
    d = Math.hypot(
      (ls[0] + rs[0]) / 2 - (lh[0] + rh[0]) / 2,
      (ls[1] + rs[1]) / 2 - (lh[1] + rh[1]) / 2,
    );
  } else if (ls && lh) {
    d = len(ls, lh);
  } else if (rs && rh) {
    d = len(rs, rh);
  }
  return isFinite(d) ? d : NaN;
}

/**
 * Does this frame's skeleton have the proportions of a human body?
 *
 * Pure and per-frame. Only segments whose BOTH endpoints are visible are
 * judged — a seated press never shows legs, and absent landmarks are missing
 * data, not evidence of a fake. Returns true when there is nothing to measure:
 * this gate exists to reject impossible geometry, not to demand geometry.
 */
export function anatomyPlausible(kpts: Kpt[]): boolean {
  if (!Array.isArray(kpts)) return false;
  const torso = torsoLength(kpts);
  if (!isFinite(torso)) return true; // no scale reference — abstain, do not accuse
  if (torso < MIN_TORSO_PX) return false;

  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    const a = xy(kpts, s.a);
    const b = xy(kpts, s.b);
    if (!a || !b) continue;
    if (len(a, b) > s.ofTorso * PROJECTION_HEADROOM * torso) return false;
  }
  return true;
}

/** Confidence of one landmark, hardened against missing/NaN/out-of-range input. */
function conf(kpts: Kpt[], idx: number): number {
  const k = kpts[idx];
  if (!k) return 0;
  const c = k[2];
  if (!(c > 0)) return 0; // also catches NaN and undefined
  return c > 1 ? 1 : c;
}

/**
 * A bilateral group scores on its BEST-SEEN member, because that is the side the
 * checks downstream will actually read: biomechanics' `sideCheck` skips an
 * occluded side by design ("a side-on view legitimately hides one arm"). Scoring
 * the pair on its worse joint contradicted that outright — one hidden elbow drove
 * the group to 0 and `canJudge` to false, so every side-on lift and every
 * rack-occluded limb was locked out of the engine entirely while the checks built
 * for exactly that case sat unreachable behind the gate.
 *
 * Per-landmark honesty is not lost: `coverage` below still counts individual
 * joints, so "3 of 6 usable" degrades smoothly for the UI.
 */
function groupQuality(kpts: Kpt[], group: JointGroup): GroupQuality {
  const members = GROUP_MEMBERS[group];
  let best = 0;
  for (let i = 0; i < members.length; i++) {
    const c = conf(kpts, members[i]);
    if (c > best) best = c;
  }
  return { group, score: Math.round(best * 100), visible: best >= VISIBLE_CONF };
}

export function jointConfidenceTier(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonLock — the temporal half of the same question
//
// One frame cannot establish that the camera is looking at a person; a palm
// occasionally lands in a plausible pose by chance. What a palm cannot do is
// hold still: on the device frames the shoulder span swung 11->83px (CV 0.42)
// and the hip span 2->57px (CV 0.48) while torso length held at CV 0.06,
// because a torso fitted to a hand is re-guessed every frame. A real shoulder
// span is a fixed bone-to-bone distance and simply does not do that.
//
// So the lock demands a run of consecutive plausible frames AND rigid spans
// before form may be judged, and drops out again when either fails. Stateful,
// but still pure over frames: no React, no camera, no clock of its own.
// ─────────────────────────────────────────────────────────────────────────────

/** Rolling window, ~0.5s at 15fps detection. Matches form-coach's SkeletonLock. */
const STAB_WINDOW = 8;
/** Frames before the window can return any verdict at all. */
const STAB_MIN_READY = 5;
/** A real fixed distance never varies this much frame to frame. Device: 0.42. */
const STAB_MAX_CV = 0.22;
/** A span below this fraction of torso is foreshortened side-on, so it is skipped. */
const SPAN_MIN_PLAUSIBLE_FRAC = 0.28;
/** Consecutive plausible frames required to acquire the lock. */
const LOCK_AFTER = 5;
/** Consecutive failing frames before an acquired lock is revoked. Generous: a
 *  dropout mid-set should not blank the coach, and a real body re-locks fast. */
const UNLOCK_AFTER = 15;

const SPAN_PAIRS: readonly (readonly [number, number])[] = [
  [KP.l_shoulder, KP.r_shoulder],
  [KP.l_hip, KP.r_hip],
];

function cvOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (!(mean > 0)) return NaN;
  const varc = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(varc) / mean;
}

export class SkeletonLock {
  private spans: number[][] = [];
  private torsos: number[] = [];
  private goodStreak = 0;
  private badStreak = 0;
  private lockedFlag = false;

  get locked(): boolean {
    return this.lockedFlag;
  }

  /** Offer one frame; returns whether the skeleton may currently be trusted. */
  push(kpts: Kpt[]): boolean {
    const safe = Array.isArray(kpts) ? kpts : [];
    const torso = torsoLength(safe);
    this.torsos.push(torso);
    if (this.torsos.length > STAB_WINDOW) this.torsos.shift();

    const row: number[] = [];
    for (let i = 0; i < SPAN_PAIRS.length; i++) {
      const a = xy(safe, SPAN_PAIRS[i][0]);
      const b = xy(safe, SPAN_PAIRS[i][1]);
      row.push(a && b ? len(a, b) : NaN);
    }
    this.spans.push(row);
    if (this.spans.length > STAB_WINDOW) this.spans.shift();

    const ok = anatomyPlausible(safe) && this.spansRigid();
    if (ok) {
      this.badStreak = 0;
      this.goodStreak += 1;
      if (!this.lockedFlag && this.goodStreak >= LOCK_AFTER) this.lockedFlag = true;
    } else {
      this.goodStreak = 0;
      this.badStreak += 1;
      if (this.lockedFlag && this.badStreak >= UNLOCK_AFTER) this.lockedFlag = false;
    }
    return this.lockedFlag;
  }

  reset(): void {
    this.spans = [];
    this.torsos = [];
    this.goodStreak = 0;
    this.badStreak = 0;
    this.lockedFlag = false;
  }

  /**
   * Every span we can actually measure must be rigid. Unlike a majority vote, a
   * single thrashing span is disqualifying: shoulder and hip spans are fixed
   * distances, so one of them varying 42% means the pose is fitted to something
   * that is not a body.
   */
  private spansRigid(): boolean {
    if (this.spans.length < STAB_MIN_READY) return false;
    const torsoVals = this.torsos.filter((v) => isFinite(v) && v >= MIN_TORSO_PX);
    // No scale reference means no verdict. Refusing to lock is the safe answer;
    // returning true here would hand a hand-shaped skeleton a free pass.
    if (torsoVals.length < STAB_MIN_READY) return false;
    const torso = torsoVals.reduce((s, v) => s + v, 0) / torsoVals.length;

    for (let i = 0; i < SPAN_PAIRS.length; i++) {
      const vals: number[] = [];
      for (const row of this.spans) {
        if (isFinite(row[i])) vals.push(row[i]);
      }
      if (vals.length < STAB_MIN_READY) continue; // not consistently visible
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      if (mean < SPAN_MIN_PLAUSIBLE_FRAC * torso) continue; // side-on, legitimately collapsed
      const c = cvOf(vals);
      if (isFinite(c) && c > STAB_MAX_CV) return false;
    }
    return true;
  }
}

export interface PoseQualityOptions {
  /**
   * Verdict from a SkeletonLock fed the same frames. False forbids judging
   * outright. Omitted, only the per-frame anatomy check applies — weaker,
   * because one frame cannot establish that the camera is aimed at a person.
   */
  skeletonTrusted?: boolean;
}

export function assessPoseQuality(
  kpts: Kpt[],
  category: string | undefined,
  viewW: number,
  viewH: number,
  opts?: PoseQualityOptions,
): PoseQuality {
  const groups: Record<JointGroup, GroupQuality> = {
    head: groupQuality(kpts, 'head'),
    shoulders: groupQuality(kpts, 'shoulders'),
    elbows: groupQuality(kpts, 'elbows'),
    wrists: groupQuality(kpts, 'wrists'),
    hips: groupQuality(kpts, 'hips'),
    knees: groupQuality(kpts, 'knees'),
    ankles: groupQuality(kpts, 'ankles'),
  };

  const required = requiredGroups(category);

  // Weighted mean over the REQUIRED groups only. Weight rises as a group's score
  // falls (2 at 0, 1 at 100) so a blind group drags the total down instead of
  // being averaged away by its confident neighbours — the whole point of a gate.
  let acc = 0;
  let wsum = 0;
  let visibleRequired = 0;
  let weakest: JointGroup | null = null;
  let weakestScore = 101;
  for (let i = 0; i < required.length; i++) {
    const g = groups[required[i]];
    const w = 2 - g.score / 100;
    acc += g.score * w;
    wsum += w;
    if (g.visible) visibleRequired += 1;
    if (g.score < weakestScore) {
      weakestScore = g.score;
      weakest = g.group;
    }
  }
  const overall = wsum > 0 ? Math.round(acc / wsum) : 0;
  const allRequiredVisible = visibleRequired === required.length;

  // Coverage counts individual landmarks, not groups: "3 of 6 joints usable"
  // is the number the UI needs, and it degrades smoothly as an arm drops out.
  let usable = 0;
  let plausible = 0;
  let total = 0;
  let clipped = false;
  const boundsKnown = viewW > 0 && viewH > 0 && isFinite(viewW) && isFinite(viewH);
  for (let i = 0; i < required.length; i++) {
    const members = GROUP_MEMBERS[required[i]];
    for (let j = 0; j < members.length; j++) {
      const idx = members[j];
      total += 1;
      const c = conf(kpts, idx);
      if (c >= VISIBLE_CONF) usable += 1;
      if (c >= PLAUSIBLE_CONF) plausible += 1;
      // A plausible landmark sitting outside the view means the body is cropped,
      // not absent — a different fix for the user than poor lighting.
      if (boundsKnown && !clipped && c >= PLAUSIBLE_CONF) {
        const k = kpts[idx];
        if (k && isFinite(k[0]) && isFinite(k[1])) {
          const x = k[0];
          const y = k[1];
          if (x < 0 || x > viewW || y < 0 || y > viewH) clipped = true;
        }
      }
    }
  }
  const coverage = total > 0 ? usable / total : 0;

  // Pose bounding box over every usable landmark, for the distance judgement.
  let minY = Infinity;
  let maxY = -Infinity;
  let boxPoints = 0;
  for (let i = 0; i < ALL_MEMBERS.length; i++) {
    const idx = ALL_MEMBERS[i];
    if (conf(kpts, idx) < VISIBLE_CONF) continue;
    const k = kpts[idx];
    if (!k) continue;
    const y = k[1];
    if (!isFinite(y)) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    boxPoints += 1;
  }
  const boxH = boxPoints >= 2 ? maxY - minY : 0;

  // Distance is judged on the torso, falling back to the pose box only when the
  // torso is unmeasurable — see TORSO_TOO_FAR.
  const torsoPx = torsoLength(kpts);
  const tooFar =
    boundsKnown &&
    (isFinite(torsoPx) ? torsoPx < TORSO_TOO_FAR * viewH : boxH < BOX_TOO_FAR * viewH);

  let framing: PoseQuality['framing'];
  if (boxPoints < 2) {
    framing = 'out_of_frame';
  } else if (boundsKnown && (boxH > BOX_TOO_CLOSE * viewH || clipped)) {
    framing = 'too_close';
  } else if (tooFar) {
    framing = 'too_far';
  } else if (visibleRequired === 0) {
    framing = 'out_of_frame';
  } else if (!allRequiredVisible) {
    framing = 'partial';
  } else {
    framing = 'ok';
  }

  // Visibility is necessary but not sufficient. A palm at the lens clears every
  // confidence bar above — that is exactly how it got through — so the skeleton
  // must also be shaped like a body, and (when a lock is supplied) have behaved
  // like one over time, before any form judgement is permitted.
  const bodyLike = anatomyPlausible(kpts);
  const trusted = opts?.skeletonTrusted !== false;
  const canJudge = overall >= CAN_JUDGE_OVERALL && allRequiredVisible && bodyLike && trusted;

  let advice: string | null = null;
  if (!canJudge) {
    if (usable === 0 && plausible > 0) {
      // The landmarks are all THERE, just too faint to measure — the signature of
      // a dim room, not a misaimed camera. The lock necessarily refuses here (it
      // has no scale reference), so without this branch a dark gym was told to
      // "point the camera at your whole upper body", which fixes nothing.
      advice = ADVICE_LOW_CONFIDENCE;
    } else if (!bodyLike || (!trusted && visibleRequired > 0)) {
      // Deliberately ahead of the framing advice: telling someone to "move
      // closer" when the camera is not pointed at them is worse than useless.
      advice = required === REQUIRED_LOWER ? ADVICE_NOT_A_BODY_FULL : ADVICE_NOT_A_BODY_UPPER;
    } else if (framing === 'out_of_frame') {
      advice = ADVICE_OUT_OF_FRAME;
    } else if (framing === 'too_far') {
      advice = ADVICE_TOO_FAR;
    } else if (framing === 'too_close') {
      // Name the group that is actually being cut off; it is the concrete fix.
      advice = weakest && !groups[weakest].visible ? GROUP_ADVICE[weakest] : ADVICE_TOO_CLOSE;
    } else if (framing === 'partial' && weakest) {
      advice = GROUP_ADVICE[weakest];
    } else {
      // Everything required is visible but too faint to trust.
      advice = ADVICE_LOW_CONFIDENCE;
    }
  }

  return { overall, groups, coverage, framing, canJudge, advice };
}
