/** Overhead dumbbell tricep extension, side view: both hands cup one vertical dumbbell overhead; only the forearms hinge behind the head. */
'use strict';
const { STAND, add } = require('../lib/figure');
const { ACCENT, disc } = require('../lib/raster');
const { bar } = require('../lib/equipment');

/** Vertical dumbbell hanging from the cupped hands: top plate at the palms, handle and bottom plate below. */
function verticalDumbbell(hands) {
  const top = add(hands, [0, 0.06]);
  const bottom = add(hands, [0, -0.34]);
  return [bar(top, bottom), disc(top, 0.1, ACCENT), disc(bottom, 0.1, ACCENT)];
}

module.exports = {
  id: 'overhead_tricep_extension',
  view: 'side',
  fit: 0.8, // a standing figure with the arms overhead is tall — let it use more of the frame
  timing: { down: 0.42, hold1: 0.08, up: 0.42 },
  keys: [
    { at: 0, ...STAND, lean: -3, headTilt: 20, arm: [150, 165] }, // lockout: chin tucked, upper arms up and a little forward of the head
    { at: 1, ...STAND, lean: -3, headTilt: 20, arm: [150, 280] }, // forearms folded, hands behind the head
  ],
  equipment: (J) => ({ front: verticalDumbbell(J.wristN) }),
};
