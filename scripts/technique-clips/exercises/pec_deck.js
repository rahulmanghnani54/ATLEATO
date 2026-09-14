/** Pec deck, front view: seated, forearms vertical on the pads; the lever arms swing from wide to together in front of the chest. */
'use strict';
const { add, sub, norm, lerp } = require('../lib/figure');
const { ACCENT, CABLE_PX, disc } = require('../lib/raster');
const { bar, post } = require('../lib/equipment');

const SEAT_Y = 0.73;
const TOP_Y = 2.62; // frame top: the lever pivots hang from here, behind the shoulders
const BASE = { hip: [0, 0.85], hipHalf: 0.1, ankleR: [0.32, 0], ankleL: [-0.32, 0], kneeDir: { R: 1, L: -1 } };

/** One lever: pivot at the frame top, thin arm down to the pad, thick pad along the forearm (outside of it). */
function lever(elbow, wrist, sgn) {
  const out = [sgn * 0.09, 0];
  const p0 = add(elbow, out);
  const p1 = add(wrist, out);
  const pivot = [sgn * 0.14, TOP_Y];
  const top = lerp(p0, p1, 0.8);
  return [bar(pivot, top, CABLE_PX), disc(pivot, 0.075, ACCENT), bar(add(p0, norm(sub(p0, p1)), 0.04), add(p1, norm(sub(p1, p0)), 0.04))];
}

module.exports = {
  id: 'pec_deck',
  view: 'front',
  timing: { down: 0.42, hold1: 0.1, up: 0.42 },
  keys: [
    // Stretch: upper arms out at shoulder height, forearms straight up on the pads.
    { at: 0, ...BASE, arm: [90, 180] },
    // Squeeze: pads brought together in front; the elbows arc down and in (a front view cannot foreshorten them).
    { at: 1, ...BASE, arm: [-10, 180] },
  ],
  equipment: (J) => ({
    back: [
      bar([-0.36, SEAT_Y], [0.36, SEAT_Y]),
      post(0, SEAT_Y),
      post(0, TOP_Y, SEAT_Y),
      bar([-0.14, TOP_Y], [0.14, TOP_Y]),
    ],
    front: [...lever(J.elbowR, J.wristR, 1), ...lever(J.elbowL, J.wristL, -1)],
  }),
};
