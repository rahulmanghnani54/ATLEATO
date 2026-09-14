/** Seated calf raise, side view: seated with a lever pad on the lower thighs, balls of the feet on a block; heels rise and the pad rides up with the knees. */
'use strict';
const { CABLE_PX, ACCENT, disc } = require('../lib/raster');
const { seat, box, bar, post } = require('../lib/equipment');

const BLOCK = { x: 0.66, w: 0.42, h: 0.22 };
const TOE = [0.78, BLOCK.h];
const PIVOT = [1.32, 0.55];
const PAD_LIFT = 0.13; // pad sits on top of the thigh, a stroke above the knee joint

const BASE = { hip: [0, 0.72], lean: 5, toeN: TOE, toeF: TOE, elbowDir: -1 };

module.exports = {
  id: 'seated_calf_raise',
  view: 'side',
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    // Heels dropped (stretch): knee ≈ [0.6, 0.72], hands on the pad.
    { at: 0, ...BASE, ankleN: [0.56, 0.12], ankleF: [0.56, 0.12], wristN: [0.42, 0.9], wristF: [0.42, 0.9] },
    // Heels up: the knee (and pad) rise with the ankle.
    { at: 1, ...BASE, ankleN: [0.6, 0.36], ankleF: [0.6, 0.36], wristN: [0.42, 1.12], wristF: [0.42, 1.12] },
  ],
  equipment: (J) => {
    const padY = J.kneeN[1] + PAD_LIFT;
    return {
      back: [
        ...seat({ x: 0, y: 0.6, len: 0.55 }),
        ...box(BLOCK),
        bar(PIVOT, [0.62, padY], CABLE_PX), // lever arm from the frame pivot to the pad
        disc(PIVOT, 0.075, ACCENT),
        post(PIVOT[0], PIVOT[1]), // frame upright under the pivot
      ],
      front: [bar([0.24, padY], [0.72, padY])], // thigh pad
    };
  },
};
