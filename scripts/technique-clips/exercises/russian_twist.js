/** Russian twist, front view: seated on the floor leaning back (foreshortened torso), knees bent up, a small weight swung from one hip to the other. */
'use strict';
const { plate } = require('../lib/equipment');

const BASE = {
  hip: [0, 0.06], // pelvis on the floor
  hipHalf: 0.08,
  torso: 0.72, // leaned back ~45°
  legR: [168, 22], legL: [168, 22], // knees together and bent up in front (projected upward), heels apart on the floor
  elbowDir: { R: 1, L: -1 },
};

module.exports = {
  id: 'russian_twist',
  view: 'front',
  maxS: 260,
  timing: { down: 0.48, hold1: 0.02, up: 0.48 },
  keys: [
    { at: 0, ...BASE, wristR: [0.85, 0.4], wristL: [0.85, 0.4] }, // weight beside the right hip
    { at: 0.5, ...BASE, wristR: [0, 0.5], wristL: [0, 0.5] }, // passing the midline in front of the body
    { at: 1, ...BASE, wristR: [-0.85, 0.4], wristL: [-0.85, 0.4] }, // beside the left hip
  ],
  equipment: (J) => ({ front: plate(J.wristR, 0.13) }),
};
