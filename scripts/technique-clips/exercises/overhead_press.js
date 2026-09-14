/** Standing barbell overhead press, side view, with a mid key to keep the forearm vertical. */
'use strict';
const { STAND } = require('../lib/figure');
const { barbellSide, PLATE_R_SMALL } = require('../lib/equipment');

module.exports = {
  id: 'overhead_press',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: -3, headTilt: -6, wristRel: [0.3, -0.1], elbowDir: -1 },
    // Mid key keeps the wrist over/in front of the elbow (forearm ≤ 30° from vertical) instead of the
    // straight-line path, which put the elbow forward of the bar mid-rep.
    { at: 0.5, ...STAND, lean: -1, headTilt: 3, wristRel: [0.3, 0.65], elbowDir: -1 },
    { at: 1, ...STAND, lean: 0, headTilt: 12, wristRel: [-0.05, 1.045], elbowDir: -1 },
  ],
  equipment: (J) => ({ front: barbellSide(J.wristN, PLATE_R_SMALL) }),
};
