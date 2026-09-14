/** Ab wheel rollout, side view: kneeling, hands on the wheel; rolled out until the body is nearly flat, then pulled back. */
'use strict';
const { wheel } = require('../lib/equipment');

const WHEEL_R = 0.17;
const KNEEL = { ankleN: [-0.58, 0.06], ankleF: [-0.58, 0.06], toeN: [-0.8, 0.02], toeF: [-0.8, 0.02], kneeDir: 1, elbowDir: -1 };

module.exports = {
  id: 'ab_wheel_rollout',
  view: 'side',
  fit: 0.6,
  keys: [
    // Kneeling tall-ish, torso ~55° forward, wheel under the shoulders.
    { at: 0, hip: [0, 0.63], lean: 55, headTilt: -25, ...KNEEL, wristN: [1.0, WHEEL_R + 0.02], wristF: [1.0, WHEEL_R + 0.02] },
    // Extended: knee → hip → shoulder → hands in one long line, wheel far out front.
    { at: 1, hip: [0.6, 0.215], lean: 75, headTilt: -12, ...KNEEL, wristN: [2.58, WHEEL_R + 0.02], wristF: [2.58, WHEEL_R + 0.02] },
  ],
  equipment: (J) => ({ front: wheel({ c: J.wristN, r: WHEEL_R }) }),
};
