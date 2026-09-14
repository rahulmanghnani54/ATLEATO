/** Standing barbell curl, side view: absolute arm angles so the hand swings in an arc. */
'use strict';
const { STAND } = require('../lib/figure');
const { barbellSide, PLATE_R_SMALL } = require('../lib/equipment');

module.exports = {
  id: 'bicep_curl',
  view: 'side',
  keys: [
    { at: 0, ...STAND, arm: [4, 4] },
    { at: 1, ...STAND, arm: [10, 140] },
  ],
  equipment: (J) => ({ front: barbellSide(J.wristN, PLATE_R_SMALL) }),
};
