/** Barbell hip thrust, side view: upper back on the bench, bar across the hips, feet flat; hips driven up to a flat torso. */
'use strict';
const { add } = require('../lib/figure');
const { benchFlat, barbellSide } = require('../lib/equipment');

const BAR_OFF = [0.08, 0.1]; // bar sits on the hip crease, a little forward/above the hip joint
const barAt = (hip) => add(hip, BAR_OFF);
const base = (hip, lean) => ({
  hip,
  lean,
  headTilt: 36,
  ankleN: [0.55, 0],
  ankleF: [0.55, 0],
  toeN: [0.79, 0],
  toeF: [0.79, 0],
  wristN: barAt(hip),
  wristF: barAt(hip),
  elbowDir: 1,
  kneeDir: 1,
});

module.exports = {
  id: 'hip_thrust',
  view: 'side',
  maxS: 260,
  keys: [
    { at: 0, ...base([0, 0.17], -53) }, // plates on the floor, shoulders on the bench edge
    { at: 1, ...base([0.14, 0.7], -90) }, // torso parallel with the floor
  ],
  equipment: (J) => ({
    back: benchFlat(-1.85, -0.72, 0.55, [-1.65, -0.9]),
    front: barbellSide(barAt(J.hip)),
  }),
};
