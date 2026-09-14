/** Lat pulldown, side view: seated under the thigh pad, bar from overhead to the upper chest. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, seat, handleBar, bar } = require('../lib/equipment');

const TOP = [1.55, 2.95]; // top pulley of the stack

module.exports = {
  id: 'lat_pulldown',
  view: 'side',
  maxS: 165, // a 3-unit-tall stack needs a wider view than a standing figure
  keys: [
    { at: 0, hip: [0, 0.75], lean: -5, ankleN: [0.55, 0], ankleF: [0.55, 0], wristN: [0.25, 2.6], wristF: [0.25, 2.6], elbowDir: -1 },
    { at: 1, hip: [0, 0.75], lean: -15, ankleN: [0.55, 0], ankleF: [0.55, 0], wristN: [0.2, 1.55], wristF: [0.2, 1.55], elbowDir: -1 },
  ],
  equipment: (J) => ({
    back: [
      ...cableStack({ x: TOP[0], top: TOP[1], to: J.wristN }),
      ...seat({ x: 0.1, y: 0.62, len: 0.6 }),
      // thigh pad: short bar over the thighs on an upright in front of the feet
      bar([0.3, 0.84], [0.95, 0.84]),
      bar([0.95, 0.84], [0.95, 0]),
    ],
    front: handleBar(J.wristN, sub(J.wristN, TOP)),
  }),
};
