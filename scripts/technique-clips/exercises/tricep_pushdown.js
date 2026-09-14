/** Cable pushdown, side view: cable from a high anchor to the hand, short bar across the hand. */
'use strict';
const { STAND, sub } = require('../lib/figure');
const { cableLine, handleBar } = require('../lib/equipment');

module.exports = {
  id: 'tricep_pushdown',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: 8, arm: [12, 95] },
    { at: 1, ...STAND, lean: 8, arm: [12, 8] },
  ],
  equipment: (J) => {
    const anchor = [0.75, 3.1];
    return {
      back: cableLine(anchor, J.wristN),
      front: handleBar(J.wristN, sub(J.wristN, anchor)),
    };
  },
};
