/** Bent-over barbell row, side view: fixed 50° hinge, bar from hang to the lower ribs. */
'use strict';
const { barbellSide } = require('../lib/equipment');

module.exports = {
  id: 'barbell_row',
  view: 'side',
  keys: [
    { at: 0, hip: [-0.3, 1.05], lean: 50, headTilt: -10, ankleN: [0, 0], ankleF: [0, 0], wristRel: [0, -1.045], elbowDir: -1 },
    { at: 1, hip: [-0.3, 1.05], lean: 50, headTilt: -10, ankleN: [0, 0], ankleF: [0, 0], wristRel: [-0.19, -0.32], elbowDir: -1 },
  ],
  equipment: (J) => ({ front: barbellSide(J.wristN, 0.22) }),
};
