/** Calf press on the leg press, side view: reclined in the sled, legs nearly straight, balls of the feet on the bottom edge of the platform; only the ankles move the platform. */
'use strict';
const { CABLE_PX } = require('../lib/raster');
const { add, fromUp } = require('../lib/figure');
const { bar, post } = require('../lib/equipment');

const ANKLE = [0.84, 1.39]; // fixed: the hip and knee do not move in a calf press
const PLAT_DIR = [-Math.SQRT1_2, Math.SQRT1_2]; // platform runs perpendicular to the 45° leg line
const footVec = (deg) => [0.24 * Math.cos((deg * Math.PI) / 180), 0.24 * Math.sin((deg * Math.PI) / 180)];

// Sled: back pad parallel to the torso a body-thickness behind it, short seat, post.
const SEAT = [-0.2, 0.35];
const BACK_TOP = add(SEAT, fromUp(-45), 1.65);

const BASE = {
  hip: [0, 0.55], lean: -45, headTilt: 12,
  ankleN: ANKLE, ankleF: ANKLE,
  wristN: [0.1, 0.5], wristF: [0.1, 0.5], elbowDir: -1, // straight arms down the torso to the handles beside the seat
};

module.exports = {
  id: 'leg_press_calf_raise',
  view: 'side',
  fit: 0.66,
  maxS: 240,
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    // Heels dropped toward the sled: foot dorsiflexed, platform close.
    { at: 0, ...BASE, toeN: add(ANKLE, footVec(155)), toeF: add(ANKLE, footVec(155)) },
    // Ankles extended: the platform is pushed away along the leg line.
    { at: 1, ...BASE, toeN: add(ANKLE, footVec(112)), toeF: add(ANKLE, footVec(112)) },
  ],
  equipment: (J) => {
    // Platform under the ball of the foot, running up and away; a strut from its low end to the floor.
    const a = add(J.toeN, PLAT_DIR, -0.15);
    const b = add(J.toeN, PLAT_DIR, 0.85);
    return {
      back: [
        bar(SEAT, BACK_TOP),
        bar(SEAT, add(SEAT, [0.6, 0])),
        post(SEAT[0] + 0.3, SEAT[1]),
        bar(a, b),
        bar(a, [a[0], 0], CABLE_PX),
        bar([J.wristN[0], J.wristN[1] - 0.1], [J.wristN[0], J.wristN[1] + 0.1]), // handle
      ],
    };
  },
};
