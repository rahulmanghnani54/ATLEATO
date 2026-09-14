/** Seated dumbbell shoulder press, side view: upright bench, dumbbells from ear height to lockout overhead. */
'use strict';
const { seat, dumbbell } = require('../lib/equipment');

const BASE = { hip: [0.05, 0.62], lean: -4, ankleN: [0.62, 0], ankleF: [0.62, 0], elbowDir: -1 };

module.exports = {
  id: 'seated_dumbbell_press',
  view: 'side',
  keys: [
    { at: 0, ...BASE, headTilt: -4, wristN: [0.44, 1.86], wristF: [0.44, 1.86] }, // dumbbells at ear height
    // mid key keeps the forearm near vertical instead of the straight-line path
    { at: 0.5, ...BASE, headTilt: 0, wristN: [0.38, 2.3], wristF: [0.38, 2.3] },
    { at: 1, ...BASE, headTilt: 6, wristN: [0.1, 2.66], wristF: [0.1, 2.66] }, // lockout
  ],
  equipment: (J) => ({
    back: seat({ x: 0.05, y: 0.55, len: 0.55, back: { height: 1.35 } }),
    front: dumbbell(J.wristN, J.elbowN, 0.3),
  }),
};
