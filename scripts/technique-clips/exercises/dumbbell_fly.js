/**
 * Flat dumbbell fly, front view from the foot of the bench (camera raised): the body lies along the
 * receding pad, no floor. The whole arc lives in the chest plane — the hands open from the dumbbells
 * touching over the sternum (between the shoulder line and the chin) to a wide stretch just below
 * the shoulder line, and never climb beside the head. Arms pointing at the camera at the top are
 * drawn foreshortened (`armScale`), so they converge inward instead of folding up beside the ears.
 */
'use strict';
const { L, dist } = require('../lib/figure');
const { ACCENT, STROKE_PX, disc } = require('../lib/raster');
const { bar, post, DUMBBELL_KNOB } = require('../lib/equipment');

const HIP = [0, 1.05];
const TORSO = 0.62; // lying body seen from the feet: the torso is foreshortened
const SHOULDER_HALF = 0.4; // default width: the arm stubs at the top rise at a visible angle instead of merging with the shoulder line
const NECK = 0.24; // longer than default: the chin (≈ 1.845) has to clear the dumbbells meeting under it at the top
const SH_Y = HIP[1] + L.torso * TORSO - 0.05; // shoulder line, y ≈ 1.62 (see buildFront)

const BASE = {
  hip: HIP,
  torso: TORSO,
  hipHalf: 0.1,
  shoulderHalf: SHOULDER_HALF,
  neck: NECK,
  ankleR: [0.12, -0.145],
  ankleL: [-0.12, -0.145],
  kneeDir: { R: 1, L: -1 },
};

// Hand path, top → stretch. y is monotonic: 1.71 (dumbbells touching on the sternum, 0.09 above the
// shoulder line, under the chin) down to 1.55 (just below the shoulder line, hands wide).
const TOP = { x: 0.085, y: 1.71 };
const STRETCH = { x: 1.45, y: 1.55 };
const BEND = 1.015; // drawn arm = 1.5 % longer than shoulder→hand: a soft elbow that stays close to the chord
// Dumbbells run along the body axis (neutral grip) so they stand vertical on screen; they shrink a
// little toward the top so the pair fits between the shoulder line and the chin. [len, knob radius].
const DB_TOP = [0.15, 0.062];
const DB_STRETCH = [0.26, DUMBBELL_KNOB];

// Range value where the hand passes the shoulder x on its way in: the arm points straight at the camera there.
const CROSS = Math.asin((SHOULDER_HALF - TOP.x) / (STRETCH.x - TOP.x)) / (Math.PI / 2);

/**
 * Keyframe at range value c: φ = 0 (arms toward the camera) → 90° (arms in the plane of the shoulders).
 * `bow` is how far the soft elbow is pushed off the shoulder→hand chord toward the floor (0 → on the
 * chord, 1 → the full IK offset): the elbow's rotation about the arm axis as seen in projection —
 * next to nothing while the arm points at the camera, full at the stretch. Its sign is per side
 * because the IK's notion of "which side" flips when the hand passes the shoulder x.
 */
function key(c, bow) {
  const phi = (c * Math.PI) / 2;
  const t = Math.sin(phi);
  const x = TOP.x + (STRETCH.x - TOP.x) * t;
  const y = TOP.y - (TOP.y - STRETCH.y) * (1 - Math.cos(phi));
  // Foreshortening: the drawn arm is as long as the screen distance shoulder→hand (+ a soft bend),
  // so an arm pointing at the camera is a short stub and an arm out in the chest plane is full length.
  const d = dist([SHOULDER_HALF, SH_Y], [x, y]);
  const armScale = Math.min(1, (d * BEND) / (L.ua + L.fa));
  const s = x < SHOULDER_HALF ? bow : -bow; // hand inboard of the shoulder: the IK's +1 side is "down" for R
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    at: r3(c),
    ...BASE,
    armScale: r3(armScale),
    elbowDir: { R: r3(s), L: r3(-s) },
    wristR: [r3(x), r3(y)],
    wristL: [r3(-x), r3(y)],
    db: [r3(DB_TOP[0] + (DB_STRETCH[0] - DB_TOP[0]) * t), r3(DB_TOP[1] + (DB_STRETCH[1] - DB_TOP[1]) * t)],
  };
}

/** Vertical dumbbell centred on the hand: handle + two end plates, sized from the pose's `db`. */
function verticalDumbbell(at, [len, knob]) {
  const a = [at[0], at[1] - len / 2];
  const b = [at[0], at[1] + len / 2];
  const px = Math.round((STROKE_PX * knob) / DUMBBELL_KNOB);
  return [bar(a, b, px), disc(a, knob, ACCENT), disc(b, knob, ACCENT)];
}

module.exports = {
  id: 'dumbbell_fly',
  view: 'front',
  floor: false,
  // The bow passes through ~0 exactly where the chord flips (CROSS), so the elbow never pops to the other side.
  keys: [key(0, 0.3), key(CROSS, 0.001), key(0.4, 0.6), key(0.7, 0.9), key(1, 1)],
  equipment: (J, pose) => ({
    back: benchFootEnd(),
    front: [...verticalDumbbell(J.wristR, pose.db), ...verticalDumbbell(J.wristL, pose.db)],
  }),
};

/** Bench pad in perspective from the foot end: a trapezoid narrowing away from the viewer, on two near legs. */
function benchFootEnd() {
  const nearY = -0.3;
  const farY = 2.35;
  const a = [-0.42, nearY];
  const b = [0.42, nearY];
  const c = [0.22, farY];
  const d = [-0.22, farY];
  return [bar(a, b), bar(b, c), bar(c, d), bar(d, a), post(-0.3, nearY, nearY - 0.35), post(0.3, nearY, nearY - 0.35)];
}
