/** Dumbbell front raise, side view: straight arms from the thighs to shoulder height in front. */
'use strict';
const { STAND } = require('../lib/figure');
const { dumbbell } = require('../lib/equipment');

module.exports = {
  id: 'front_raise',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: 0, arm: [4, 4] },
    { at: 1, ...STAND, lean: -3, arm: [88, 84] },
  ],
  equipment: (J) => ({ front: dumbbell(J.wristN, J.elbowN, 0.3) }),
};
