/**
 * lib/equipment.js — pictogram equipment in the clip's stroke language.
 *
 * Every function returns an ARRAY OF PRIMITIVES in world units (see
 * lib/raster.js `cap` / `ring` / `disc`). The exercise module decides which
 * layer they go in: `back` (behind the figure) or `front` (over it). Arrays are
 * returned rather than drawn directly because the renderer measures the whole
 * rep's primitives first to fit the scene into frame.
 *
 * Conventions: accent colour, STROKE_PX strokes, cables/thin bars CABLE_PX,
 * floor at y = 0, torso = 1 unit. Points are [x, y] with y UP. Every function
 * takes an optional trailing `al` (alpha) so far-side equipment can be faded
 * with FAR_ALPHA like far-side limbs.
 */
'use strict';

const { ACCENT, STROKE_PX, CABLE_PX, cap, ring, disc } = require('./raster');
const { add, sub, norm, ccw, fromUp, fromDown } = require('./figure');

const PLATE_R = 0.26; // standard plate face radius (heavy lifts)
const PLATE_R_SMALL = 0.19; // lighter lifts — the ring must not swallow the head
const DUMBBELL_KNOB = 0.075; // dumbbell end-plate radius
const PULLEY_R = 0.075;
const ROLLER_R = 0.09;

// ─────────────────────────────────────────────────────────────────────────────
// Generic strokes
// ─────────────────────────────────────────────────────────────────────────────

/** Accent stroke from `a` to `b` (default STROKE_PX). The building block for everything below. */
const bar = (a, b, px = STROKE_PX, al = 1) => cap(a, b, px, ACCENT, al);
/** Vertical post from [x, top] down to the floor (or `bottom`). */
const post = (x, top, bottom = 0, al = 1) => bar([x, top], [x, bottom], STROKE_PX, al);

// ─────────────────────────────────────────────────────────────────────────────
// Free weights
// ─────────────────────────────────────────────────────────────────────────────

/** Barbell seen end-on at point `at`: the plate face as a ring, the bar end as a dot. */
function barbellSide(at, r = PLATE_R, al = 1) {
  return [ring(at, r, STROKE_PX, ACCENT, al), disc(at, 0.055, ACCENT, al)];
}

/** Barbell seen from the front: horizontal bar centred on `c` with a plate disc at each end. */
function barbellFront(c, halfLen = 0.62, plateR = 0.13, al = 1) {
  const a = add(c, [-halfLen, 0]);
  const b = add(c, [halfLen, 0]);
  return [bar(a, b, CABLE_PX, al), disc(a, plateR, ACCENT, al), disc(b, plateR, ACCENT, al)];
}

/** Dumbbell as a short thick capsule across the wrist, perpendicular to the forearm (or vertical). */
function dumbbell(wrist, elbow, len = 0.3, al = 1, vertical = false) {
  const d = vertical ? [0, 1] : ccw(norm(sub(wrist, elbow)));
  return dumbbellAt(wrist, d, len, al);
}

/** Dumbbell centred on `at`, along unit direction `dir`. */
function dumbbellAt(at, dir, len = 0.3, al = 1) {
  const a = add(at, dir, -len / 2);
  const b = add(at, dir, len / 2);
  return [bar(a, b, STROKE_PX, al), disc(a, DUMBBELL_KNOB, ACCENT, al), disc(b, DUMBBELL_KNOB, ACCENT, al)];
}

/** Small weight plate / kettlebell stand-in: a filled disc at `at`. */
const plate = (at, r = 0.12, al = 1) => [disc(at, r, ACCENT, al)];

// ─────────────────────────────────────────────────────────────────────────────
// Benches, seats, pads
// ─────────────────────────────────────────────────────────────────────────────

/** Flat bench: pad from x1 to x2 at height y, plus a post to the floor at each x in `legs`. */
function benchFlat(x1, x2, y, legs, al = 1) {
  const out = [bar([x1, y], [x2, y], STROKE_PX, al)];
  for (const lx of legs) out.push(post(lx, y, 0, al));
  return out;
}

/** Angled pad: from point `from`, `len` long, at `angleFromUp` degrees (0 = vertical, 90 = flat toward +x). */
function inclinePad(from, angleFromUp, len, al = 1) {
  return [bar(from, add(from, fromUp(angleFromUp), len), STROKE_PX, al)];
}

/**
 * Seat: pad centred on x at height y, a post to the floor, and an optional back
 * pad rising from the rear end.  `back = { height, angleFromUp = 0, rear = -1 }`
 * (rear = -1 → the back pad is at the -x end, +1 → the +x end).
 */
