/** Kneeling cable crunch, side view: kneeling under a high pulley, rope held beside the head; the spine flexes to bring the elbows toward the thighs. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, ropeHandle } = require('../lib/equipment');

const STACK_X = 1.85;
const PULLEY = [STACK_X, 2.75];
const KNEEL = { hip: [0, 0.64], ankleN: [-0.58, 0.06], ankleF: [-0.58, 0.06], toeN: [-0.8, 0.02], toeF: [-0.8, 0.02], kneeDir: 1, elbowDir: -1 };

module.exports = {
  id: 'cable_crunch',
  view: 'side',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // Tall kneel, slight lean toward the stack, hands at the forehead.
    { at: 0, ...KNEEL, lean: 15, headTilt: 0, wristN: [0.6, 1.86], wristF: [0.6, 1.86] },
    // Crunched: torso curled down, chin tucked, hands still at the forehead, elbows down toward the thighs.
    { at: 1, ...KNEEL, lean: 62, headTilt: 28, wristN: [1.48, 1.02], wristF: [1.48, 1.02] },
  ],
  equipment: (J) => ({
    back: cableStack({ x: STACK_X, top: 2.95, pulley: PULLEY, to: J.wristN }),
    front: ropeHandle(J.wristN, sub(J.wristN, PULLEY)),
  }),
};
