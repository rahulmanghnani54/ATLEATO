/** Forearm plank, side view: static hold on forearms and toes, straight line from head to heels; the loop is a slow breathing rise and fall. */
'use strict';

// Body line at ~9° (shoulders over the elbows, upper arm 0.55 tall), toes tucked under, forearms flat on
// the floor. Far-side ankle/wrist targets are pre-shifted by FAR_DX so both limbs stay straight after the camera's nudge.
const HOLD = {
  lean: 80.7,
  headTilt: 0,
  ankleN: [-1.171, 0.204], ankleF: [-1.216, 0.204],
  toeN: [-1.27, 0], toeF: [-1.27, 0], // (toe targets are already nudged by the camera)
  wristN: [1.5, 0], wristF: [1.455, 0],
  elbowDir: -1,
  kneeDir: 1,
};

module.exports = {
  id: 'plank',
  view: 'side',
  footSide: -1,
  timing: { down: 0.48, hold1: 0.02, up: 0.48 },
  keys: [
    { at: 0, hip: [0.013, 0.398], ...HOLD },
    { at: 1, hip: [0.016, 0.424], ...HOLD }, // breath in: ribcage and hips lift a touch
  ],
};
