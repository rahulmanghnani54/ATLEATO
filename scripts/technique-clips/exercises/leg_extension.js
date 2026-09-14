/** Leg extension, side view: seated against the back pad, shins behind the roller, knees extended to straight legs. */
'use strict';
const { add, fromUp } = require('../lib/figure');
const { FAR_ALPHA } = require('../lib/raster');
const { bar, post, machineLever, roller } = require('../lib/equipment');

const LEAN = -10;
const SEAT_Y = 0.8;
const PIVOT = [0.55, 0.72];
const BASE = { hip: [0, 0.92], lean: LEAN, wristN: [0.25, 0.86], wristF: [0.25, 0.86], elbowDir: -1 };

/** Machine seat: pad, post, back rest parallel to the torso. */
function machineSeat() {
  const rear = [-0.24, SEAT_Y];
  return [
    bar([-0.24, SEAT_Y], [0.5, SEAT_Y]),
    post(0.08, SEAT_Y),
    bar(rear, add(rear, fromUp(LEAN), 1.25)),
  ];
}

module.exports = {
  id: 'leg_extension',
  view: 'side',
  timing: { down: 0.42, hold1: 0.12, up: 0.42 },
  keys: [
    { at: 0, ...BASE, leg: [88, 8] },
    { at: 1, ...BASE, leg: [88, 88] },
  ],
  equipment: (J) => ({
    back: [
      ...machineSeat(),
      ...machineLever({ pivot: PIVOT, end: J.ankleF, tip: 'roller', al: FAR_ALPHA }),
      ...machineLever({ pivot: PIVOT, end: J.ankleN, tip: null }),
    ],
    front: roller(J.ankleN),
  }),
};
