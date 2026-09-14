/** Flat dumbbell press, side view: flat bench, dumbbells from beside the shoulders to lockout over the chest. */
'use strict';
const { dumbbell, benchFlat } = require('../lib/equipment');

const BASE = { hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], elbowDir: -1 };

module.exports = {
  id: 'flat_dumbbell_press',
  view: 'side',
  fit: 0.64,
  maxS: 230,
  keys: [
    { at: 0, ...BASE, wristN: [-0.78, 1.77], wristF: [-0.78, 1.77] }, // lockout over the chest
    { at: 1, ...BASE, wristN: [-0.6, 0.86], wristF: [-0.6, 0.86] }, // stretch: dumbbells beside the chest
  ],
  equipment: (J) => ({ back: benchFlat(-1.4, 0.55, 0.45, [-1.05, 0.3]), front: dumbbell(J.wristN, J.elbowN, 0.3) }),
};
