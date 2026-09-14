/** Single-arm dumbbell row, side view: far knee and hand on a flat bench, near arm rows the dumbbell to the hip. */
'use strict';
const { dumbbell, benchFlat } = require('../lib/equipment');

const BENCH_Y = 0.45;

const BASE = {
  hip: [-0.3, 1.05],
  lean: 70, // torso nearly flat, head toward +x
  headTilt: -12,
  // far side: knee on the bench, shin lying back along it, hand planted on the far end
  legF: [0, -90],
  toeF: [-1.1, BENCH_Y],
  wristF: [1.05, BENCH_Y + 0.02],
  // near side: foot on the floor, slightly forward
  ankleN: [0.12, 0],
  elbowDir: { N: -1, F: 1 },
};

module.exports = {
  id: 'single_arm_db_row',
  view: 'side',
  fit: 0.68,
  maxS: 230,
  keys: [
    { at: 0, ...BASE, wristN: [0.66, 0.36] }, // full stretch, dumbbell hanging under the shoulder
    { at: 1, ...BASE, wristN: [0.22, 1.12] }, // dumbbell at the hip, elbow driven up and back
  ],
  equipment: (J) => ({
    back: benchFlat(-1.3, 1.3, BENCH_Y, [-1.0, 1.0]),
    front: dumbbell(J.wristN, J.elbowN, 0.3),
  }),
};
