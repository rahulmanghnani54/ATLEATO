/** Goblet squat, side view: dumbbell held vertically at the chest. */
'use strict';
const { STAND } = require('../lib/figure');
const { dumbbell } = require('../lib/equipment');

module.exports = {
  id: 'goblet_squat',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: 3, wristRel: [0.28, -0.2], elbowDir: -1 },
    { at: 1, hip: [-0.22, 0.45], lean: 16, ankleN: [0, 0], ankleF: [0, 0], wristRel: [0.28, -0.2], elbowDir: -1 },
  ],
  equipment: (J) => ({ front: dumbbell(J.wristN, J.elbowN, 0.3, 1, true) }),
};
