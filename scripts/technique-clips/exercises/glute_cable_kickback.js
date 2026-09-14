/** Glute cable kickback, side view: standing hinged slightly forward holding a post, ankle cuff on a low pulley behind; the working leg drives straight back and up to hip height and returns under control. */
'use strict';
const { cableStack, post, roller } = require('../lib/equipment');

const STACK_X = -1.95; // cable column behind the lifter, clear of the extended foot
const PULLEY = [STACK_X, 0.3]; // low pulley
const POST = [0.72, 1.55]; // support post, top at chest height — both hands rest on it

// Standing (far) leg under the hip with a soft knee; the near leg is the cuffed, working leg (angles from straight down, + forward).
const BASE = {
  hip: [0, 1.19],
  lean: 22,
  headTilt: -14, // eyes forward
  ankleF: [0, 0],
  kneeDir: { N: -1, F: 1 },
  wristN: POST,
  wristF: POST,
  elbowDir: -1, // elbows tucked down/back
};

module.exports = {
  id: 'glute_cable_kickback',
  view: 'side',
  keys: [
    { at: 0, ...BASE, legN: [6, 6] }, // start: working foot just in front of the standing foot, toe on the floor
    { at: 1, ...BASE, legN: [-88, -78] }, // top: leg extended straight back to hip height, toe pointed
  ],
  equipment: (J) => ({
    back: [
      ...cableStack({ x: STACK_X, top: 2.3, pulley: PULLEY, to: J.ankleN }),
      post(POST[0], POST[1]),
    ],
    front: roller(J.ankleN, 0.07), // ankle cuff
  }),
};
