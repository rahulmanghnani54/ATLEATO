/** Preacher curl, side view: seated, upper arms resting on the sloped pad, EZ bar from near-extension to full flexion. */
'use strict';
const { add, cw, fromDown } = require('../lib/figure');
const { bar, post, seat, barbellSide } = require('../lib/equipment');

const HIP = [0, 0.78];
const PAD_DEG = 42; // pad (and upper arm) angle from straight down, sloping forward
const PAD_DIR = fromDown(PAD_DEG);

module.exports = {
  id: 'preacher_curl',
  view: 'side',
  keys: [
    { at: 0, hip: HIP, lean: 2, ankleN: [0.4, 0], ankleF: [0.4, 0], arm: [PAD_DEG, PAD_DEG + 12] },
    { at: 1, hip: HIP, lean: 2, ankleN: [0.4, 0], ankleF: [0.4, 0], arm: [PAD_DEG, 168] },
  ],
  equipment: (J) => {
    // The pad runs parallel to the upper arm, a little below/behind it, from
    // the armpit down to the front where the elbows sit; a post holds its low end.
    const p0 = add(add(J.shoulder, cw(PAD_DIR), 0.2), PAD_DIR, 0.02);
    const p1 = add(p0, PAD_DIR, 0.95);
    const strut = [p1[0] + 0.22, p1[1]];
    return {
      back: [
        bar(p0, p1),
        bar(p1, strut),
        post(strut[0], strut[1]),
        ...seat({ x: -0.02, y: 0.66, len: 0.5 }),
      ],
      front: barbellSide(J.wristN, 0.15),
    };
  },
};
