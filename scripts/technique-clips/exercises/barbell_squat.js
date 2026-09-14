/** Back squat, side view. Plate ring behind the body so the head stays readable. */
'use strict';
const { STAND } = require('../lib/figure');
const { barbellSide } = require('../lib/equipment');

module.exports = {
  id: 'barbell_squat',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: 4, wristRel: [-0.24, 0.08], elbowDir: 1 },
    { at: 1, hip: [-0.28, 0.4], lean: 32, ankleN: [0, 0], ankleF: [0, 0], wristRel: [-0.24, 0.08], elbowDir: 1 }, // hip crease below the knee (knee y ≈ 0.51)
  ],
  // The plate sits behind the body here: the true side view puts it over the
  // neck, which buries the head — a pictogram keeps the silhouette.
  equipment: (J) => ({ back: barbellSide(J.wristN) }),
};
