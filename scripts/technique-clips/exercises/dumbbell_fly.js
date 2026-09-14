/** Flat dumbbell fly, front view from the foot of the bench (camera slightly raised): the whole body lies along the receding pad, no floor; arms arc from together above the chest to a wide stretch. */
'use strict';
const { bar, post, dumbbell } = require('../lib/equipment');

const BASE = {
  hip: [0, 1.05],
  torso: 0.62, // lying body seen from the feet: the torso is foreshortened
  hipHalf: 0.1,
  ankleR: [0.12, -0.145],
  ankleL: [-0.12, -0.145],
  kneeDir: { R: 1, L: -1 },
  elbowDir: { R: -1, L: 1 },
};

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
    { at: 0, ...BASE, wristR: [0.13, 2.55], wristL: [-0.13, 2.55] }, // dumbbells together over the chest
    { at: 0.5, ...BASE, wristR: [1.08, 2.3], wristL: [-1.08, 2.3] }, // on the arc, not the chord
    { at: 1, ...BASE, wristR: [1.36, 1.62], wristL: [-1.36, 1.62] }, // stretch, soft elbows
  ],
  equipment: (J) => ({
    back: benchFootEnd(),
    front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)],
  }),
};
