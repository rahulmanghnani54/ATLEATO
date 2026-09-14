/** Parallel-bar dip, side view: hands on the rail, torso tipped slightly forward, knees bent; lowered until the upper arms are level. */
'use strict';
const { benchFlat } = require('../lib/equipment');

const RAIL_Y = 1.55;
const HAND = [0.05, RAIL_Y + 0.02];
const LEGS = { legN: [-15, -100], legF: [-15, -100], wristN: HAND, wristF: HAND, elbowDir: -1 };

module.exports = {
  id: 'tricep_dip',
  view: 'side',
  keys: [
    { at: 0, hip: [0.05, 1.62], lean: 10, headTilt: -6, ...LEGS }, // lockout, arms straight
    { at: 1, hip: [0.18, 1.16], lean: 25, headTilt: -8, ...LEGS }, // bottom: upper arms parallel to the floor
  ],
  // the near rail of the dip station: a bar at hand height on two posts
  equipment: () => ({ back: benchFlat(-0.6, 0.65, RAIL_Y, [-0.45, 0.5]) }),
};
