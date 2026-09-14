/** Forward lunge, side view: near leg forward, far leg trailing, no equipment. */
'use strict';

module.exports = {
  id: 'lunge',
  view: 'side',
  keys: [
    { at: 0, hip: [-0.2, 1.06], lean: 2, ankleN: [0.35, 0], ankleF: [-0.85, 0.1], toeF: [-0.7, 0], arm: [-10, -8] },
    { at: 1, hip: [-0.25, 0.63], lean: 5, ankleN: [0.35, 0], ankleF: [-0.78, 0.2], toeF: [-0.7, 0], arm: [-10, -8] },
  ],
  equipment: () => ({}),
};
