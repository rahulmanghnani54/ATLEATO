/**
 * Bent-over rear delt fly, front view of a lifter hinged ~45° toward the camera: the torso is
 * foreshortened to under half its length with the head sitting right on the shoulders, the pelvis
 * bar reads wider than the shoulder box, the dumbbells hang together under the chest and are raised
 * in an arc out to the shoulder line with a soft elbow.
 */
'use strict';
const { dumbbell } = require('../lib/equipment');

// hip 1.16 with the feet 0.2 either side → knees softly bent; shoulder line lands at y ≈ 1.41.
const BASE = {
  hip: [0, 1.16], hipHalf: 0.14, torso: 0.3, shoulderHalf: 0.3,
  ankleR: [0.2, 0], ankleL: [-0.2, 0],
  kneeDir: { R: 1, L: -1 },
  elbowDir: { R: 1, L: -1 }, // soft elbows bow outward / upward
};

module.exports = {
  id: 'rear_delt_fly',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    { at: 0, ...BASE, wristR: [0.27, 0.37], wristL: [-0.27, 0.37] }, // straight arms hanging from the shoulders, converging toward a point in front of (below) the chest
    // Mid keys sit on a 1.0 arc around the shoulder so the elbow stays soft all the way round instead of folding on the chord.
    { at: 0.25, ...BASE, wristR: [0.675, 0.483], wristL: [-0.675, 0.483] },
    { at: 0.5, ...BASE, wristR: [1.007, 0.703], wristL: [-1.007, 0.703] },
    { at: 0.75, ...BASE, wristR: [1.227, 1.035], wristL: [-1.227, 1.035] },
    { at: 1, ...BASE, wristR: [1.3, 1.48], wristL: [-1.3, 1.48] }, // out at the shoulder line, elbows up
  ],
  equipment: (J) => ({ front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)] }),
};
