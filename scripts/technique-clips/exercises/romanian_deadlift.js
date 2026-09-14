/** Romanian deadlift, side view: standing start, hinge to mid-shin with soft knees. */
'use strict';
const { STAND } = require('../lib/figure');
const { barbellSide } = require('../lib/equipment');

module.exports = {
  id: 'romanian_deadlift',
  view: 'side',
  keys: [
    { at: 0, ...STAND, headTilt: 0, armsHang: true },
    { at: 1, hip: [-0.55, 0.98], lean: 64, headTilt: -12, ankleN: [0, 0], ankleF: [0, 0], armsHang: true },
  ],
  equipment: (J) => ({ front: barbellSide(J.wristN) }),
};
