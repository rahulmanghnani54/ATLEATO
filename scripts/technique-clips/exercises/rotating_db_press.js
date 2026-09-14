/** Arnold (rotating) dumbbell press, front view: seated, dumbbells from in front of the shoulders (palms in) to lockout (palms forward). */
'use strict';
const { sub, norm, ccw, lerp } = require('../lib/figure');
const { bar, post, dumbbellAt } = require('../lib/equipment');

// `rot` 0..1 = how far the palms have turned out: the dumbbell is seen end-on (a disc) at 0 and side-on at 1.
const BASE = { hip: [0, 0.84], hipHalf: 0.14, ankleR: [0.45, 0], ankleL: [-0.45, 0], kneeDir: { R: 1, L: -1 } };

module.exports = {
  id: 'rotating_db_press',
  view: 'front',
  keys: [
    { at: 0, ...BASE, arm: [-12, 196], rot: 0 }, // dumbbells in front of the shoulders at chin height, elbows in front of the body
    { at: 0.5, ...BASE, arm: [88, 180], rot: 0.55 }, // elbows out, forearms vertical
    { at: 1, ...BASE, arm: [160, 176], rot: 1 }, // lockout
  ],
  equipment: (J, pose) => {
    const len = lerp(0.03, 0.3, pose.rot);
    const db = (w, e) => dumbbellAt(w, ccw(norm(sub(w, e))), len);
    return {
      back: [
        // upright bench from the front: seat pad, centre post and a back pad just wider than the torso behind it
        bar([-0.36, 0.76], [0.36, 0.76]),
        post(0, 0.76),
        bar([-0.08, 0.76], [-0.08, 1.66]),
        bar([0, 0.76], [0, 1.66]),
        bar([0.08, 0.76], [0.08, 1.66]),
      ],
      front: [...db(J.wristR, J.elbowR), ...db(J.wristL, J.elbowL)],
    };
  },
};
