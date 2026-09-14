/** Preacher curl, side view: seated, chest against the top of the pad, upper arms lying down its front slope with the elbows at the low edge, EZ bar from near-extension to full flexion. */
'use strict';
const { add, cw, fromDown } = require('../lib/figure');
const { bar, post, seat, barbellSide } = require('../lib/equipment');

const HIP = [0, 0.78];
const LEAN = 6; // leaning slightly onto the pad
const PAD_DEG = 42; // upper arm (and pad face) angle from straight down, sloping DOWN and AWAY from the lifter
const PAD_DIR = fromDown(PAD_DEG);
const PAD_UNDER = cw(PAD_DIR); // perpendicular to the pad face, pointing under the arm

module.exports = {
  id: 'preacher_curl',
  view: 'side',
  keys: [
    { at: 0, hip: HIP, lean: LEAN, ankleN: [0.4, 0], ankleF: [0.4, 0], arm: [PAD_DEG, PAD_DEG - 8] }, // near extension: forearm hanging below the pad's low edge
    { at: 1, hip: HIP, lean: LEAN, ankleN: [0.4, 0], ankleF: [0.4, 0], arm: [PAD_DEG, 168] }, // full curl: forearm folded up toward the shoulder
  ],
  equipment: (J) => {
    // The pad face runs directly under the upper arm (a stroke and a half below it, so it still shows as a green line):
    // top edge tucked under the armpit at chest height, low far edge at the elbow.
    const top = add(add(J.shoulder, PAD_UNDER, 0.115), PAD_DIR, -0.04);
    const low = add(top, PAD_DIR, 0.66);
    // Front of the bench: the pad's low edge rests on a short ledge and a post in front of the knees.
    const ledge = [low[0] + 0.3, low[1]];
    return {
      back: [
        bar(top, low),
        bar(low, ledge),
        post(ledge[0], ledge[1]),
        ...seat({ x: -0.02, y: 0.66, len: 0.5 }),
      ],
      front: barbellSide(J.wristN, 0.15),
    };
  },
};
