/** Dumbbell tricep kickback, side view: hinged over, upper arms pinned level with the back, forearms extend straight back. */
'use strict';
const { dumbbell } = require('../lib/equipment');

const BASE = { hip: [-0.3, 1.05], lean: 58, headTilt: -15, ankleN: [0.05, 0], ankleF: [-0.08, 0] };

module.exports = {
  id: 'tricep_kickback',
  view: 'side',
  timing: { down: 0.42, hold1: 0.08, up: 0.42 },
  keys: [
    { at: 0, ...BASE, arm: [-72, 10] }, // upper arm held level with the back, forearm hanging (~90° at the elbow)
    { at: 1, ...BASE, arm: [-72, -72] }, // arm straight back, dumbbell behind the hip
  ],
  equipment: (J) => ({ front: dumbbell(J.wristN, J.elbowN, 0.3) }),
};
