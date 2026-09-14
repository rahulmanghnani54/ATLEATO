/** Dumbbell hammer curl, side view: neutral grip, dumbbells swing with the forearm from the thighs to the shoulders. */
'use strict';
const { STAND } = require('../lib/figure');
const { FAR_ALPHA } = require('../lib/raster');
const { dumbbell } = require('../lib/equipment');

module.exports = {
  id: 'hammer_curl',
  view: 'side',
  keys: [
    { at: 0, ...STAND, lean: -2, arm: [3, 3] },
    { at: 1, ...STAND, lean: -2, arm: [8, 142] },
  ],
  // Neutral grip seen from the side: the dumbbell lies in the picture plane,
  // perpendicular to the forearm (horizontal at the bottom, tilting with the curl).
  equipment: (J) => ({
    back: dumbbell(J.wristF, J.elbowF, 0.3, FAR_ALPHA),
    front: dumbbell(J.wristN, J.elbowN, 0.3),
  }),
};
