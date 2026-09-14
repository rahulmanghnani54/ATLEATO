/** Decline sit-up, side view: lying back on a decline bench with the feet hooked under the roller, arms reaching along the body; torso curls up until the hands pass the knees. */
'use strict';
const { declineBench } = require('../lib/equipment');

const HEAD_END = [-1.6, 0.26];
const FOOT_END = [0.6, 0.95];
// Hip sits a body-thickness above the pad near the high end; feet hooked under the roller at the foot end.
const BASE = { hip: [-0.075, 1.0], ankleN: [0.62, 1.02], ankleF: [0.62, 1.02], kneeDir: 1, elbowDir: -1 };

module.exports = {
  id: 'decline_sit_up',
  view: 'side',
  fit: 0.66,
  keys: [
    // Lying back along the pad (head lower than the hips), straight arms reaching toward the thighs.
    { at: 0, ...BASE, lean: -107, headTilt: 0, wristRel: [0.92, 0.5] },
    // Curled up: torso ~30° from vertical, chin tucked, hands reaching past the knees.
    { at: 1, ...BASE, lean: 30, headTilt: 22, wristRel: [0.75, -0.72] },
  ],
  equipment: () => ({ back: declineBench({ head: HEAD_END, foot: FOOT_END }) }),
};
