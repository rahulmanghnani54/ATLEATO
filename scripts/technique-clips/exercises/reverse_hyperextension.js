/** Reverse hyperextension, side view: torso prone on a high bench gripping the front handles, legs hanging; legs raised together to horizontal. */
'use strict';
const { L, add, fromDown } = require('../lib/figure');
const { bar, benchFlat } = require('../lib/equipment');

const PAD_Y = 1.15;
const HIP = [0, PAD_Y + 0.25];
const BASE = { hip: HIP, lean: -90, headTilt: -8, arm: [-25, -112] };

/** Straight legs at `deg` from hanging, toes pointing down the shin (plantar-flexed, as a hanging foot does). */
function legs(deg) {
  const ankle = add(HIP, fromDown(deg), L.th + L.sh);
  const toe = add(ankle, [0.09, -0.22]);
  return { leg: [deg, deg], toeN: toe, toeF: toe };
}

module.exports = {
  id: 'reverse_hyperextension',
  view: 'side',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    { at: 0, ...BASE, ...legs(-6) },
    { at: 0.5, ...BASE, ...legs(42) }, // mid key keeps the toe on the swinging ankle
    { at: 1, ...BASE, ...legs(90) },
  ],
  equipment: (J) => ({
    back: [
      ...benchFlat(-1.8, 0.12, PAD_Y, [-1.55, -0.4]),
      bar(add(J.wristN, [0, -0.11]), add(J.wristN, [0, 0.11])), // front handle
    ],
  }),
};
