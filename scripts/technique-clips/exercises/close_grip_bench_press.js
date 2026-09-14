/** Close-grip bench press, side view: flat bench, elbows tucked along the ribs, bar to the lower chest. */
'use strict';
const { barbellSide, benchFlat, PLATE_R_SMALL } = require('../lib/equipment');

const BASE = { hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], elbowDir: -1 };

module.exports = {
  id: 'close_grip_bench_press',
  view: 'side',
  fit: 0.64,
  maxS: 230,
  keys: [
    { at: 0, ...BASE, wristN: [-0.62, 1.77], wristF: [-0.62, 1.77] }, // lockout over the lower chest
    { at: 1, ...BASE, wristN: [-0.38, 0.9], wristF: [-0.38, 0.9] }, // bar on the lower chest, elbows in
  ],
  equipment: (J) => ({ back: benchFlat(-1.4, 0.55, 0.45, [-1.05, 0.3]), front: barbellSide(J.wristN, PLATE_R_SMALL) }),
};
