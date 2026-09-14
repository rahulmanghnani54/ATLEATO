/** Machine shoulder press, side view: seated against the pad, a lever arm swings the handles from shoulder height to lockout. */
'use strict';
const { seat, machineLever, post } = require('../lib/equipment');

const PIVOT = [1.25, 2.2]; // lever pivot on the frame in front of the seat
// Wrist path = points on the lever's arc (radius 1.0) at 205°, 180°, 155° — three keys keep it near-circular.
const BASE = { hip: [0.05, 0.62], lean: -3, ankleN: [0.62, 0], ankleF: [0.62, 0], elbowDir: -1 };

module.exports = {
  id: 'machine_shoulder_press',
  view: 'side',
  keys: [
    { at: 0, ...BASE, wristN: [0.34, 1.78], wristF: [0.34, 1.78] }, // handles at shoulder height
    { at: 0.5, ...BASE, wristN: [0.25, 2.2], wristF: [0.25, 2.2] },
    { at: 1, ...BASE, wristN: [0.34, 2.62], wristF: [0.34, 2.62] }, // lockout
  ],
  equipment: (J) => ({
    back: [
      ...seat({ x: 0.05, y: 0.55, len: 0.55, back: { height: 1.35 } }),
      post(PIVOT[0], PIVOT[1] + 0.12), // frame upright carrying the pivot
      ...machineLever({ pivot: PIVOT, end: J.wristN, tip: 'handle', handleLen: 0.24 }),
    ],
  }),
};
