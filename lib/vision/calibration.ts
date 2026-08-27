/**
 * Personal body calibration + normalization.
 *
 * Raw pixel coordinates are meaningless across users and camera distances: a
 * large person far from the lens and a small person close to it produce the
 * same pixel spans. Every downstream geometric threshold therefore has to be
 * expressed in units of the person's OWN body, not pixels.
 *
 * The normaliser is torso length (mid-shoulder -> mid-hip). Device measurements
 * showed it is by far the most stable dimension available: on a hand held to
 * the lens — the pathological case that produced phantom reps — torso length
 * had CV 0.06 while shoulder span had CV 0.42 and hip span CV 0.48. Scaling by
 * shoulder span would have inherited that noise into every threshold.
 *
 * Pure module: no React, no camera, no side effects, so the whole engine can be
 * replayed against recorded landmark frames instead of re-validated on device.
 */

export type Kpt = [number, number, number]; // [x_px, y_px, confidence 0..1]

/** BlazePose / MLKit landmark indices (mirrors app/form-coach.tsx). */
const KP = {
  l_shoulder: 11,
  r_shoulder: 12,
  l_elbow: 13,
  r_elbow: 14,
  l_wrist: 15,
  r_wrist: 16,
  l_hip: 23,
  r_hip: 24,
  l_knee: 25,
  r_knee: 26,
  l_ankle: 27,
  r_ankle: 28,
} as const;

/** A landmark below this confidence is treated as unseen, never as a measurement. */
const MIN_CONF = 0.5;

/** ~1s at 15fps. Enough to median out a bad frame without stalling the user. */
const REQUIRED_SAMPLES = 15;

/**
 * Rolling window of accepted samples. Larger than REQUIRED_SAMPLES so the
 * profile keeps tracking the user if they step closer to the camera, but
 * bounded so calibration never grows without limit during a long set.
 */
const WINDOW_SIZE = 90;

/** Below this the scale is degenerate (collapsed skeleton) and cannot divide. */
const MIN_SCALE_PX = 1e-3;

export interface BodyCalibration {
  shoulderWidth: number;
  torsoLength: number;
  /** px, median. NaN when the limb was never seen (e.g. legs during a seated press). */
  upperArmLen: number;
  forearmLen: number;
  thighLen: number;
  shinLen: number;
  /** px per "torso unit" — the normaliser every other module divides by. */
  scale: number;
  samples: number;
  complete: boolean;
}

