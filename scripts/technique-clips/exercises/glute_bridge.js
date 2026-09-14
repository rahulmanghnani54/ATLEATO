/** Glute bridge, side view: lying on the back, knees bent, feet flat; hips driven up to a straight line from shoulders to knees. */
'use strict';

// Floor contact works like plank.js: everything that touches the floor sits at y = 0 (feet, hands,
// shoulders) at the default 200 px/unit — the floor line is drawn just under y = 0. The shoulder stays
// pinned at [-1, 0.03]; only the hip rises. lean + headTilt is kept at -50 so the head rests on the
// floor behind the shoulders throughout (ring bottom at y ≈ -0.02).
const SHOULDER_Y = 0.03;
const base = (hip, lean) => ({
  hip,
  lean,
  headTilt: -50 - lean,
  ankleN: [0.5, 0],
  ankleF: [0.5, 0],
  toeN: [0.74, 0],
  toeF: [0.74, 0],
  wristN: [0.05, 0.02], // arms flat along the floor by the sides
  wristF: [0.05, 0.02],
  elbowDir: 1,
  kneeDir: 1,
});

module.exports = {
  id: 'glute_bridge',
  view: 'side',
  keys: [
    // Bottom: torso resting just above the floor, shoulders and head down, knees up.
    { at: 0, ...base([0, SHOULDER_Y], -90) },
    // Peak: lean -111 keeps the shoulder at [-1, 0.03] and puts shoulder, hip and knee (≈[0.5, 0.6]) on one line.
    { at: 1, ...base([-0.066, 0.388], -111) },
  ],
  equipment: () => ({}),
};
