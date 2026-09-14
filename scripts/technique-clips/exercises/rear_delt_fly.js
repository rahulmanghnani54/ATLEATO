/**
 * Bent-over rear delt fly, front view of a lifter hinged ~45° toward the camera. The torso is
 * foreshortened to 0.38 of standing, the shoulder box is narrow, and the head is dropped so its circle
 * sits ON the shoulder line (looking at the floor). The dumbbells start hanging from the shoulders
 * toward a point just in front of the chest — soft elbows bowed out, hands close but apart — and are
 * swept in an arc out to shoulder height with the elbows a touch above the hands.
 */
'use strict';
const { L, fromDown, add } = require('../lib/figure');
const { dumbbell } = require('../lib/equipment');

const HIP = [0, 1.12]; // feet 0.2 either side → softly bent knees
const TORSO = 0.38;
const SHOULDER_HALF = 0.3;
const NECK_BASE_Y = HIP[1] + L.torso * TORSO; // 1.50
const SH_Y = NECK_BASE_Y - 0.05; // shoulder line 1.45 (see buildFront)

const BASE = {
  hip: HIP,
  hipHalf: 0.14,
  torso: TORSO,
  shoulderHalf: SHOULDER_HALF,
  headDrop: L.neck + L.head + 0.05, // head centre exactly on the shoulder line (0.05 under the neck base); the neck stroke is swallowed
  ankleR: [0.2, 0],
  ankleL: [-0.2, 0],
  kneeDir: { R: 1, L: -1 },
  elbowDir: { R: 1, L: -1 }, // elbows bow outward while hanging and end up above the hands at the top
};

// Hand path as a polar sweep around the shoulder. Bottom: just inboard of straight down, hands
// converging in front of the chest (foreshortened — they come toward the camera). Top: out level
// with the shoulders, full-ish length.
const BOTTOM = { deg: -5, r: 0.62, armScale: 0.65 }; // hands ≈ 0.2 above the knees
const TOP = { deg: 90, r: 0.9, armScale: 0.9 };

function key(c) {
  const deg = BOTTOM.deg + (TOP.deg - BOTTOM.deg) * c;
  const r = BOTTOM.r + (TOP.r - BOTTOM.r) * c;
  const armScale = BOTTOM.armScale + (TOP.armScale - BOTTOM.armScale) * c;
  const w = add([SHOULDER_HALF, SH_Y], fromDown(deg), r); // + = outward for R
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { at: c, ...BASE, armScale: r3(armScale), wristR: [r3(w[0]), r3(w[1])], wristL: [r3(-w[0]), r3(w[1])] };
}

module.exports = {
  id: 'rear_delt_fly',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [0, 0.25, 0.5, 0.75, 1].map(key),
  // Dumbbells square to the shoulder→hand line (not the bowed forearm): level while hanging, upright at the top.
  equipment: (J) => ({ front: [...dumbbell(J.wristR, J.shoulderR, 0.28), ...dumbbell(J.wristL, J.shoulderL, 0.28)] }),
};
