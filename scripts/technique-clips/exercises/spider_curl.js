/** Spider curl, side view: chest on an incline pad facing forward, arms hanging vertically, dumbbells curled with fixed elbows. */
'use strict';
const { add, cw, fromUp } = require('../lib/figure');
const { FAR_ALPHA } = require('../lib/raster');
const { bar, post, dumbbell } = require('../lib/equipment');

const LEAN = 52;
const HIP = [0, 0.95];
const BASE = { hip: HIP, lean: LEAN, headTilt: -30, ankleN: [-0.72, 0], ankleF: [-0.72, 0], toeN: [-0.48, 0], toeF: [-0.48, 0], kneeDir: 1 };

module.exports = {
  id: 'spider_curl',
  view: 'side',
  keys: [
    { at: 0, ...BASE, arm: [0, 0] },
    { at: 1, ...BASE, arm: [0, 135] },
  ],
  equipment: (J) => {
    // Incline pad parallel to the torso, a body-thickness under it (the chest lies
    // on it) rising toward +x to the upper chest; a post under each end.
    const axis = fromUp(LEAN);
    const off = cw(axis); // forward-down normal of the torso line
    const p0 = add(add(HIP, off, 0.24), axis, -0.12);
    const p1 = add(p0, axis, 1.15);
    return {
      back: [
        bar(p0, p1),
        post(p1[0] - 0.08, p1[1] - 0.06),
        post(p0[0] + 0.1, p0[1] + 0.07),
        ...dumbbell(J.wristF, J.elbowF, 0.3, FAR_ALPHA),
      ],
      front: dumbbell(J.wristN, J.elbowN, 0.3),
    };
  },
};
