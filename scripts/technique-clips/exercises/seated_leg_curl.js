/** Seated leg curl, side view: seated under the thigh pad, roller behind the ankles, heels curled down and under toward the seat. */
'use strict';
const { add, sub, norm, cw, fromUp } = require('../lib/figure');
const { FAR_ALPHA } = require('../lib/raster');
const { bar, post, machineLever, roller } = require('../lib/equipment');

const LEAN = -12;
const SEAT_Y = 0.8;
const PIVOT = [0.55, 0.72];
const BASE = { hip: [0, 0.92], lean: LEAN, wristN: [0.22, 0.86], wristF: [0.22, 0.86], elbowDir: -1 };

/** Machine seat: pad, post, back rest parallel to the torso, thigh pad over the knees. */
function machineSeat() {
  const rear = [-0.24, SEAT_Y];
  return [
    bar([-0.24, SEAT_Y], [0.5, SEAT_Y]),
    post(0.08, SEAT_Y),
    bar(rear, add(rear, fromUp(LEAN), 1.25)),
    bar([0.28, 1.05], [0.66, 1.05]),
  ];
}

/** Roller centre: behind the lower calf, just below/behind the ankle. */
const rollerAt = (knee, ankle) => add(ankle, cw(norm(sub(ankle, knee))), 0.1);

module.exports = {
  id: 'seated_leg_curl',
  view: 'side',
  keys: [
    { at: 0, ...BASE, leg: [82, 76] },
    { at: 1, ...BASE, leg: [82, -6] },
  ],
  equipment: (J) => {
    const rN = rollerAt(J.kneeN, J.ankleN);
    const rF = rollerAt(J.kneeF, J.ankleF);
    return {
      back: [
        ...machineSeat(),
        ...machineLever({ pivot: PIVOT, end: rF, tip: 'roller', al: FAR_ALPHA }),
        ...machineLever({ pivot: PIVOT, end: rN, tip: null }),
      ],
      front: roller(rN),
    };
  },
};
