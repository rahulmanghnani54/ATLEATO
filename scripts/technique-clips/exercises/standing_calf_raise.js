/** Standing calf raise, side view: balls of the feet on a step block, hands on a support rail; heels from below the step to a high rise. */
'use strict';
const { box, post, bar } = require('../lib/equipment');

const BLOCK = { x: 0.02, w: 0.6, h: 0.3 };
const TOE = [0.14, BLOCK.h]; // ball of the foot on the block edge, fixed
const RAIL_X = 0.72;
const RAIL_TOP = 1.95;
const HANDS = { wristN: [RAIL_X, RAIL_TOP + 0.03], wristF: [RAIL_X, RAIL_TOP + 0.03], elbowDir: -1 };

module.exports = {
  id: 'standing_calf_raise',
  view: 'side',
  fit: 0.78,
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    // Heels dropped below the step (stretch).
    { at: 0, hip: [-0.08, 1.32], lean: 2, leg: [0, 0], toeN: TOE, toeF: TOE, ...HANDS },
    // Up on the toes.
    { at: 1, hip: [-0.02, 1.7], lean: 2, leg: [0, 0], toeN: TOE, toeF: TOE, ...HANDS },
  ],
  equipment: () => ({
    back: [
      ...box(BLOCK),
      post(RAIL_X, RAIL_TOP),
      bar([RAIL_X - 0.2, RAIL_TOP], [RAIL_X + 0.2, RAIL_TOP]),
    ],
  }),
};
