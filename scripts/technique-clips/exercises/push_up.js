/** Push-up, side view: plank on hands and toes, body straight, chest lowered toward the floor and pressed back up. */
'use strict';

// The body stays a straight line from the ankles (fixed, heels up on the toes) to the shoulders; the hands stay planted.
const ANKLE = [-1.46, 0.2];
const TOE = [-1.52, 0];
const HAND = [0.45, 0.01]; // planted a little below the shoulder line, as at chest level

/** Straight-body pose with the shoulder `h` above the floor. */
function plank(h) {
  const total = 2.2; // torso + thigh + shin along one line
  const s = Math.asin((h - ANKLE[1]) / total);
  const dir = [Math.cos(s), Math.sin(s)]; // ankle → shoulder
  const shoulder = [ANKLE[0] + dir[0] * total, h];
  const hip = [shoulder[0] - dir[0], shoulder[1] - dir[1]];
  const leanDeg = 90 - (s * 180) / Math.PI;
  return {
    hip,
    lean: leanDeg,
    headTilt: -8,
    leg: [-leanDeg, -leanDeg],
    toeN: TOE,
    toeF: TOE,
    wristN: HAND,
    wristF: HAND,
    elbowDir: -1,
  };
}

module.exports = {
  id: 'push_up',
  view: 'side',
  fit: 0.58,
  maxS: 270, // a long, low scene: let it fill the width
  keys: [
    { at: 0, ...plank(1.02) }, // arms straight
    { at: 1, ...plank(0.42) }, // chest just off the floor
  ],
};
