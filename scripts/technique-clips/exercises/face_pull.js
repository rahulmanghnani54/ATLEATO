/** Cable face pull, side view: facing a high pulley, rope pulled from arm's length to beside the ears with the elbows high. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, ropeHandle } = require('../lib/equipment');

const STACK_X = 2.1;
const PULLEY = [STACK_X, 2.55]; // face height

const BASE = { hip: [0, 1.18], ankleN: [0.06, 0], ankleF: [0.06, 0] };

module.exports = {
  id: 'face_pull',
  view: 'side',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // Arms reaching toward the pulley.
    { at: 0, ...BASE, lean: 2, headTilt: 0, wristRel: [1.0, 0.3], elbowDir: -1 },
    // elbowDir is interpolated through 0: mid-rep the arm is drawn straight-but-short, which is what a
    // sideways-flared elbow looks like from the side; it then unfolds behind the shoulder.
    { at: 0.5, ...BASE, lean: -3, headTilt: 3, wristRel: [0.5, 0.3], elbowDir: 0.05 }, // (not exactly 0: the camera treats 0 as unset)
    // Finish: hands beside the ears, elbows behind the shoulders at ear height.
    { at: 1, ...BASE, lean: -8, headTilt: 6, wristRel: [-0.06, 0.28], elbowDir: 1 },
  ],
  equipment: (J) => ({
    back: cableStack({ x: STACK_X, top: 2.9, pulley: PULLEY, to: J.wristN }),
    front: ropeHandle(J.wristN, sub(J.wristN, PULLEY)),
  }),
};
