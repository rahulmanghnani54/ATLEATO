/**
 * lib/figure.js — the stick figure: proportions, vector helpers, two-bone IK,
 * keyframe interpolation, rep timing and the two cameras (side / front).
 *
 * Units: torso = 1. World y is UP, x is the direction the side-view figure
 * faces. The floor is y = 0 (the renderer draws the floor line at FLOOR_Y).
 *
 * A *pose* is a plain object of numbers / [x,y] points. Every numeric field is
 * linearly interpolated between keyframes by `poseAt`, so an exercise can add
 * its own numeric fields (e.g. `grip: 0..1`) and read them back in `equipment`.
 *
 * Pose fields understood by the cameras:
 *   hip        [x,y]  hip joint (required)
 *   lean       deg    side view: torso angle from straight UP, + = forward (toward +x)
 *   headTilt   deg    side view: head/neck angle relative to the torso
 *   torso      k      torso length multiplier (default 1; foreshortens a leaning front-view figure)
 *   shoulderHalf u    front view: half shoulder width (default 0.4)
 *   hipHalf    u      front view: legs leave the pelvis this far either side of `hip` (default 0)
 *   neck       u      front view: visible neck length, neck base → head (default 0.12)
 *   headDrop   u      front view: lowers the head centre (and shortens the neck) by this much;
 *                     + = down toward / below the shoulder line, may overlap the torso (default 0)
 * Limbs, per side (side view: N = near, F = far; front view: R = +x, L = -x):
 *   wristN/F/R/L [x,y]   absolute IK target for the hand
 *   wristRel     [x,y]   IK target for BOTH hands relative to the shoulder
 *   armsHang     true    both arms straight down from the shoulder
 *   armN/F/R/L | arm  [upperDeg, forearmDeg]  absolute angles from straight DOWN, + toward +x
 *   elbowDir     ±1 | {N,F,R,L: ±1}  which side of the shoulder→wrist line the elbow bends to
 *   armScaleN/F/R/L | armScale  k  foreshortening: drawn upper-arm AND forearm lengths × k
 *                     (0.35–1, default 1); IK solves on the scaled bones
 *   ankleN/F/R/L [x,y]   absolute IK target for the ankle
 *   legN/F/R/L | leg  [thighDeg, shinDeg]     absolute angles from straight DOWN
 *   kneeDir      ±1 | {…}  bend side for the knee IK
 *   toeN/F       [x,y]   side view: toe position (default: perpendicular to the shin, L.foot long)
 */
'use strict';

const { INK, STROKE_PX, FAR_ALPHA, cap, ring } = require('./raster');

const L = { torso: 1.0, neck: 0.1, head: 0.22, ua: 0.55, fa: 0.5, th: 0.6, sh: 0.6, foot: 0.24 };
const SHOULDER_HALF = 0.4; // front view
const FAR_DX = -0.045; // far-side limbs nudged back a touch so depth reads
const NECK_VISIBLE = L.neck + 0.02; // 0.12 — the drawn neck stroke tucks 0.02 into the head ring
const ARM_SCALE_MIN = 0.35; // shortest an arm may be foreshortened to

/** Standing upright at the origin, both feet on the floor (side view). */
const STAND = { hip: [0, 1.18], lean: 0, ankleN: [0, 0], ankleF: [0, 0] };
/** Standing upright, feet a little apart (front view). */
const STAND_FRONT = { hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0] };

// ─────────────────────────────────────────────────────────────────────────────
// Vector helpers
// ─────────────────────────────────────────────────────────────────────────────

const rad = (d) => (d * Math.PI) / 180;
/** Unit vector at `deg` from straight DOWN, positive toward +x. */
const fromDown = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))];
/** Unit vector at `deg` from straight UP, positive toward +x. */
const fromUp = (deg) => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => {
  const d = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / d, v[1] / d];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Rotate 90° counter-clockwise (y up). */
const ccw = (v) => [-v[1], v[0]];
const cw = (v) => [v[1], -v[0]];
/** Linear interpolation of numbers or points. */
const lerp = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);

/**
 * Two-bone IK. Returns the middle joint and the actual end point (the end is
 * clamped to the limb's reach, so a target just out of reach gives a straight
 * limb pointing at it). `s` picks which side of the root→target line the
 * middle joint bends to.
 */
function ik(root, target, l1, l2, s) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-9 ? dx / d : 0;
  const uy = d > 1e-9 ? dy / d : -1;
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return {
    mid: [root[0] + ux * a - uy * h * s, root[1] + uy * a + ux * h * s],
    end: [root[0] + ux * dc, root[1] + uy * dc],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyframes + timing
// ─────────────────────────────────────────────────────────────────────────────

/** Deep numeric lerp over the pose objects (strings/booleans come from `a`). */
function lerpDeep(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => lerpDeep(v, b[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(a)) o[k] = k in b ? lerpDeep(a[k], b[k], t) : a[k];
    return o;
  }
  return a;
}

/** Pose at eased range value `c` ∈ [0,1] from keyframes [{at, ...pose}]. */
function poseAt(keys, c) {
  if (c <= keys[0].at) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (c <= k1.at) return lerpDeep(k0, k1, (c - k0.at) / (k1.at - k0.at));
  }
  return keys[keys.length - 1];
}

