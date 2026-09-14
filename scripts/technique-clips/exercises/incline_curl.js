/** Incline dumbbell curl, side view: seated back on a 45° pad, arms hanging behind the torso, curled to shoulder height. */
'use strict';
const { add, ccw, fromUp } = require('../lib/figure');
const { FAR_ALPHA } = require('../lib/raster');
const { bar, post, dumbbell } = require('../lib/equipment');

const LEAN = -45;
const HIP = [0.1, 0.8];
const BASE = { hip: HIP, lean: LEAN, headTilt: 25, ankleN: [0.8, 0], ankleF: [0.8, 0] };

module.exports = {
  id: 'incline_curl',
  view: 'side',
  fit: 0.68,
  keys: [
    { at: 0, ...BASE, arm: [-4, -4] },
    { at: 1, ...BASE, arm: [-4, 138] },
  ],
  equipment: (J) => {
    // Back rest parallel to the torso, a body-thickness behind it; short seat; two posts.
    const axis = fromUp(LEAN);
    const back = ccw(axis); // behind/below the torso line
    const p0 = add(add(HIP, back, 0.26), axis, -0.1);
    const p1 = add(p0, axis, 1.5);
    const seatY = 0.55;
    return {
      back: [
        bar(p0, p1),
        bar([-0.05, seatY], [0.4, seatY]),
        post(p1[0] + 0.1, p1[1] - 0.1),
        post(0.28, seatY),
        ...dumbbell(J.wristF, J.elbowF, 0.3, FAR_ALPHA),
      ],
      front: dumbbell(J.wristN, J.elbowN, 0.3),
    };
  },
};
