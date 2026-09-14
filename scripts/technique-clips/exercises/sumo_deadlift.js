/** Sumo deadlift, front view (catalog front_45): wide stance, knees out, hands inside the knees; bar from the floor to lockout. */
'use strict';
const { ACCENT, STROKE_PX, CABLE_PX, ring, disc } = require('../lib/raster');
const { bar } = require('../lib/equipment');

const STANCE = { hipHalf: 0.2, ankleR: [0.55, 0], ankleL: [-0.55, 0], kneeDir: { R: 1, L: -1 }, armsHang: true, shoulderHalf: 0.4 };
const HALF = 0.95;
const PLATE_X = 0.8;
const PLATE_R = 0.2;

/** Barbell seen from the front: thin bar with a plate ring near each end (rings match the side-view plate language). */
function barbellFrontRings(y) {
  return [
    bar([-HALF, y], [HALF, y], CABLE_PX),
    ring([-PLATE_X, y], PLATE_R, STROKE_PX, ACCENT),
    ring([PLATE_X, y], PLATE_R, STROKE_PX, ACCENT),
    disc([-HALF, y], 0.045, ACCENT),
    disc([HALF, y], 0.045, ACCENT),
  ];
}

module.exports = {
  id: 'sumo_deadlift',
  view: 'front',
  keys: [
    // Floor start: hips low, torso foreshortened by the forward lean, plates on the floor.
    { at: 0, ...STANCE, hip: [0, 0.72], torso: 0.62 },
    { at: 1, ...STANCE, hip: [0, 1.14], torso: 1 },
  ],
  equipment: (J) => ({ front: barbellFrontRings(J.wristR[1]) }),
};