/** Hermite ease-in-out on [0,1]. */
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * One rep as a 0→1→0 range value with ease-in-out on each travel and a short
 * hold at both ends of range: c(0) = c(1) = 0, so reps chain seamlessly.
 * `t` = { down, hold1, up } as fractions of the rep (the remainder is the hold at 0).
 */
function cycle(p, t) {
  const { down, hold1, up } = t;
  if (p < down) return smooth(p / down);
  if (p < down + hold1) return 1;
  if (p < down + hold1 + up) return 1 - smooth((p - down - hold1) / up);
  return 0;
}
const TIMING = { down: 0.44, hold1: 0.06, up: 0.44 };

// ─────────────────────────────────────────────────────────────────────────────
// Limb resolution shared by both views
// ─────────────────────────────────────────────────────────────────────────────

/**
 *  - `wrist*` / `ankle*`: absolute IK target
 *  - `wristRel`: IK target relative to the shoulder (both arms)
 *  - `arm*` / `leg*`: [proximal, distal] absolute angles
 *  - `armsHang`: arms straight down from the shoulder
 *  - `armScale<side>` / `armScale`: foreshortening — both bones × k (0.35–1, default 1)
 * `sgn` mirrors the angle convention for the left side in front view.
 */
function armScale(pose, side) {
  const k = pose['armScale' + side] != null ? pose['armScale' + side] : pose.armScale != null ? pose.armScale : 1;
  return Math.min(1, Math.max(ARM_SCALE_MIN, k));
}

function resolveArm(pose, side, shoulder, sgn) {
  const bend = (pose.elbowDir && pose.elbowDir[side]) || pose.elbowDir || 1;
  const k = armScale(pose, side);
  const ua = L.ua * k;
  const fa = L.fa * k;
  if (pose.armsHang) {
    const elbow = add(shoulder, [0, -ua]);
    return { elbow, wrist: add(shoulder, [0, -(ua + fa)]) };
  }
  const target = pose['wrist' + side] || (pose.wristRel && add(shoulder, pose.wristRel));
  if (target) {
    const r = ik(shoulder, target, ua, fa, typeof bend === 'number' ? bend : 1);
    return { elbow: r.mid, wrist: r.end };
  }
  const ang = pose['arm' + side] || pose.arm;
  if (!ang) throw new Error(`pose has no arm for side ${side} (need wrist${side}, wristRel, armsHang, arm${side} or arm)`);
  const e = fromDown(ang[0]);
  const f = fromDown(ang[1]);
  const elbow = add(shoulder, [sgn * e[0], e[1]], ua);
  return { elbow, wrist: add(elbow, [sgn * f[0], f[1]], fa) };
}

