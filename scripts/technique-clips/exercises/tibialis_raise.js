/** Wall tibialis raise, side view: back against a wall, feet a step in front, heels down; toes lift toward the shins. */
'use strict';
const { wall } = require('../lib/equipment');

const WALL_X = -0.44;
const BASE = { hip: [-0.24, 1.08], lean: -8, headTilt: 8, ankleN: [0.28, 0], ankleF: [0.28, 0], armsHang: true, kneeDir: 1 };

module.exports = {
  id: 'tibialis_raise',
  view: 'side',
  fit: 0.78,
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    { at: 0, ...BASE, toeN: [0.52, 0], toeF: [0.52, 0] },
    { at: 1, ...BASE, toeN: [0.44, 0.17], toeF: [0.44, 0.17] },
  ],
  equipment: () => ({ back: wall({ x: WALL_X, top: 2.85 }) }),
};
