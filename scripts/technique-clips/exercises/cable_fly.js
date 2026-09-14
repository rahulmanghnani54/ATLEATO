/** Cable fly / crossover, front view: standing between two high pulleys, arms swept from a wide stretch to crossing at the lower chest. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, handleBar } = require('../lib/equipment');

const PULLEY_R = [1.6, 2.75];
const PULLEY_L = [-1.6, 2.75];
const BASE = { hip: [0, 1.18], torso: 0.94, ankleR: [0.25, 0], ankleL: [-0.25, 0] };

module.exports = {
  id: 'cable_fly',
  view: 'front',
  keys: [
    // Stretch: arms wide at shoulder height, soft elbows pointing down.
    { at: 0, ...BASE, wristR: [1.35, 2.15], wristL: [-1.35, 2.15], elbowDir: { R: -1, L: 1 } },
    { at: 0.5, ...BASE, wristR: [0.84, 1.42], wristL: [-0.84, 1.42], elbowDir: { R: 0, L: 0 } }, // hands sweep an arc down and in
    // Contraction: hands meet in front of the lower chest, elbows out and down.
    // elbowDir is interpolated, so the arms pass through straight mid-rep instead of flipping.
    { at: 1, ...BASE, wristR: [0.03, 1.6], wristL: [-0.03, 1.6], elbowDir: { R: 1, L: -1 } },
  ],
  equipment: (J) => ({
    back: [
      ...cableStack({ x: PULLEY_R[0], top: 2.9, pulley: PULLEY_R, to: J.wristR }),
      ...cableStack({ x: PULLEY_L[0], top: 2.9, pulley: PULLEY_L, to: J.wristL }),
    ],
    front: [...handleBar(J.wristR, sub(J.wristR, PULLEY_R), 0.22), ...handleBar(J.wristL, sub(J.wristL, PULLEY_L), 0.22)],
  }),
};
