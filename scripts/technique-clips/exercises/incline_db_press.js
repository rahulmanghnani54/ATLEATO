/** Incline dumbbell press, side view: torso at 60° from vertical on an incline pad. */
'use strict';
const { add, fromUp } = require('../lib/figure');
const { bar, post, dumbbell } = require('../lib/equipment');

module.exports = {
  id: 'incline_db_press',
  view: 'side',
  fit: 0.68,
  keys: [
    { at: 0, hip: [0.1, 0.8], lean: -60, ankleN: [0.8, 0], ankleF: [0.8, 0], wristN: [-0.7, 2.34], wristF: [-0.7, 2.34], elbowDir: -1 },
    { at: 1, hip: [0.1, 0.8], lean: -60, ankleN: [0.8, 0], ankleF: [0.8, 0], wristN: [-0.47, 1.31], wristF: [-0.47, 1.31], elbowDir: -1 },
  ],
  equipment: (J) => {
    // Back rest parallel to the torso, a head-radius below it (the body has
    // thickness, the head rests on the pad); short seat; two posts.
    const axis = fromUp(-60);
    const down = [-0.5, -0.866];
    const p0 = add(add([0.05, 0.8], down, 0.28), axis, -0.1);
    const p1 = add(p0, axis, 1.5);
    const seatY = 0.52;
    return {
      back: [bar(p0, p1), bar([-0.05, seatY], [0.4, seatY]), post(-0.9, 1.03), post(0.28, seatY)],
      front: dumbbell(J.wristN, J.elbowN, 0.3),
    };
  },
};
