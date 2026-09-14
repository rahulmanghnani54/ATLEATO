/** Skull crusher, side view: on a flat bench, upper arms fixed vertical, forearms hinge the short bar to the forehead. */
'use strict';
const { barbellSide, benchFlat } = require('../lib/equipment');

const BASE = { hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0] };

module.exports = {
  id: 'skull_crusher',
  view: 'side',
  fit: 0.64,
  maxS: 230,
  timing: { down: 0.42, hold1: 0.08, up: 0.42 },
  keys: [
    { at: 0, ...BASE, arm: [192, 192] }, // arms straight, bar over the face
    { at: 1, ...BASE, arm: [192, 290] }, // upper arm still; forearm folded, bar just above the forehead
  ],
  equipment: (J) => ({ back: benchFlat(-1.4, 0.55, 0.45, [-1.05, 0.3]), front: barbellSide(J.wristN, 0.12) }),
};
