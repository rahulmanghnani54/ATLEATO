/** Concentration curl, side view: seated on a flat bench, leaning forward, one arm braced inside the thigh curling a dumbbell. */
'use strict';
const { benchFlat, dumbbell } = require('../lib/equipment');

const BASE = {
  hip: [0, 0.8],
  lean: 46,
  headTilt: -26,
  leg: [66, 20],
  wristF: [0.3, 0.72], // free hand rests on the far thigh
  elbowDir: { N: 1, F: -1 },
};

module.exports = {
  id: 'concentration_curl',
  view: 'side',
  keys: [
    { at: 0, ...BASE, armN: [-16, -12] },
    { at: 1, ...BASE, armN: [-16, 126] },
  ],
  equipment: (J) => ({
    back: benchFlat(-0.62, 0.22, 0.66, [-0.42, 0.05]),
    front: dumbbell(J.wristN, J.elbowN, 0.28),
  }),
};