function seat({ x, y, len = 0.5, back = null, al = 1 }) {
  const out = [bar([x - len / 2, y], [x + len / 2, y], STROKE_PX, al), post(x, y, 0, al)];
  if (back) {
    const rear = back.rear || -1;
    const from = [x + (rear * len) / 2, y];
    out.push(...inclinePad(from, (back.angleFromUp || 0) * -rear, back.height, al));
  }
  return out;
}

/**
 * Incline bench (also the preacher / spider / chest-supported pad): a seat at
 * `seat` [x,y] and a back pad leaning back (toward -x) at `angleFromUp`
 * degrees, `padLen` long, with a post under the pad's top end.
 */
function inclineBench({ seat: s, angleFromUp = 30, padLen = 1.4, seatLen = 0.45, al = 1 }) {
  const top = add(s, fromUp(-angleFromUp), padLen);
  return [
    bar(s, top, STROKE_PX, al),
    bar(s, add(s, [seatLen, 0]), STROKE_PX, al),
    post(s[0] + seatLen * 0.6, s[1], 0, al),
    post(top[0] + 0.12, top[1] - 0.12, 0, al),
  ];
}

/**
 * Decline bench: pad from `head` (low end) to `foot` (high end), a post under
 * each end and a foot roller a little above the foot end.
 */
function declineBench({ head, foot, roller = true, al = 1 }) {
  const out = [bar(head, foot, STROKE_PX, al), post(head[0] + 0.15, head[1], 0, al), post(foot[0] - 0.15, foot[1], 0, al)];
  if (roller) out.push(disc(add(foot, [0.05, 0.2]), ROLLER_R, ACCENT, al));
  return out;
}

/**
 * Leg-press sled: reclined back pad rising from `seat` (leaning toward -x),
 * a short seat, and the angled foot platform drawn from `platform.a` (low end)
 * to `platform.b` (high end) with a strut down to the floor.
 */
function legPressSled({ seat: s, backAngleFromUp = 45, backLen = 1.1, seatLen = 0.55, platform, al = 1 }) {
  const backTop = add(s, fromUp(-backAngleFromUp), backLen);
  const pmid = add(platform.a, sub(platform.b, platform.a), 0.5);
  return [
    bar(s, backTop, STROKE_PX, al),
    bar(s, add(s, [seatLen, 0]), STROKE_PX, al),
    post(s[0] + seatLen * 0.5, s[1], 0, al),
    bar(platform.a, platform.b, STROKE_PX, al),
    bar(pmid, [pmid[0], 0], CABLE_PX, al), // strut to the floor
  ];
}

/** Small foot platform centred on `at` along unit `dir` (default vertical, i.e. a plate the feet push). */
function footPlatform(at, dir = [0, 1], len = 0.5, al = 1) {
  return [bar(add(at, dir, -len / 2), add(at, dir, len / 2), STROKE_PX, al)];
}

/** Step / plyo box as a rectangle standing on the floor: left edge x, width w, height h. */
function box({ x, w, h, y = 0, al = 1 }) {
  const a = [x, y];
  const b = [x + w, y];
  const c = [x + w, y + h];
  const d = [x, y + h];
  return [bar(a, b, STROKE_PX, al), bar(b, c, STROKE_PX, al), bar(c, d, STROKE_PX, al), bar(d, a, STROKE_PX, al)];
}

