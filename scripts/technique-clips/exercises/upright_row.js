/** Barbell upright row, front view: bar from the thighs up along the body to the lower chest, elbows leading out to the sides. */
'use strict';
const { lerp } = require('../lib/figure');
const { barbellFront } = require('../lib/equipment');

const BASE = { hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], elbowDir: { R: 1, L: -1 } };

module.exports = {
  id: 'upright_row',
  view: 'front',
  keys: [
    { at: 0, ...BASE, wristR: [0.24, 1.06], wristL: [-0.24, 1.06] },
    { at: 1, ...BASE, wristR: [0.24, 1.86], wristL: [-0.24, 1.86] },
  ],
  equipment: (J) => ({ front: barbellFront(lerp(J.wristL, J.wristR, 0.5), 0.7, 0.13) }),
};
