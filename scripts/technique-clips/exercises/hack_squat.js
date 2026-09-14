/** Hack squat, side view: back on the sloped sled pad, shoulders under the yokes, feet on the fixed platform; the body slides down the rails. */
'use strict';
const { add, ccw, cw, fromUp } = require('../lib/figure');
const { bar, post, footPlatform } = require('../lib/equipment');

const LEAN = -40;
const A = fromUp(LEAN); // rail / pad axis (up and back)
const BACK = ccw(A); // normal from the torso toward the pad
const FRONT = cw(A);
const RAIL_BASE = [0.15, 0.04];
const RAIL_TOP = add(RAIL_BASE, A, 2.85);
const PLAT_ROOT = add(RAIL_BASE, A, 0.1); // platform leaves the rail here, perpendicular to it
const ANKLE = add(add(PLAT_ROOT, FRONT, 0.48), A, 0.06);
const TOE = add(ANKLE, FRONT, 0.24);
const hipAt = (alongRail) => add(add(RAIL_BASE, A, alongRail), FRONT, 0.3); // torso a body-thickness in front of the pad
const HIP_TOP = hipAt(1.36);
const HIP_BOT = hipAt(0.78);

const base = (hip) => ({
  hip,
  lean: LEAN,
  headTilt: 30,
  ankleN: ANKLE,
  ankleF: ANKLE,
  toeN: TOE,
  toeF: TOE,
  arm: [-LEAN, 172], // upper arm down along the torso, forearm up to the yoke handle
  kneeDir: 1,
});

module.exports = {
  id: 'hack_squat',
  view: 'side',
  keys: [
    { at: 0, ...base(HIP_TOP) },
    { at: 1, ...base(HIP_BOT) },
  ],
  equipment: (J) => {
    // Shoulder yoke rides with the figure: a short pad across the shoulder, from the rail forward.
    const y0 = add(J.shoulder, A, 0.04);
    return {
      back: [
        bar(RAIL_BASE, RAIL_TOP),
        post(RAIL_TOP[0] + 0.12, RAIL_TOP[1] - 0.12),
        ...footPlatform(add(PLAT_ROOT, FRONT, 0.45), FRONT, 0.9),
        post(ANKLE[0] + 0.1, ANKLE[1] - 0.06),
      ],
      front: [bar(add(y0, BACK, 0.3), add(y0, FRONT, 0.14))],
    };
  },
};
