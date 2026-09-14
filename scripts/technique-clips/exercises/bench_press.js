/** Flat barbell bench press, side view (lying = lean -90, head toward -x). */
'use strict';
const { barbellSide, benchFlat } = require('../lib/equipment');

module.exports = {
  id: 'bench_press',
  view: 'side',
  fit: 0.64,
  maxS: 230,
  keys: [
    { at: 0, hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], wristN: [-0.8, 1.77], wristF: [-0.8, 1.77], elbowDir: -1 },
    { at: 1, hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], wristN: [-0.5, 0.87], wristF: [-0.5, 0.87], elbowDir: -1 },
  ],
  equipment: (J) => ({ back: benchFlat(-1.4, 0.55, 0.45, [-1.05, 0.3]), front: barbellSide(J.wristN) }),
};
