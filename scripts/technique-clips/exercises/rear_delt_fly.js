/**
 * Bent-over rear delt fly, front view of a hinged lifter: the torso is foreshortened to half its
 * length (hinge ~60°), the dumbbells hang together under the chest and are raised in an arc out to
 * the shoulder line with a soft elbow.
 */
'use strict';
const { dumbbell } = require('../lib/equipment');

const BASE = {
  hip: [0, 1.18], hipHalf: 0.12, torso: 0.5, shoulderHalf: 0.44,
  ankleR: [0.3, 0], ankleL: [-0.3, 0],
  elbowDir: { R: 1, L: -1 }, // soft elbows
};

module.exports = {
  id: 'rear_delt_fly',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    { at: 0, ...BASE, wristR: [0.24, 0.6], wristL: [-0.24, 0.6] }, // hanging under the chest
    { at: 0.5, ...BASE, wristR: [1.2, 0.9], wristL: [-1.2, 0.9] }, // arc
    { at: 1, ...BASE, wristR: [1.47, 1.66], wristL: [-1.47, 1.66] }, // in line with the shoulders
  ],
  equipment: (J) => ({ front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)] }),
};