function resolveLeg(pose, side, hip, sgn) {
  const bend = (pose.kneeDir && pose.kneeDir[side]) || pose.kneeDir || 1;
  const target = pose['ankle' + side];
  if (target) {
    const r = ik(hip, target, L.th, L.sh, typeof bend === 'number' ? bend : 1);
    return { knee: r.mid, ankle: r.end };
  }
  const ang = pose['leg' + side] || pose.leg;
  if (!ang) throw new Error(`pose has no leg for side ${side} (need ankle${side}, leg${side} or leg)`);
  const t = fromDown(ang[0]);
  const s = fromDown(ang[1]);
  const knee = add(hip, [sgn * t[0], t[1]], L.th);
  return { knee, ankle: add(knee, [sgn * s[0], s[1]], L.sh) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cameras. Both return { J, body } — J = named joints (world units), body =
// { back, mid, front } primitive layers (far limbs, torso+head, near limbs).
// `spec` is the exercise module: it may set footSide (±1), noLegs, noFeet.
// ─────────────────────────────────────────────────────────────────────────────

/** Side view: facing +x. Near side (N) drawn on top, far side (F) lighter. */
function buildSide(pose, spec = {}) {
  const hip = pose.hip;
  const lean = pose.lean || 0;
  const td = fromUp(lean);
  const shoulder = add(hip, td, L.torso * (pose.torso || 1));
  const hd = fromUp(lean + (pose.headTilt || 0));
  const head = add(shoulder, hd, L.neck + L.head);
  const neckEnd = add(shoulder, hd, L.neck + 0.02);
  const footSide = spec.footSide || 1;

  const J = { hip, shoulder, head, neckEnd };
  for (const side of ['N', 'F']) {
    const off = side === 'F' ? [FAR_DX, 0] : [0, 0];
    const h = add(hip, off);
    const s = add(shoulder, off);
    const leg = resolveLeg(pose, side, h, 1);
    const shinDir = norm(sub(leg.ankle, leg.knee));
    const toe =
      pose['toe' + side] ? add(pose['toe' + side], off) : add(leg.ankle, footSide > 0 ? ccw(shinDir) : cw(shinDir), L.foot);
    const arm = resolveArm(pose, side, s, 1);
    J['hip' + side] = h;
    J['shoulder' + side] = s;
    J['knee' + side] = leg.knee;
    J['ankle' + side] = leg.ankle;
    J['toe' + side] = toe;
    J['elbow' + side] = arm.elbow;
    J['wrist' + side] = arm.wrist;
  }

  const px = STROKE_PX;
  const body = { back: [], mid: [], front: [] };
  const limbs = (side, al, list) => {
    if (!spec.noLegs) {
      list.push(cap(J['hip' + side], J['knee' + side], px, INK, al));
      list.push(cap(J['knee' + side], J['ankle' + side], px, INK, al));
      if (!spec.noFeet) list.push(cap(J['ankle' + side], J['toe' + side], px, INK, al));
    }
    list.push(cap(J['shoulder' + side], J['elbow' + side], px, INK, al));
    list.push(cap(J['elbow' + side], J['wrist' + side], px, INK, al));
  };
  limbs('F', FAR_ALPHA, body.back);
  body.mid.push(cap(hip, shoulder, px, INK));
  body.mid.push(cap(shoulder, neckEnd, px, INK));
  body.mid.push(ring(head, L.head, px, INK));
  limbs('N', 1, body.front);
  return { J, body };
}

/** Front view: facing the viewer. R is drawn at +x. */
function buildFront(pose, spec = {}) {
  const hip = pose.hip;
  const neckBase = add(hip, [0, L.torso * (pose.torso || 1)]);
  const shY = neckBase[1] - 0.05;
  const half = pose.shoulderHalf || SHOULDER_HALF;
  const hipHalf = pose.hipHalf || 0;
  // Head placement: `neck` lengthens/shortens the visible neck (head follows);
  // `headDrop` lowers the head toward/below the shoulders (hinged lifter looking
  // at the floor) and swallows the neck stroke first. Written as deltas from
  // the defaults so a pose without the fields is bit-identical to before.
  const dNeck = (pose.neck != null ? pose.neck : NECK_VISIBLE) - NECK_VISIBLE;
  const drop = pose.headDrop || 0;
  const head = add(neckBase, [0, L.neck + L.head + dNeck - drop]);
  const neckEnd = add(neckBase, [0, Math.max(0, L.neck + 0.02 + dNeck - drop)]);
  const J = { hip, head, neckEnd, neckBase, shoulderR: [half, shY], shoulderL: [-half, shY] };
  for (const [side, sgn] of [['R', 1], ['L', -1]]) {
    const h = hipHalf ? add(hip, [sgn * hipHalf, 0]) : hip;
    const arm = resolveArm(pose, side, J['shoulder' + side], sgn);
    const leg = resolveLeg(pose, side, h, sgn);
    J['hip' + side] = h;
    J['elbow' + side] = arm.elbow;
    J['wrist' + side] = arm.wrist;
    J['knee' + side] = leg.knee;
    J['ankle' + side] = leg.ankle;
  }
  const px = STROKE_PX;
  const body = { back: [], mid: [], front: [] };
  body.mid.push(cap(hip, neckBase, px, INK));
  if (hipHalf) body.mid.push(cap(J.hipL, J.hipR, px, INK));
  body.mid.push(cap(J.shoulderL, J.shoulderR, px, INK));
  body.mid.push(cap(neckBase, neckEnd, px, INK));
  body.mid.push(ring(head, L.head, px, INK));
  for (const side of ['L', 'R']) {
    if (!spec.noLegs) {
      body.front.push(cap(J['hip' + side], J['knee' + side], px, INK));
      body.front.push(cap(J['knee' + side], J['ankle' + side], px, INK));
    }
    body.front.push(cap(J['shoulder' + side], J['elbow' + side], px, INK));
    body.front.push(cap(J['elbow' + side], J['wrist' + side], px, INK));
  }
  return { J, body };
}

/** Pick the camera from `spec.view` ('side' | 'front'). */
function build(pose, spec) {
  return spec.view === 'front' ? buildFront(pose, spec) : buildSide(pose, spec);
}

module.exports = {
  L, SHOULDER_HALF, FAR_DX, NECK_VISIBLE, ARM_SCALE_MIN, STAND, STAND_FRONT,
  rad, fromDown, fromUp, add, sub, norm, dist, ccw, cw, lerp, ik,
  lerpDeep, poseAt, smooth, cycle, TIMING,
  resolveArm, resolveLeg, buildSide, buildFront, build,
};
