/** Lying leg curl, side view: prone on a bench (lean -90), heels curl toward the glutes. */
'use strict';
const { FAR_ALPHA } = require('../lib/raster');
const { benchFlat, roller } = require('../lib/equipment');

module.exports = {
  id: 'leg_curl',
  view: 'side',
  fit: 0.6,
  maxS: 250,
  footSide: -1,
  timing: { down: 0.4, hold1: 0.14, up: 0.4 },
  keys: [
    { at: 0, hip: [0.2, 1.03], lean: -90, arm: [-18, -95], leg: [90, 92] },
    { at: 1, hip: [0.2, 1.03], lean: -90, arm: [-18, -95], leg: [90, 225] },
  ],
  equipment: (J) => ({
    back: [...benchFlat(-1.0, 1.05, 0.75, [-0.75, 0.8]), ...roller(J.ankleF, 0.09, FAR_ALPHA)],
    front: roller(J.ankleN, 0.09),
  }),
};