interface Sample {
  shoulderWidth: number;
  torsoLength: number;
  upperArmLen: number;
  forearmLen: number;
  thighLen: number;
  shinLen: number;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Returns the landmark only if it exists, is numerically sane and clears `minConf`. */
function seen(kpts: Kpt[] | null | undefined, idx: number, minConf = MIN_CONF): Kpt | null {
  if (!kpts || idx < 0 || idx >= kpts.length) return null;
  const k = kpts[idx];
  if (!k || k.length < 3) return null;
  if (!isNum(k[0]) || !isNum(k[1]) || !isNum(k[2])) return null;
  return k[2] >= minConf ? k : null;
}

function dist(a: Kpt, b: Kpt): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

/** Distance between two landmarks, or NaN if either is unseen. */
function segment(kpts: Kpt[], i: number, j: number): number {
  const a = seen(kpts, i);
  const b = seen(kpts, j);
  if (!a || !b) return NaN;
  const d = dist(a, b);
  return isNum(d) ? d : NaN;
}

/**
 * Mean of the two sides when both are visible, the single visible side
 * otherwise, NaN when neither is. Limbs are near-symmetric, so one visible
 * side is a legitimate measurement rather than a reason to discard the frame.
 */
function bilateral(left: number, right: number): number {
  const l = isNum(left) ? left : NaN;
  const r = isNum(right) ? right : NaN;
  if (isNum(l) && isNum(r)) return (l + r) / 2;
  if (isNum(l)) return l;
  if (isNum(r)) return r;
  return NaN;
}

/** Median over finite values only — one thrown-landmark frame must not skew the profile. */
function median(values: number[]): number {
  const finite = values.filter(isNum);
  if (finite.length === 0) return NaN;
  finite.sort((a, b) => a - b);
  const mid = finite.length >> 1;
  return finite.length % 2 === 1 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

function midpoint(a: Kpt, b: Kpt): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Accumulates per-frame body measurements and reports a median profile once
 * enough good frames have been seen.
 */
export class Calibrator {
  private samples: Sample[] = [];
  /** Total accepted samples, not the window length — progress must not stall at the cap. */
  private accepted = 0;
  /** get() is called every frame but only changes when a sample lands; see get(). */
  private cached: BodyCalibration | null = null;
  private dirty = true;

  /**
   * Offer one landmark frame. Rejected silently unless a torso can actually be
   * measured: a profile built from guessed landmarks would mis-scale every
   * threshold downstream, which is worse than no profile.
   *
   * One intact SIDE is enough. Requiring all four anchors meant a side-on lifter,
   * or one with a rack upright over a hip, never calibrated at all — and since
   * nothing downstream runs before calibration completes, that was a permanent
   * lockout rather than a degraded reading. `shoulderWidth` is left NaN on such
   * frames and the medians below simply ignore it.
   */
  push(kpts: Kpt[]): void {
    const ls = seen(kpts, KP.l_shoulder);
    const rs = seen(kpts, KP.r_shoulder);
    const lh = seen(kpts, KP.l_hip);
    const rh = seen(kpts, KP.r_hip);

    let shPt: [number, number];
    let hipPt: [number, number];
    if (ls && rs && lh && rh) {
      shPt = midpoint(ls, rs);
      hipPt = midpoint(lh, rh);
    } else if (ls && lh) {
      shPt = [ls[0], ls[1]];
      hipPt = [lh[0], lh[1]];
    } else if (rs && rh) {
      shPt = [rs[0], rs[1]];
      hipPt = [rh[0], rh[1]];
    } else {
      // A cross-body shoulder-to-hip diagonal is longer than the torso it claims
      // to measure, so it is refused rather than inflating the scale.
      return;
    }

    const shoulderWidth = ls && rs ? dist(ls, rs) : NaN;
    const torsoLength = Math.hypot(shPt[0] - hipPt[0], shPt[1] - hipPt[1]);

    // A collapsed torso means the skeleton folded onto itself (the hand-to-lens
    // failure mode). It cannot normalise anything, so it is not a sample.
    if (!isNum(torsoLength) || torsoLength < MIN_SCALE_PX) return;
    if (isNum(shoulderWidth) && shoulderWidth <= 0) return;

    this.dirty = true;
    this.samples.push({
      shoulderWidth,
      torsoLength,
      // Limbs are optional: a seated press never shows the legs, and that is
      // legitimate data, not a failed calibration.
      upperArmLen: bilateral(
        segment(kpts, KP.l_shoulder, KP.l_elbow),
        segment(kpts, KP.r_shoulder, KP.r_elbow),
      ),
      forearmLen: bilateral(
        segment(kpts, KP.l_elbow, KP.l_wrist),
        segment(kpts, KP.r_elbow, KP.r_wrist),
      ),
      thighLen: bilateral(
        segment(kpts, KP.l_hip, KP.l_knee),
        segment(kpts, KP.r_hip, KP.r_knee),
      ),
      shinLen: bilateral(
        segment(kpts, KP.l_knee, KP.l_ankle),
        segment(kpts, KP.r_knee, KP.r_ankle),
      ),
    });

    if (this.samples.length > WINDOW_SIZE) {
      this.samples.splice(0, this.samples.length - WINDOW_SIZE);
    }
    this.accepted += 1;
  }

  /**
   * Null until enough good samples exist — callers must not coach before this
   * returns.
   *
   * Memoized because callers poll it once per frame while the answer only moves
   * when a sample lands. Recomputing meant six array copies, six filters and six
   * sorts over a 90-sample window every frame: measured at 21us of a 29us total
   * engine frame — 70% of the whole per-frame cost, and the dominant source of
   * short-lived allocations for the GC to chase on a mid-range Android.
   */
  get(): BodyCalibration | null {
    if (this.samples.length < REQUIRED_SAMPLES) return null;
    if (!this.dirty && this.cached) return this.cached;

    const shoulderWidth = median(this.samples.map((s) => s.shoulderWidth));
    const torsoLength = median(this.samples.map((s) => s.torsoLength));
    const upperArmLen = median(this.samples.map((s) => s.upperArmLen));
    const forearmLen = median(this.samples.map((s) => s.forearmLen));
    const thighLen = median(this.samples.map((s) => s.thighLen));
    const shinLen = median(this.samples.map((s) => s.shinLen));

    const scale = isNum(torsoLength) && torsoLength >= MIN_SCALE_PX ? torsoLength : NaN;
    // Completeness means "we can NORMALISE", and the normaliser is torso alone.
    // Limbs were always excluded; shoulder width now is too, because a side-on
    // lifter never shows both shoulders and gating on it stalled the entire
    // engine in 'calibrating' forever. Shoulder width is a denominator for the
    // lateral checks only, and biomechanics' `frameOf` already refuses it
    // independently — so those checks stay silent while reps and scores run.
    const complete = isNum(scale);

    this.cached = {
      shoulderWidth,
      torsoLength,
      upperArmLen,
      forearmLen,
      thighLen,
      shinLen,
      scale,
      samples: this.accepted,
      complete,
    };
    this.dirty = false;
    return this.cached;
  }

  reset(): void {
    this.samples = [];
    this.accepted = 0;
    this.cached = null;
    this.dirty = true;
  }

  /** 0..1 for a calibration progress bar. */
  progress(): number {
    const p = this.samples.length / REQUIRED_SAMPLES;
    if (!isNum(p) || p < 0) return 0;
    return p > 1 ? 1 : p;
  }
}

/**
 * Usable divisor for `cal`. Falls back to 1 (i.e. leaves values in pixels)
 * rather than producing Infinity/NaN, so a degenerate profile degrades to
 * "uncalibrated numbers" instead of poisoning every comparison downstream.
 */
function safeScale(cal: BodyCalibration | null | undefined): number {
  const s = cal?.scale;
  return isNum(s) && s >= MIN_SCALE_PX ? s : 1;
}

/**
 * Re-express every landmark relative to the mid-shoulder origin, in torso
 * units. Per-landmark confidence is carried through untouched in slot [2] —
 * normalization changes the frame of reference, never how much we trust a point.
 */
export function normalize(kpts: Kpt[], cal: BodyCalibration): Kpt[] {
  if (!Array.isArray(kpts) || kpts.length === 0) return [];
  const scale = safeScale(cal);

  // Origin from whichever shoulders are actually visible. If neither clears the
  // confidence bar we still use their raw slots rather than inventing an
  // origin; the preserved per-point confidence tells callers not to trust the
  // result, which is the honest signal.
  const lsConf = seen(kpts, KP.l_shoulder);
  const rsConf = seen(kpts, KP.r_shoulder);
  const lsRaw = seen(kpts, KP.l_shoulder, 0);
  const rsRaw = seen(kpts, KP.r_shoulder, 0);

  let origin: [number, number];
  if (lsConf && rsConf) origin = midpoint(lsConf, rsConf);
  else if (lsConf) origin = [lsConf[0], lsConf[1]];
  else if (rsConf) origin = [rsConf[0], rsConf[1]];
  else if (lsRaw && rsRaw) origin = midpoint(lsRaw, rsRaw);
  else if (lsRaw) origin = [lsRaw[0], lsRaw[1]];
  else if (rsRaw) origin = [rsRaw[0], rsRaw[1]];
  else origin = [0, 0];

  return kpts.map((k) => {
    if (!k || k.length < 3 || !isNum(k[0]) || !isNum(k[1])) {
      return [NaN, NaN, 0] as Kpt;
    }
    const conf = isNum(k[2]) ? k[2] : 0;
    return [(k[0] - origin[0]) / scale, (k[1] - origin[1]) / scale, conf] as Kpt;
  });
}

/** Convert a pixel distance into torso units using the calibrated scale. */
export function toBodyUnits(px: number, cal: BodyCalibration): number {
  if (!isNum(px)) return NaN;
  return px / safeScale(cal);
}
