/** Rack pull, side view: bar resting on the rack pins at knee height; flat-back hinge, hips driven through to lockout. */
'use strict';
const { STAND } = require('../lib/figure');
const { rackPins, barbellSide } = require('../lib/equipment');

const PIN_Y = 0.5;

module.exports = {
  id: 'rack_pull',
  view: 'side',
  keys: [
    // Hinge with the bar on the pins: wrist ≈ [0.35, 0.51], plate ring resting on the front pin.
    { at: 0, hip: [-0.42, 0.92], lean: 50, headTilt: -12, ankleN: [0, 0], ankleF: [0, 0], armsHang: true },
    { at: 1, ...STAND, headTilt: 0, armsHang: true },
  ],
  equipment: (J) => ({
    back: [
      ...rackPins({ x: 0.82, y: PIN_Y, height: 2.35, pinLen: 0.47, dir: -1 }),
      ...rackPins({ x: -0.95, y: PIN_Y, height: 2.35, pinLen: 0.3, dir: 1 }),
    ],
    front: barbellSide(J.wristN),
  }),
};
