/** Decline bench press, side view: head end lower, feet hooked under the rollers, bar to the lower chest. */
'use strict';
const { FAR_ALPHA } = require('../lib/raster');
const { bar, post, barbellSide, roller } = require('../lib/equipment');

const HEAD_END = [-1.15, 0.33];
const FOOT_END = [0.98, 0.9];

const BASE = {
  hip: [0.2, 0.9],
  lean: -105, // lying, head toward -x and 15° below the hips
  legN: [105, 20],
  legF: [105, 20],
  toeN: [1.2, 0.6],
  toeF: [1.2, 0.6],
  elbowDir: -1,
};

module.exports = {
  id: 'decline_bench_press',
  view: 'side',
  fit: 0.62,
  maxS: 230,
  keys: [
    { at: 0, ...BASE, wristN: [-0.72, 1.68], wristF: [-0.72, 1.68] }, // lockout
    { at: 1, ...BASE, wristN: [-0.47, 0.93], wristF: [-0.47, 0.93] }, // bar on the lower chest
  ],
  equipment: (J) => ({
    // pad + two posts (the foot-end post sits under the hips so the hanging shins stay clear of it)
    back: [bar(HEAD_END, FOOT_END), post(-1.0, 0.37), post(0.45, 0.76), ...roller(J.ankleF, 0.1, FAR_ALPHA)],
    front: [...barbellSide(J.wristN), ...roller(J.ankleN, 0.1)],
  }),
};
