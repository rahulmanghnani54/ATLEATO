/** Step-up, side view: lead foot on a knee-high box, drive up to stand tall on it, trailing foot follows; step back down. */
'use strict';
const { FAR_ALPHA } = require('../lib/raster');
const { box, dumbbell } = require('../lib/equipment');

const BOX = { x: 0.3, w: 0.85, h: 0.55 };
const TOP = BOX.h;
const LEAD = { ankleN: [0.58, TOP], toeN: [0.82, TOP], armsHang: true, kneeDir: 1 };

module.exports = {
  id: 'step_up',
  view: 'side',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // On the floor behind the box, lead foot already up on it.
    { at: 0, ...LEAD, hip: [-0.08, 1.14], lean: 14, ankleF: [-0.2, 0], toeF: [0.04, 0] },
    // Mid: trailing foot lifts clear of the box edge.
    { at: 0.55, ...LEAD, hip: [0.36, 1.58], lean: 6, ankleF: [0.28, 0.72], toeF: [0.5, 0.66] },
    // Standing tall on the box.
    { at: 1, ...LEAD, hip: [0.64, 1.74], lean: 0, ankleF: [0.8, TOP], toeF: [1.04, TOP] },
  ],
  equipment: (J) => ({
    back: [...box(BOX), ...dumbbell(J.wristF, J.elbowF, 0.26, FAR_ALPHA)],
    front: dumbbell(J.wristN, J.elbowN, 0.26),
  }),
};
