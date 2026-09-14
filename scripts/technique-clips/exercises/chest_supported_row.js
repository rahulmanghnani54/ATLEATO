/** Chest-supported dumbbell row, side view: chest on a 45° incline pad, feet on the floor behind, dumbbells rowed to the ribs. */
'use strict';
const { add, fromUp } = require('../lib/figure');
const { bar, post, dumbbell } = require('../lib/equipment');

const LEAN = -45; // torso lies along the pad, head toward -x and up

module.exports = {
  id: 'chest_supported_row',
  view: 'side',
  fit: 0.66,
  keys: [
    // dead hang: arms straight down past the pad
    { at: 0, hip: [0.3, 0.9], lean: LEAN, headTilt: 12, ankleN: [0.8, 0], ankleF: [0.68, 0], wristRel: [0.04, -1.04], elbowDir: 1 },
    // top: elbows past the torso, dumbbells at the lower ribs
    { at: 1, hip: [0.3, 0.9], lean: LEAN, headTilt: 12, ankleN: [0.8, 0], ankleF: [0.68, 0], wristRel: [0.48, -0.42], elbowDir: 1 },
  ],
  equipment: (J) => {
    // Pad parallel to the torso, one body-thickness below/behind it (the chest rests on it).
    const axis = fromUp(LEAN);
    const back = [-0.707, -0.707]; // perpendicular, away from the chest
    const p0 = add(add([0.3, 0.9], back, 0.24), axis, -0.35); // low end, below the hips
    const p1 = add(p0, axis, 1.55); // top end, under the head
    return {
      back: [bar(p0, p1), post(p1[0] + 0.1, p1[1] - 0.1), post(p0[0] + 0.15, p0[1] + 0.02)],
      front: dumbbell(J.wristN, J.elbowN, 0.3),
    };
  },
};
