/** T-bar row, side view: hinged over a bar pivoting on the floor behind, plate end pulled to the lower chest. */
'use strict';
const { sub, norm, add } = require('../lib/figure');
const { ACCENT, STROKE_PX, CABLE_PX, disc, ring } = require('../lib/raster');
const { bar, vHandle, PLATE_R_SMALL } = require('../lib/equipment');

const PIVOT = [-1.55, 0.02]; // landmine sleeve on the floor behind the feet

module.exports = {
  id: 't_bar_row',
  view: 'side',
  keys: [
    { at: 0, hip: [-0.3, 1.05], lean: 48, headTilt: -10, ankleN: [0.05, 0], ankleF: [-0.08, 0], wristRel: [0.1, -1.04], elbowDir: -1 },
    { at: 1, hip: [-0.3, 1.05], lean: 48, headTilt: -10, ankleN: [0.05, 0], ankleF: [-0.08, 0], wristRel: [-0.06, -0.44], elbowDir: -1 },
  ],
  equipment: (J) => {
    const dir = norm(sub(J.wristN, PIVOT));
    const plateC = add(J.wristN, dir, 0.24); // plates sit just past the hands on the bar's end
    return {
      back: [
        bar(PIVOT, plateC, CABLE_PX), // the bar runs between the legs to the plates
        disc(PIVOT, 0.08, ACCENT),
      ],
      front: [
        ...vHandle(add(J.wristN, dir, -0.1), dir, 0.16, 35),
        ring(plateC, PLATE_R_SMALL, STROKE_PX, ACCENT),
        disc(plateC, 0.055, ACCENT),
      ],
    };
  },
};
