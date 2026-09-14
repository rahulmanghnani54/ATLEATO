/**
 * Barbell shrug, front view: standing tall, straight arms, bar at the thighs; the shoulder girdle lifts
 * and holds. The front camera fixes the shoulders relative to the torso, so the shrug is a torso-length
 * lift (the whole girdle + bar rise ~0.15 while the hips and feet stay put).
 */
'use strict';
const { lerp } = require('../lib/figure');
const { barbellFront } = require('../lib/equipment');

const BASE = { hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], armsHang: true };

module.exports = {
  id: 'barbell_shrug',
  view: 'front',
  timing: { down: 0.38, hold1: 0.18, up: 0.38 },
  keys: [
    { at: 0, ...BASE, torso: 1.0 },
    { at: 1, ...BASE, torso: 1.15 },
  ],
  equipment: (J) => ({ front: barbellFront(lerp(J.wristL, J.wristR, 0.5), 0.78, 0.14) }),
};
