/** Standing cable curl, side view: facing a low pulley, straight bar curled from the thighs to the shoulders. */
'use strict';
const { STAND, sub } = require('../lib/figure');
const { lowPulley, handleBar } = require('../lib/equipment');

const PULLEY = [1.25, 0.32];

module.exports = {
  id: 'cable_curl',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: -3, arm: [6, 6] },
    { at: 1, ...STAND, lean: -3, arm: [10, 140] },
  ],
  equipment: (J) => ({
    back: lowPulley({ x: PULLEY[0], top: PULLEY[1], to: J.wristN }),
    front: handleBar(J.wristN, sub(J.wristN, PULLEY), 0.26),
  }),
};