/** Wall: a vertical line at x from `bottom` to `top`. */
function wall({ x, top, bottom = 0, al = 1 }) {
  return [bar([x, bottom], [x, top], STROKE_PX, al)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bars, racks, machines
// ─────────────────────────────────────────────────────────────────────────────

/** Pull-up bar: horizontal bar from x1 to x2 at height y (default y = 0, hang the figure below). */
function pullupBar(x1 = -1.25, x2 = 1.25, y = 0, al = 1) {
  return [bar([x1, y], [x2, y], STROKE_PX, al)];
}

/** Two parallel dip bars seen from the side: posts at x1 and x2 with short handles on top. */
function dipBars({ x1, x2, top, handleLen = 0.35, al = 1 }) {
  return [
    post(x1, top, 0, al),
    post(x2, top, 0, al),
    bar([x1 - handleLen / 2, top], [x1 + handleLen / 2, top], STROKE_PX, al),
    bar([x2 - handleLen / 2, top], [x2 + handleLen / 2, top], STROKE_PX, al),
  ];
}

/** Rack upright at x with a safety pin at height y sticking out `pinLen` toward `dir` (±1). */
function rackPins({ x, y, height = 2.2, pinLen = 0.35, dir = 1, al = 1 }) {
  return [post(x, height, 0, al), bar([x, y], [x + dir * pinLen, y], STROKE_PX, al)];
}

/**
 * Machine lever: pivot disc at `pivot`, arm to `end`, and at the end either a
 * roller (disc) or a handle (short stroke perpendicular to the arm).
 */
function machineLever({ pivot, end, tip = 'roller', handleLen = 0.26, al = 1 }) {
  const out = [bar(pivot, end, CABLE_PX, al), disc(pivot, PULLEY_R, ACCENT, al)];
  if (tip === 'roller') out.push(disc(end, ROLLER_R, ACCENT, al));
  else if (tip === 'handle') {
    const d = ccw(norm(sub(end, pivot)));
    out.push(bar(add(end, d, -handleLen / 2), add(end, d, handleLen / 2), STROKE_PX, al));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cables
// ─────────────────────────────────────────────────────────────────────────────

/** Cable from `from` (pulley: a dot) to `to` (the hand). */
function cableLine(from, to, al = 1) {
  return [bar(from, to, CABLE_PX, al), disc(from, PULLEY_R, ACCENT, al)];
}

/**
 * Cable stack: a tall column at x from `base` up to `top`, a pulley at
 * `pulley` (default the top of the column) and a cable from it to `to`.
 * Omit `to` for the column only (e.g. the second column of a crossover).
 */
function cableStack({ x, top = 3.0, base = 0, pulley = null, to = null, al = 1 }) {
  const p = pulley || [x, top];
  const out = [post(x, top, base, al)];
  if (to) out.push(...cableLine(p, to, al));
  else out.push(disc(p, PULLEY_R, ACCENT, al));
  return out;
}

/** Low pulley: short column at x, pulley at height `top`, cable to `to`. */
function lowPulley({ x, top = 0.35, to = null, al = 1 }) {
  return cableStack({ x, top, base: 0, pulley: [x, top], to, al });
}

/** Straight bar / short handle across the hand at `at`, perpendicular to the cable direction `dir`. */
function handleBar(at, dir, len = 0.26, al = 1) {
  const d = ccw(norm(dir));
  return [bar(add(at, d, -len / 2), add(at, d, len / 2), STROKE_PX, al)];
}

/** Rope attachment: two short ends fanning out from `at` away from the cable (which comes from direction `-dir`). */
function ropeHandle(at, dir, len = 0.2, spreadDeg = 28, al = 1) {
  const d = norm(dir);
  const a = Math.atan2(d[1], d[0]);
  const s = (spreadDeg * Math.PI) / 180;
  const e1 = add(at, [Math.cos(a + s), Math.sin(a + s)], len);
  const e2 = add(at, [Math.cos(a - s), Math.sin(a - s)], len);
  return [bar(at, e1, CABLE_PX, al), bar(at, e2, CABLE_PX, al), disc(e1, 0.05, ACCENT, al), disc(e2, 0.05, ACCENT, al)];
}

/** V-handle: two short strokes meeting at `at`, opening toward `dir` (the hands). */
function vHandle(at, dir, len = 0.18, spreadDeg = 35, al = 1) {
  const d = norm(dir);
  const a = Math.atan2(d[1], d[0]);
  const s = (spreadDeg * Math.PI) / 180;
  return [
    bar(at, add(at, [Math.cos(a + s), Math.sin(a + s)], len), STROKE_PX, al),
    bar(at, add(at, [Math.cos(a - s), Math.sin(a - s)], len), STROKE_PX, al),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────

/** Ab wheel: a ring of radius r at `c` with the axle end (a dot) in the middle. */
function wheel({ c, r = 0.17, al = 1 }) {
  return [ring(c, r, STROKE_PX, ACCENT, al), disc(c, 0.055, ACCENT, al)];
}

/** Ankle / foot strap or roller pad at a joint (leg curl, leg extension). */
const roller = (at, r = ROLLER_R, al = 1) => [disc(at, r, ACCENT, al)];

module.exports = {
  PLATE_R, PLATE_R_SMALL, DUMBBELL_KNOB, PULLEY_R, ROLLER_R,
  bar, post,
  barbellSide, barbellFront, dumbbell, dumbbellAt, plate,
  benchFlat, inclinePad, seat, inclineBench, declineBench, legPressSled, footPlatform, box, wall,
  pullupBar, dipBars, rackPins, machineLever,
  cableLine, cableStack, lowPulley, handleBar, ropeHandle, vHandle,
  wheel, roller,
  // re-exported so equipment code needs one require
  fromUp, fromDown,
};
