/** Incline barbell press, side view: torso at 60° from vertical on a 30° incline bench, bar from lockout to the upper chest. */
'use strict';
const { add, fromUp } = require('../lib/figure');
const { bar, post, barbellSide, PLATE_R_SMALL } = require('../lib/equipment');

const BASE = { hip: [0.1, 0.8], lean: -60, ankleN: [0.8, 0], ankleF: [0.8, 0], elbowDir: -1 };

module.exports = {
  id: 'incline_barbell_press',
  view: 'side',
  fit: 0.68,
  keys: [
    { at: 0, ...BASE, wristN: [-0.68, 2.34], wristF: [-0.68, 2.34] }, // lockout, bar over the upper chest
    { at: 1, ...BASE, wristN: [-0.47, 1.31], wristF: [-0.47, 1.31] }, // bar touching the upper chest
  ],
  equipment: (J) => {
    // Back rest parallel to the torso, one body thickness below it; short seat; two posts.
    const axis = fromUp(-60);
    const down = [-0.5, -0.866];
    const p0 = add(add([0.05, 0.8], down, 0.28), axis, -0.1);
    const p1 = add(p0, axis, 1.5);
    const seatY = 0.52;
    return {
      back: [bar(p0, p1), bar([-0.05, seatY], [0.4, seatY]), post(-0.9, 1.03), post(0.28, seatY)],
      front: barbellSide(J.wristN, PLATE_R_SMALL),
    };
  },
};
