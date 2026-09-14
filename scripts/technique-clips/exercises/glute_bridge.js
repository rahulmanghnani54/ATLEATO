/** Glute bridge, side view: lying on the back, knees bent, feet flat; hips driven up to a straight line from shoulders to knees. */
'use strict';

const base = (hip, lean, headTilt, wrist) => ({
  hip,
  lean,
  headTilt,
  ankleN: [0.5, 0],
  ankleF: [0.5, 0],
  toeN: [0.74, 0],
  toeF: [0.74, 0],
  wristN: wrist,
  wristF: wrist,
  elbowDir: 1,
  kneeDir: 1,
});

module.exports = {
  id: 'glute_bridge',
  view: 'side',
  maxS: 300,
  keys: [
    // Shoulders and head stay on the floor; arms lie along the floor by the sides.
    { at: 0, ...base([0, 0.22], -90, 18, [0.03, 0.07]) },
    { at: 1, ...base([0, 0.6], -115, 43, [0.13, 0.07]) },
  ],
  equipment: () => ({}),
};
