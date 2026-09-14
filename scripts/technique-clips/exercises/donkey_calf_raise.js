/** Donkey calf raise, side view: hinged at the hips with the forearms on a rail, balls of the feet on a block; heels rise high. */
'use strict';
const { box, post, bar } = require('../lib/equipment');

const BLOCK = { x: 0.02, w: 0.6, h: 0.3 };
const TOE = [0.14, BLOCK.h];
const RAIL = { x: 1.5, top: 1.3, half: 0.4 };
const ARMS = { wristN: [1.72, RAIL.top + 0.03], wristF: [1.72, RAIL.top + 0.03], elbowDir: -1 };

module.exports = {
  id: 'donkey_calf_raise',
  view: 'side',
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    { at: 0, hip: [-0.08, 1.32], lean: 78, headTilt: -55, leg: [0, 0], toeN: TOE, toeF: TOE, ...ARMS },
    { at: 1, hip: [0, 1.7], lean: 78, headTilt: -55, leg: [0, 0], toeN: TOE, toeF: TOE, ...ARMS },
  ],
  equipment: () => ({
    back: [
      ...box(BLOCK),
      post(RAIL.x, RAIL.top),
      bar([RAIL.x - RAIL.half, RAIL.top], [RAIL.x + RAIL.half, RAIL.top]),
    ],
  }),
};
