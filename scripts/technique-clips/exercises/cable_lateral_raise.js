/** Single-arm cable lateral raise, front view: low pulley at the left, handle in the right hand starts across the body and rises out to shoulder height. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, cableLine, handleBar } = require('../lib/equipment');

const PULLEY = [-1.35, 0.3];
const BASE = { hip: [0, 1.18], ankleR: [0.22, 0], ankleL: [-0.22, 0], armL: [4, 4] };

module.exports = {
  id: 'cable_lateral_raise',
  view: 'front',
  keys: [
    // Angle-driven so the hand travels a true arc with a straight arm (IK targets fold the elbow mid-rep).
    { at: 0, ...BASE, armR: [-33, -30] }, // handle across the front of the thighs
    { at: 1, ...BASE, armR: [86, 80] }, // shoulder height, soft elbow
  ],
  equipment: (J) => ({
    back: cableStack({ x: PULLEY[0], top: 2.4, pulley: PULLEY }), // column with the pulley set low
    // The cable runs across the front of the body to the far hand.
    front: [...cableLine(PULLEY, J.wristR), ...handleBar(J.wristR, sub(J.wristR, PULLEY), 0.24)],
  }),
};
