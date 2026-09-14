/** Dumbbell lateral raise, front view: both arms from the sides to shoulder height. */
'use strict';
const { dumbbell } = require('../lib/equipment');

module.exports = {
  id: 'lateral_raise',
  view: 'front',
  keys: [
    { at: 0, hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], arm: [7, 9] },
    { at: 1, hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], arm: [86, 72] },
  ],
  equipment: (J) => ({ front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)] }),
};
