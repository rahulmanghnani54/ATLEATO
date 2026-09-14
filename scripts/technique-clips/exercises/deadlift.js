/** Conventional deadlift, side view: the rep starts at the floor (c = 0) and stands up (c = 1). */
'use strict';
const { STAND } = require('../lib/figure');
const { barbellSide } = require('../lib/equipment');

module.exports = {
  id: 'deadlift',
  view: 'side',
  keys: [
    // Hinge start: hips ~0.17 above the knees, torso ~32° above horizontal, bar ~0.3 in front of the shin —
    // hip/lean chosen so the plate ring still sits on the floor (wrist y ≈ 0.25 = plate r + floor line).
    { at: 0, hip: [-0.55, 0.77], lean: 58, headTilt: -14, ankleN: [0, 0], ankleF: [0, 0], armsHang: true },
    { at: 1, ...STAND, headTilt: 0, armsHang: true },
  ],
  equipment: (J) => ({ front: barbellSide(J.wristN) }),
};
