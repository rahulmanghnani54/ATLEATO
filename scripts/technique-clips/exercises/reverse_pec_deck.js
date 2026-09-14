/** Reverse pec deck, front view: seated behind a chest pad, two overhead levers swept from in front to in line with the shoulders. */
'use strict';
const { CABLE_PX, ACCENT, disc } = require('../lib/raster');
const { bar, seat } = require('../lib/equipment');

const PIVOT_Y = 3.0; // lever pivots on a crossbar above the head
const PIVOT_X = 0.35;
// Seated: knees a little apart, shins down to the floor.
const SEATED = { hip: [0, 1.15], hipHalf: 0.12, legR: [18, -4], legL: [18, -4] };

/** Lever from an overhead pivot down to the hand, with a short vertical grip. */
function lever(pivot, wrist) {
  return [
    bar(pivot, wrist, CABLE_PX),
    disc(pivot, 0.075, ACCENT),
    bar([wrist[0], wrist[1] - 0.13], [wrist[0], wrist[1] + 0.13]),
  ];
}

module.exports = {
  id: 'reverse_pec_deck',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // Handles in front of the chest (foreshortened: hands close to the midline, elbows out and down).
    { at: 0, ...SEATED, wristR: [0.3, 1.7], wristL: [-0.3, 1.7], elbowDir: { R: 1, L: -1 } },
    // Arms swept back until they are in line with the shoulders.
    { at: 1, ...SEATED, wristR: [1.5, 2.1], wristL: [-1.5, 2.1], elbowDir: { R: 1, L: -1 } },
  ],
  equipment: (J) => ({
    back: [
      ...seat({ x: 0, y: 1.03, len: 0.6 }),
      bar([-PIVOT_X, PIVOT_Y], [PIVOT_X, PIVOT_Y]), // crossbar carrying the two pivots
      ...lever([PIVOT_X, PIVOT_Y], J.wristR),
      ...lever([-PIVOT_X, PIVOT_Y], J.wristL),
    ],
    // Chest pad between the lifter and the camera.
    front: [bar([0, 1.6], [0, 1.98], 36)],
  }),
};
