/** Flat dumbbell fly, front view from the foot of the bench (camera raised): the body lies along the receding pad, no floor; the dumbbells meet over the sternum and open in an arc to a wide stretch at shoulder height. */
'use strict';
const { bar, post, dumbbell } = require('../lib/equipment');

const BASE = {
  hip: [0, 1.05],
  torso: 0.62, // lying body seen from the feet: the torso is foreshortened
  hipHalf: 0.1,
  shoulderHalf: 0.5, // broad lying shoulders; also keeps the flared forearms clear of the head at the top
  ankleR: [0.12, -0.145],
  ankleL: [-0.12, -0.145],
  kneeDir: { R: 1, L: -1 },
  elbowDir: { R: -1, L: 1 }, // elbows bow outward (flared beside the head at the top, dropped toward the floor at the stretch)
};

// Shoulder line is at y ≈ 1.62 and the chin at ≈ 1.77: the dumbbells meet on the sternum between them.
const TOP_Y = 1.74;

/** Bench pad in perspective from the foot end: a trapezoid narrowing away from the viewer, on two near legs. */
function benchFootEnd() {
  const nearY = -0.3;
  const farY = 2.4;
  const a = [-0.42, nearY];
  const b = [0.42, nearY];
  const c = [0.22, farY];
  const d = [-0.22, farY];
  return [bar(a, b), bar(b, c), bar(c, d), bar(d, a), post(-0.3, nearY, nearY - 0.45), post(0.3, nearY, nearY - 0.45)];
}

module.exports = {
  id: 'dumbbell_fly',
  view: 'front',
  floor: false,
  keys: [
    { at: 0, ...BASE, wristR: [0.13, TOP_Y], wristL: [-0.13, TOP_Y] }, // contraction: dumbbells touch over the sternum, upper arms toward the camera read as elbows flared either side of the head
    { at: 0.5, ...BASE, wristR: [1.0, 2.05], wristL: [-1.0, 2.05] }, // on the arc: hands out and high, elbows rolled out to the sides
    { at: 1, ...BASE, wristR: [1.45, 1.48], wristL: [-1.45, 1.48] }, // stretch: hands wide just below the shoulder line, soft elbows toward the floor
  ],
  equipment: (J) => ({
    back: benchFootEnd(),
    // Neutral grip: the dumbbells run along the body axis all the way round, so they stand vertical and touch side by side at the top.
    front: [...dumbbell(J.wristR, J.elbowR, 0.28, 1, true), ...dumbbell(J.wristL, J.elbowL, 0.28, 1, true)],
  }),
};
