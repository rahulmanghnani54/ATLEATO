/** Hanging leg raise, side view: hanging from a bar at y = 0 with straight arms; straight legs lift to the horizontal, pelvis curling slightly. */
'use strict';
const { pullupBar } = require('../lib/equipment');

// Hands a little in front of the shoulders so the arms read beside the head rather than through it.
const HANG = { wristN: [0.3, 0], wristF: [0.3, 0], elbowDir: -1 };

module.exports = {
  id: 'hanging_leg_raise',
  view: 'side',
  floor: false,
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    { at: 0, hip: [0.1, -2.05], lean: -5, headTilt: 2, ...HANG, leg: [4, 4] },
    { at: 1, hip: [-0.05, -1.99], lean: -12, headTilt: 10, ...HANG, leg: [92, 92] },
  ],
  equipment: () => ({ back: pullupBar(-1.1, 1.7, 0) }),
};
