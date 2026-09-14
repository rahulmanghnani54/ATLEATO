/** Pull-up, front view: hanging below a bar at y = 0, no floor line. */
'use strict';
const { pullupBar } = require('../lib/equipment');

module.exports = {
  id: 'pullup',
  view: 'front',
  floor: false,
  keys: [
    { at: 0, hip: [0, -2.027], wristR: [0.62, 0], wristL: [-0.62, 0], elbowDir: { R: -1, L: 1 }, leg: [4, 4] },
    { at: 1, hip: [0, -1.12], wristR: [0.62, 0], wristL: [-0.62, 0], elbowDir: { R: -1, L: 1 }, leg: [4, 4] },
  ],
  equipment: () => ({ back: pullupBar(-1.25, 1.25, 0) }),
};
