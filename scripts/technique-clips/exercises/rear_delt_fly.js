/**
 * Bent-over rear delt fly, front view of a lifter hinged ~45° toward the camera: the torso is
 * foreshortened to under a third of its length, the shoulder box is barely wider than the pelvis
 * bar, the dumbbells hang together in front of the chest (hands converging just below the short
 * torso, elbows bowed out) and are raised in an arc out to the shoulder line with a soft elbow.
 *
 * NOTE: the head/neck offset is fixed in lib/figure.js buildFront (head ring 0.32 u above the neck
 * base, shoulder line 0.05 u below it) — a pose field cannot lower the head onto the shoulders.
 */
'use strict';
const { dumbbell } = require('../lib/equipment');

// hip 1.16 with the feet 0.2 either side → knees softly bent; shoulder line lands at y ≈ 1.41.
// shoulderHalf 0.24 keeps the box ~0.8× the lateral_raise width so the figure reads as hinged, not upright.
const BASE = {
  hip: [0, 1.16], hipHalf: 0.14, torso: 0.3, shoulderHalf: 0.24,
  ankleR: [0.2, 0], ankleL: [-0.2, 0],
  kneeDir: { R: 1, L: -1 },
  elbowDir: { R: 1, L: -1 }, // elbows bow outward / upward all the way round
};

module.exports = {
  id: 'rear_delt_fly',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // Hands close together 0.73 u below the shoulder line (0.48 u below the pelvis bar, above the knees): the arms
    // hang toward the camera, so they read foreshortened with the elbows bowed out — not straight
    // down to the knees like lateral_raise.
    { at: 0, ...BASE, wristR: [0.15, 0.68], wristL: [-0.15, 0.68] },
    // Mid keys sweep an arc around the shoulder (radius 0.74 → 0.96 u) so the elbow stays soft
    // instead of folding on the chord.
    { at: 0.25, ...BASE, wristR: [0.492, 0.659], wristL: [-0.492, 0.659] },
    { at: 0.5, ...BASE, wristR: [0.832, 0.8], wristL: [-0.832, 0.8] },
    { at: 0.75, ...BASE, wristR: [1.091, 1.096], wristL: [-1.091, 1.096] },
    { at: 1, ...BASE, wristR: [1.2, 1.5], wristL: [-1.2, 1.5] }, // out at the shoulder line, elbows up, still soft
  ],
  equipment: (J) => ({ front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)] }),
};
