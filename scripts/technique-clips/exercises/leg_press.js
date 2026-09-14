/** 45° leg press, side view: reclined in the sled seat, feet on the angled platform; the platform rides out with the feet. */
'use strict';
const { add } = require('../lib/figure');
const { bar, legPressSled } = require('../lib/equipment');

const HIP = [0.1, 0.62];
const P = [Math.SQRT1_2, Math.SQRT1_2]; // push direction (up and forward, 45°)
const Q = [-Math.SQRT1_2, Math.SQRT1_2]; // along the platform (toward its high end)

const base = (reach) => {
  const ankle = add(HIP, P, reach);
  return {
    hip: HIP,
    lean: -45,
    headTilt: 22,
    ankleN: ankle,
    ankleF: ankle,
    toeN: add(ankle, Q, 0.24),
    toeF: add(ankle, Q, 0.24),
    arm: [45, 45], // arms down along the torso, hands on the side handles by the hips
    kneeDir: 1,
  };
};

module.exports = {
  id: 'leg_press',
  view: 'side',
  keys: [
    { at: 0, ...base(1.12) }, // legs extended (not locked)
    { at: 1, ...base(0.72) }, // knees ~90°
  ],
  equipment: (J) => {
    const c = add(J.ankleN, P, 0.06);
    return {
      back: [
        ...legPressSled({
          seat: [-0.12, 0.5],
          backAngleFromUp: 45,
          backLen: 1.35,
          seatLen: 0.62,
          platform: { a: add(c, Q, -0.4), b: add(c, Q, 0.4) },
        }),
        bar(add(J.wristN, [0.02, -0.1]), add(J.wristN, [0.02, 0.1])), // side handle
      ],
    };
  },
};
