/** Seated cable row, side view: on the bench, feet on the platform, V-handle from a low pulley to the lower ribs. */
'use strict';
const { sub, norm, add } = require('../lib/figure');
const { lowPulley, vHandle, bar, post, footPlatform } = require('../lib/equipment');

const PULLEY = [1.95, 0.5];

module.exports = {
  id: 'seated_cable_row',
  view: 'side',
  keys: [
    // stretched: slight forward reach, arms straight toward the pulley
    { at: 0, hip: [0, 0.62], lean: 14, headTilt: -8, ankleN: [1.1, 0.3], ankleF: [1.1, 0.3], toeN: [1.2, 0.52], toeF: [1.2, 0.52], wristN: [1.02, 1.32], wristF: [1.02, 1.32], elbowDir: -1 },
    // squeezed: upright, handle at the lower ribs, elbows behind the torso
    { at: 1, hip: [0, 0.62], lean: -6, headTilt: 0, ankleN: [1.1, 0.3], ankleF: [1.1, 0.3], toeN: [1.2, 0.52], toeF: [1.2, 0.52], wristN: [0.12, 1.22], wristF: [0.12, 1.22], elbowDir: -1 },
  ],
  equipment: (J) => {
    const toHand = norm(sub(J.wristN, PULLEY));
    const attach = add(J.wristN, toHand, -0.12); // cable clips on just before the hands
    return {
      back: [
        ...lowPulley({ x: PULLEY[0], top: PULLEY[1], to: attach }),
        bar([-0.4, 0.55], [0.45, 0.55]), // bench seat
        post(0.02, 0.55),
        ...footPlatform([1.24, 0.4], norm([0.42, 1]), 0.62), // angled plate the feet brace on
      ],
      front: vHandle(attach, toHand, 0.16, 32),
    };
  },
};
