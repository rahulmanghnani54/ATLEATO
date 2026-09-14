/** Seated barbell overhead press, side view: upright bench, bar from the upper chest to lockout, head through at the top. */
'use strict';
const { seat, barbellSide, PLATE_R_SMALL } = require('../lib/equipment');

const BASE = { hip: [0.05, 0.62], lean: -4, ankleN: [0.62, 0], ankleF: [0.62, 0], elbowDir: -1 };

module.exports = {
  id: 'seated_barbell_press',
  view: 'side',
  keys: [
    { at: 0, ...BASE, headTilt: -6, wristRel: [0.3, -0.1] }, // bar racked on the upper chest
    // mid key keeps the wrist over the elbow (forearm near vertical) while the bar clears the face
    { at: 0.5, ...BASE, headTilt: 3, wristRel: [0.3, 0.65] },
    { at: 1, ...BASE, headTilt: 12, wristRel: [-0.05, 1.045] }, // lockout over the head
  ],
  equipment: (J) => ({
    back: seat({ x: 0.05, y: 0.55, len: 0.55, back: { height: 1.35 } }),
    front: barbellSide(J.wristN, PLATE_R_SMALL),
  }),
};
