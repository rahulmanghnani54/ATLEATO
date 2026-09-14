/** Diamond push-up, side view: as the push-up, but the hands are together under the chest and the elbows track back along the ribs. */
'use strict';

const ANKLE = [-1.46, 0.2];
const TOE = [-1.52, 0];
const HAND = [0.22, 0.01]; // under the chest, well behind the shoulder line

function plank(h) {
  const total = 2.2;
  const s = Math.asin((h - ANKLE[1]) / total);
  const dir = [Math.cos(s), Math.sin(s)];
  const shoulder = [ANKLE[0] + dir[0] * total, h];
  const hip = [shoulder[0] - dir[0], shoulder[1] - dir[1]];
  const leanDeg = 90 - (s * 180) / Math.PI;
  return { hip, lean: leanDeg, headTilt: -8, leg: [-leanDeg, -leanDeg], toeN: TOE, toeF: TOE, wristN: HAND, wristF: HAND, elbowDir: -1 };
}

module.exports = {
  id: 'diamond_push_up',
  view: 'side',
  fit: 0.58,
  maxS: 270, // a long, low scene: let it fill the width
  keys: [
    { at: 0, ...plank(1.0) },
    { at: 1, ...plank(0.4) },
  ],
};
