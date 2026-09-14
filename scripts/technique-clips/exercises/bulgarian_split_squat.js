/** Bulgarian split squat, side view: rear foot up on a bench behind, front foot forward, dumbbells hanging; lowered until the back knee nears the floor. */
'use strict';
const { FAR_ALPHA } = require('../lib/raster');
const { benchFlat, dumbbell } = require('../lib/equipment');

const BENCH_Y = 0.45;
const BASE = {
  ankleN: [0.38, 0],
  ankleF: [-0.72, BENCH_Y + 0.06],
  toeF: [-0.95, BENCH_Y + 0.02],
  armsHang: true,
  kneeDir: 1,
};

module.exports = {
  id: 'bulgarian_split_squat',
  view: 'side',
  keys: [
    { at: 0, ...BASE, hip: [-0.12, 1.08], lean: 6 },
    { at: 1, ...BASE, hip: [-0.22, 0.6], lean: 12 },
  ],
  equipment: (J) => ({
    back: [...benchFlat(-1.35, -0.5, BENCH_Y, [-1.2, -0.65]), ...dumbbell(J.wristF, J.elbowF, 0.26, FAR_ALPHA)],
    front: dumbbell(J.wristN, J.elbowN, 0.26),
  }),
};
