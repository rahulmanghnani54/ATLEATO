/**
 * Side plank, seen from the front of the lifter: a straight line from head to feet propped on one
 * forearm, the top arm pointing at the ceiling; the loop is a slow breathing rise and fall.
 *
 * Drawn with the side camera: the front camera keeps the torso vertical, and this pose needs the
 * body tilted ~13° above the floor. With both feet stacked and both shoulders on one line the
 * figure IS the front-on silhouette of a side plank; the near (N) arm is the supporting one.
 */
'use strict';

const HOLD = {
  lean: -76.4, // torso from the hip up toward the head at -x, ~13.6° above the floor
  headTilt: 0,
  ankleN: [1.1, 0.03], ankleF: [1.055, 0.03], // straight legs, feet stacked (F pre-shifted by FAR_DX)
  toeN: [1.3, 0], toeF: [1.3, 0],
  wristN: [-0.54, 0], // supporting forearm flat on the floor, elbow under the shoulder
  armF: [180, 180], // top arm straight up
  elbowDir: { N: -1, F: 1 },
  kneeDir: 1,
};

module.exports = {
  id: 'side_plank',
  view: 'side',
  timing: { down: 0.48, hold1: 0.02, up: 0.48 },
  keys: [
    { at: 0, hip: [-0.066, 0.312], ...HOLD },
    { at: 1, hip: [-0.06, 0.338], ...HOLD }, // breath in: the hips lift a touch
  ],
};
