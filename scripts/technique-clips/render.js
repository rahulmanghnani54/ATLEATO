#!/usr/bin/env node
/**
 * render.js — technique clips as looping stick-figure pictograms.
 *
 * Zero dependencies: a small signed-distance rasteriser fills an RGB buffer
 * per frame and streams the raw frames into ffmpeg's stdin, which encodes
 * out/<id>_v1.mp4 (1280×720, 30 fps, 10.000 s, H.264 Main, yuv420p).
 *
 * Visual language = components/formcoach/CameraSetupFigure.tsx: flat vector,
 * round-cap strokes, ink figure (#0B1410) on surfaceAlt (#F2F5F3), brand
 * accent (#12B981) spent on equipment only, floor in ink at 28 %. No text,
 * gradients, shadows or glow.
 *
 * Motion: 3 reps in 10 s (100 frames per rep). Every animated quantity is a
 * pure function of the rep phase, so frame 300 == frame 0 and the clip loops
 * without a seam.
 *
 *   node scripts/technique-clips/render.js                 # all 14
 *   node scripts/technique-clips/render.js deadlift pullup # some
 *   node scripts/technique-clips/render.js --sheet         # + contact sheets
 *   node scripts/technique-clips/render.js --verify        # probe + loop check
 *   node scripts/technique-clips/render.js --stills        # frame 0 + 50 PNGs
 *   node scripts/technique-clips/render.js --list          # ids only
 *   (--sheet-only / --verify-only / --stills-only skip the encode)
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Output format
// ─────────────────────────────────────────────────────────────────────────────

const W = 1280;
const H = 720;
const FPS = 30;
const DURATION_S = 10;
const FRAMES = FPS * DURATION_S; // 300
const REPS = 3;
const FRAMES_PER_REP = FRAMES / REPS; // 100 — integer, so the loop is exact

const OUT_DIR = path.join(__dirname, 'out');
const SHEET_DIR = path.join(OUT_DIR, 'sheets');

const WINGET_FF =
  'C:/Users/hp/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin';
function findTool(name) {
  if (process.env[name.toUpperCase()]) return process.env[name.toUpperCase()];
  const winget = path.join(WINGET_FF, `${name}.exe`);
  if (fs.existsSync(winget)) return winget;
  return name; // hope it is on PATH
}
const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');

// ─────────────────────────────────────────────────────────────────────────────
// Palette (constants/tokens.ts, light theme)
// ─────────────────────────────────────────────────────────────────────────────

const BG = [0xf2, 0xf5, 0xf3]; // surfaceAlt
const INK = [0x0b, 0x14, 0x10]; // text / figure
const ACCENT = [0x12, 0xb9, 0x81]; // brand emerald — equipment only

const STROKE_PX = 15; // ≈ 3 units of the 240-wide figure viewBox at 1280 px
const CABLE_PX = 9;
const DUMBBELL_KNOB = 0.075; // end-plate radius (units)
const FLOOR_ALPHA = 0.28;
const FAR_ALPHA = 0.42; // far-side limbs in side view
const FAR_DX = -0.045; // and nudged back a touch so depth reads

// ─────────────────────────────────────────────────────────────────────────────
// Rasteriser — signed-distance coverage, bounding-box iteration, alpha blend
// ─────────────────────────────────────────────────────────────────────────────

class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.blank = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.blank[i * 3] = bg[0];
      this.blank[i * 3 + 1] = bg[1];
      this.blank[i * 3 + 2] = bg[2];
    }
    // Two frame buffers so one can sit in ffmpeg's pipe while the next renders.
    this.bufs = [Buffer.alloc(w * h * 3), Buffer.alloc(w * h * 3)];
    this.buf = this.bufs[0];
  }

  begin(frameIndex) {
    this.buf = this.bufs[frameIndex & 1];
    this.blank.copy(this.buf);
    return this.buf;
  }

  blend(i, col, a) {
    const b = this.buf;
    b[i] += (col[0] - b[i]) * a;
    b[i + 1] += (col[1] - b[i + 1]) * a;
    b[i + 2] += (col[2] - b[i + 2]) * a;
  }

  /** Thick line with round caps: every point within `r` px of the segment. */
  capsule(x1, y1, x2, y2, r, col, alpha = 1) {
    const w = this.w;
    const x0 = Math.max(0, Math.floor(Math.min(x1, x2) - r - 1));
    const x9 = Math.min(w - 1, Math.ceil(Math.max(x1, x2) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(y1, y2) - r - 1));
    const y9 = Math.min(this.h - 1, Math.ceil(Math.max(y1, y2) + r + 1));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y9; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x9; x++) {
        const px = x + 0.5;
        let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const qx = x1 + t * dx - px;
        const qy = y1 + t * dy - py;
        let cov = r + 0.5 - Math.sqrt(qx * qx + qy * qy);
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        this.blend((y * w + x) * 3, col, cov * alpha);
      }
    }
  }

  /** Circle outline of radius `R` with stroke half-width `hw`. */
  ring(cx, cy, R, hw, col, alpha = 1) {
    const w = this.w;
    const o = R + hw + 1;
    const x0 = Math.max(0, Math.floor(cx - o));
    const x9 = Math.min(w - 1, Math.ceil(cx + o));
    const y0 = Math.max(0, Math.floor(cy - o));
    const y9 = Math.min(this.h - 1, Math.ceil(cy + o));
    for (let y = y0; y <= y9; y++) {
      const py = y + 0.5 - cy;
      for (let x = x0; x <= x9; x++) {
        const px = x + 0.5 - cx;
        let cov = hw + 0.5 - Math.abs(Math.sqrt(px * px + py * py) - R);
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        this.blend((y * w + x) * 3, col, cov * alpha);
      }
    }
  }

  /** Filled circle. */
  disc(cx, cy, R, col, alpha = 1) {
    const w = this.w;
    const o = R + 1;
    const x0 = Math.max(0, Math.floor(cx - o));
    const x9 = Math.min(w - 1, Math.ceil(cx + o));
    const y0 = Math.max(0, Math.floor(cy - o));
    const y9 = Math.min(this.h - 1, Math.ceil(cy + o));
    for (let y = y0; y <= y9; y++) {
      const py = y + 0.5 - cy;
      for (let x = x0; x <= x9; x++) {
        const px = x + 0.5 - cx;
        let cov = R + 0.5 - Math.sqrt(px * px + py * py);
        if (cov <= 0) continue;
        if (cov > 1) cov = 1;
        this.blend((y * w + x) * 3, col, cov * alpha);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Figure model — units: torso = 1. World y is UP, x is the direction the
// side-view figure faces. Floor is y = 0.
// ─────────────────────────────────────────────────────────────────────────────

const L = { torso: 1.0, neck: 0.1, head: 0.22, ua: 0.55, fa: 0.5, th: 0.6, sh: 0.6, foot: 0.24 };
const SHOULDER_HALF = 0.4; // front view
const PLATE_R = 0.26;

const rad = (d) => (d * Math.PI) / 180;
/** Unit vector at `deg` from straight DOWN, positive toward +x. */
const fromDown = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))];
/** Unit vector at `deg` from straight UP, positive toward +x. */
const fromUp = (deg) => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => {
  const d = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / d, v[1] / d];
};
/** Rotate 90° counter-clockwise (y up). */
const ccw = (v) => [-v[1], v[0]];
const cw = (v) => [v[1], -v[0]];

/**
 * Two-bone IK. Returns the middle joint and the actual end point (the end is
 * clamped to the limb's reach, so a target just out of reach gives a straight
 * limb pointing at it). `s` picks which side of the root→target line the
 * middle joint bends to.
 */
function ik(root, target, l1, l2, s) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-9 ? dx / d : 0;
  const uy = d > 1e-9 ? dy / d : -1;
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return {
    mid: [root[0] + ux * a - uy * h * s, root[1] + uy * a + ux * h * s],
    end: [root[0] + ux * dc, root[1] + uy * dc],
  };
}

/** Deep numeric lerp over the pose objects (strings/booleans come from `a`). */
function lerpDeep(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => lerpDeep(v, b[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(a)) o[k] = k in b ? lerpDeep(a[k], b[k], t) : a[k];
    return o;
  }
  return a;
}

/** Pose at eased range value `c` ∈ [0,1] from keyframes [{at, ...pose}]. */
function poseAt(keys, c) {
  if (c <= keys[0].at) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (c <= k1.at) return lerpDeep(k0, k1, (c - k0.at) / (k1.at - k0.at));
  }
  return keys[keys.length - 1];
}

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * One rep as a 0→1→0 range value with ease-in-out on each travel and a short
 * hold at both ends of range: c(0) = c(1) = 0, so reps chain seamlessly.
 */
function cycle(p, t) {
  const { down, hold1, up } = t;
  if (p < down) return smooth(p / down);
  if (p < down + hold1) return 1;
  if (p < down + hold1 + up) return 1 - smooth((p - down - hold1) / up);
  return 0;
}
const TIMING = { down: 0.44, hold1: 0.06, up: 0.44 };

// Primitive factories (world units; strokes in px).
const cap = (a, b, px, col, al = 1) => ({ k: 'cap', a, b, px, col, al });
const ring = (c, r, px, col, al = 1) => ({ k: 'ring', c, r, px, col, al });
const disc = (c, r, col, al = 1) => ({ k: 'disc', c, r, col, al });

/**
 * Limb resolution shared by both views.
 *  - `wrist*` / `ankle*`: absolute IK target
 *  - `wristRel`: IK target relative to the shoulder (both arms)
 *  - `arm*` / `leg*`: [proximal, distal] absolute angles
 *  - `armsHang`: arms straight down from the shoulder
 * `sgn` mirrors the angle convention for the left side in front view.
 */
function resolveArm(pose, side, shoulder, sgn) {
  const bend = (pose.elbowDir && pose.elbowDir[side]) || pose.elbowDir || 1;
  if (pose.armsHang) {
    const elbow = add(shoulder, [0, -L.ua]);
    return { elbow, wrist: add(shoulder, [0, -(L.ua + L.fa)]) };
  }
  const target = pose['wrist' + side] || (pose.wristRel && add(shoulder, pose.wristRel));
  if (target) {
    const r = ik(shoulder, target, L.ua, L.fa, typeof bend === 'number' ? bend : 1);
    return { elbow: r.mid, wrist: r.end };
  }
  const ang = pose['arm' + side] || pose.arm;
  const e = fromDown(ang[0]);
  const f = fromDown(ang[1]);
  const elbow = add(shoulder, [sgn * e[0], e[1]], L.ua);
  return { elbow, wrist: add(elbow, [sgn * f[0], f[1]], L.fa) };
}

function resolveLeg(pose, side, hip, sgn) {
  const bend = (pose.kneeDir && pose.kneeDir[side]) || pose.kneeDir || 1;
  const target = pose['ankle' + side];
  if (target) {
    const r = ik(hip, target, L.th, L.sh, typeof bend === 'number' ? bend : 1);
    return { knee: r.mid, ankle: r.end };
  }
  const ang = pose['leg' + side] || pose.leg;
  const t = fromDown(ang[0]);
  const s = fromDown(ang[1]);
  const knee = add(hip, [sgn * t[0], t[1]], L.th);
  return { knee, ankle: add(knee, [sgn * s[0], s[1]], L.sh) };
}

/** Side view: facing +x. Near side (N) drawn on top, far side (F) lighter. */
function buildSide(pose, spec) {
  const hip = pose.hip;
  const lean = pose.lean || 0;
  const td = fromUp(lean);
  const shoulder = add(hip, td, L.torso);
  const hd = fromUp(lean + (pose.headTilt || 0));
  const head = add(shoulder, hd, L.neck + L.head);
  const neckEnd = add(shoulder, hd, L.neck + 0.02);
  const footSide = spec.footSide || 1;

  const J = { hip, shoulder, head, neckEnd };
  for (const side of ['N', 'F']) {
    const off = side === 'F' ? [FAR_DX, 0] : [0, 0];
    const h = add(hip, off);
    const s = add(shoulder, off);
    const leg = resolveLeg(pose, side, h, 1);
    const shinDir = norm(sub(leg.ankle, leg.knee));
    const toe =
      pose['toe' + side] ? add(pose['toe' + side], off) : add(leg.ankle, footSide > 0 ? ccw(shinDir) : cw(shinDir), L.foot);
    const arm = resolveArm(pose, side, s, 1);
    J['hip' + side] = h;
    J['shoulder' + side] = s;
    J['knee' + side] = leg.knee;
    J['ankle' + side] = leg.ankle;
    J['toe' + side] = toe;
    J['elbow' + side] = arm.elbow;
    J['wrist' + side] = arm.wrist;
  }

  const px = STROKE_PX;
  const body = { back: [], mid: [], front: [] };
  const limbs = (side, al, list) => {
    if (!spec.noLegs) {
      list.push(cap(J['hip' + side], J['knee' + side], px, INK, al));
      list.push(cap(J['knee' + side], J['ankle' + side], px, INK, al));
      if (!spec.noFeet) list.push(cap(J['ankle' + side], J['toe' + side], px, INK, al));
    }
    list.push(cap(J['shoulder' + side], J['elbow' + side], px, INK, al));
    list.push(cap(J['elbow' + side], J['wrist' + side], px, INK, al));
  };
  limbs('F', FAR_ALPHA, body.back);
  body.mid.push(cap(hip, shoulder, px, INK));
  body.mid.push(cap(shoulder, neckEnd, px, INK));
  body.mid.push(ring(head, L.head, px, INK));
  limbs('N', 1, body.front);
  return { J, body };
}

/** Front view: facing the viewer. R is drawn at +x. */
function buildFront(pose) {
  const hip = pose.hip;
  const neckBase = add(hip, [0, L.torso]);
  const shY = neckBase[1] - 0.05;
  const head = add(neckBase, [0, L.neck + L.head]);
  const neckEnd = add(neckBase, [0, L.neck + 0.02]);
  const J = { hip, head, neckEnd, neckBase, shoulderR: [SHOULDER_HALF, shY], shoulderL: [-SHOULDER_HALF, shY] };
  for (const [side, sgn] of [['R', 1], ['L', -1]]) {
    const arm = resolveArm(pose, side, J['shoulder' + side], sgn);
    const leg = resolveLeg(pose, side, hip, sgn);
    J['elbow' + side] = arm.elbow;
    J['wrist' + side] = arm.wrist;
    J['knee' + side] = leg.knee;
    J['ankle' + side] = leg.ankle;
  }
  const px = STROKE_PX;
  const body = { back: [], mid: [], front: [] };
  body.mid.push(cap(hip, neckBase, px, INK));
  body.mid.push(cap(J.shoulderL, J.shoulderR, px, INK));
  body.mid.push(cap(neckBase, neckEnd, px, INK));
  body.mid.push(ring(head, L.head, px, INK));
  for (const side of ['L', 'R']) {
    body.front.push(cap(hip, J['knee' + side], px, INK));
    body.front.push(cap(J['knee' + side], J['ankle' + side], px, INK));
    body.front.push(cap(J['shoulder' + side], J['elbow' + side], px, INK));
    body.front.push(cap(J['elbow' + side], J['wrist' + side], px, INK));
  }
  return { J, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment
// ─────────────────────────────────────────────────────────────────────────────

/** Barbell seen end-on: the plate face as a ring, the bar end as a dot. */
function barbellSide(J, r = PLATE_R) {
  return [ring(J.wristN, r, STROKE_PX, ACCENT), disc(J.wristN, 0.055, ACCENT)];
}
/** Lighter lifts get smaller plates so the ring does not swallow the head. */
const PLATE_R_SMALL = 0.19;

/** Dumbbell as a short thick capsule across the wrist, perpendicular to the forearm. */
function dumbbell(wrist, elbow, len = 0.3, al = 1, vertical = false) {
  const d = vertical ? [0, 1] : ccw(norm(sub(wrist, elbow)));
  const a = add(wrist, d, -len / 2);
  const b = add(wrist, d, len / 2);
  return [cap(a, b, STROKE_PX, ACCENT, al), disc(a, DUMBBELL_KNOB, ACCENT, al), disc(b, DUMBBELL_KNOB, ACCENT, al)];
}

function benchFlat(x1, x2, y, legs) {
  const out = [cap([x1, y], [x2, y], STROKE_PX, ACCENT)];
  for (const lx of legs) out.push(cap([lx, y], [lx, 0], STROKE_PX, ACCENT));
  return out;
}

const FLOOR_Y = -0.09;

// ─────────────────────────────────────────────────────────────────────────────
// The 14 exercises
// ─────────────────────────────────────────────────────────────────────────────

const STAND = { hip: [0, 1.18], lean: 0, ankleN: [0, 0], ankleF: [0, 0] };

const EXERCISES = [
  {
    id: 'barbell_squat',
    view: 'side',
    keys: [
      { at: 0, ...STAND, lean: 4, wristRel: [-0.24, 0.08], elbowDir: 1 },
      { at: 1, hip: [-0.3, 0.5], lean: 32, ankleN: [0, 0], ankleF: [0, 0], wristRel: [-0.24, 0.08], elbowDir: 1 },
    ],
    // The plate sits behind the body here: the true side view puts it over the
    // neck, which buries the head — a pictogram keeps the silhouette.
    equipment: (J) => ({ back: barbellSide(J) }),
  },
  {
    id: 'goblet_squat',
    view: 'side',
    keys: [
      { at: 0, ...STAND, lean: 3, wristRel: [0.28, -0.2], elbowDir: -1 },
      { at: 1, hip: [-0.22, 0.45], lean: 16, ankleN: [0, 0], ankleF: [0, 0], wristRel: [0.28, -0.2], elbowDir: -1 },
    ],
    equipment: (J) => ({ front: dumbbell(J.wristN, J.elbowN, 0.3, 1, true) }),
  },
  {
    id: 'lunge',
    view: 'side',
    keys: [
      { at: 0, hip: [-0.2, 1.06], lean: 2, ankleN: [0.35, 0], ankleF: [-0.85, 0.1], toeF: [-0.7, 0], arm: [-10, -8] },
      { at: 1, hip: [-0.25, 0.63], lean: 5, ankleN: [0.35, 0], ankleF: [-0.78, 0.2], toeF: [-0.7, 0], arm: [-10, -8] },
    ],
    equipment: () => ({}),
  },
  {
    id: 'deadlift',
    view: 'side',
    keys: [
      { at: 0, hip: [-0.62, 0.64], lean: 48, headTilt: -14, ankleN: [0, 0], ankleF: [0, 0], armsHang: true },
      { at: 1, ...STAND, headTilt: 0, armsHang: true },
    ],
    equipment: (J) => ({ front: barbellSide(J) }),
  },
  {
    id: 'romanian_deadlift',
    view: 'side',
    keys: [
      { at: 0, ...STAND, headTilt: 0, armsHang: true },
      { at: 1, hip: [-0.55, 0.98], lean: 64, headTilt: -12, ankleN: [0, 0], ankleF: [0, 0], armsHang: true },
    ],
    equipment: (J) => ({ front: barbellSide(J) }),
  },
  {
    id: 'bench_press',
    view: 'side',
    fit: 0.64,
    maxS: 230,
    keys: [
      { at: 0, hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], wristN: [-0.8, 1.77], wristF: [-0.8, 1.77], elbowDir: -1 },
      { at: 1, hip: [0.1, 0.72], lean: -90, ankleN: [0.62, 0], ankleF: [0.62, 0], wristN: [-0.5, 0.87], wristF: [-0.5, 0.87], elbowDir: -1 },
    ],
    equipment: (J) => ({ back: benchFlat(-1.4, 0.55, 0.45, [-1.05, 0.3]), front: barbellSide(J) }),
  },
  {
    id: 'incline_db_press',
    view: 'side',
    fit: 0.68,
    keys: [
      { at: 0, hip: [0.1, 0.8], lean: -60, ankleN: [0.8, 0], ankleF: [0.8, 0], wristN: [-0.7, 2.34], wristF: [-0.7, 2.34], elbowDir: -1 },
      { at: 1, hip: [0.1, 0.8], lean: -60, ankleN: [0.8, 0], ankleF: [0.8, 0], wristN: [-0.47, 1.31], wristF: [-0.47, 1.31], elbowDir: -1 },
    ],
    equipment: (J) => {
      // Back rest parallel to the torso, a head-radius below it (the body has
      // thickness, the head rests on the pad); short seat; two posts.
      const axis = fromUp(-60);
      const down = [-0.5, -0.866];
      const p0 = add(add([0.05, 0.8], down, 0.28), axis, -0.1);
      const p1 = add(p0, axis, 1.5);
      const seatY = 0.52;
      return {
        back: [
          cap(p0, p1, STROKE_PX, ACCENT),
          cap([-0.05, seatY], [0.4, seatY], STROKE_PX, ACCENT),
          cap([-0.9, 1.03], [-0.9, 0], STROKE_PX, ACCENT),
          cap([0.28, seatY], [0.28, 0], STROKE_PX, ACCENT),
        ],
        front: dumbbell(J.wristN, J.elbowN, 0.3),
      };
    },
  },
  {
    id: 'overhead_press',
    view: 'side',
    keys: [
      { at: 0, ...STAND, lean: -3, headTilt: -6, wristRel: [0.3, -0.1], elbowDir: -1 },
      { at: 1, ...STAND, lean: 0, headTilt: 12, wristRel: [-0.05, 1.045], elbowDir: -1 },
    ],
    equipment: (J) => ({ front: barbellSide(J, PLATE_R_SMALL) }),
  },
  {
    id: 'lateral_raise',
    view: 'front',
    keys: [
      { at: 0, hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], arm: [7, 9] },
      { at: 1, hip: [0, 1.18], ankleR: [0.2, 0], ankleL: [-0.2, 0], arm: [86, 72] },
    ],
    equipment: (J) => ({ front: [...dumbbell(J.wristR, J.elbowR, 0.28), ...dumbbell(J.wristL, J.elbowL, 0.28)] }),
  },
  {
    id: 'pullup',
    view: 'front',
    floor: false,
    keys: [
      { at: 0, hip: [0, -2.027], wristR: [0.62, 0], wristL: [-0.62, 0], elbowDir: { R: -1, L: 1 }, leg: [4, 4] },
      { at: 1, hip: [0, -1.12], wristR: [0.62, 0], wristL: [-0.62, 0], elbowDir: { R: -1, L: 1 }, leg: [4, 4] },
    ],
    equipment: () => ({ back: [cap([-1.25, 0], [1.25, 0], STROKE_PX, ACCENT)] }),
  },
  {
    id: 'barbell_row',
    view: 'side',
    keys: [
      { at: 0, hip: [-0.3, 1.05], lean: 50, headTilt: -10, ankleN: [0, 0], ankleF: [0, 0], wristRel: [0, -1.045], elbowDir: -1 },
      { at: 1, hip: [-0.3, 1.05], lean: 50, headTilt: -10, ankleN: [0, 0], ankleF: [0, 0], wristRel: [-0.19, -0.32], elbowDir: -1 },
    ],
    equipment: (J) => ({ front: barbellSide(J, 0.22) }),
  },
  {
    id: 'bicep_curl',
    view: 'side',
    keys: [
      { at: 0, ...STAND, arm: [4, 4] },
      { at: 1, ...STAND, arm: [10, 140] },
    ],
    equipment: (J) => ({ front: barbellSide(J, PLATE_R_SMALL) }),
  },
  {
    id: 'tricep_pushdown',
    view: 'side',
    keys: [
      { at: 0, ...STAND, lean: 8, arm: [12, 95] },
      { at: 1, ...STAND, lean: 8, arm: [12, 8] },
    ],
    equipment: (J) => {
      const anchor = [0.75, 3.1];
      const d = ccw(norm(sub(J.wristN, anchor)));
      return {
        back: [cap(anchor, J.wristN, CABLE_PX, ACCENT), disc(anchor, 0.075, ACCENT)],
        front: [cap(add(J.wristN, d, -0.13), add(J.wristN, d, 0.13), STROKE_PX, ACCENT)],
      };
    },
  },
  {
    id: 'leg_curl',
    view: 'side',
    fit: 0.6,
    maxS: 250,
    footSide: -1,
    timing: { down: 0.4, hold1: 0.14, up: 0.4 },
    keys: [
      { at: 0, hip: [0.2, 1.03], lean: -90, arm: [-18, -95], leg: [90, 92] },
      { at: 1, hip: [0.2, 1.03], lean: -90, arm: [-18, -95], leg: [90, 225] },
    ],
    equipment: (J) => ({
      back: [...benchFlat(-1.0, 1.05, 0.75, [-0.75, 0.8]), disc(J.ankleF, 0.09, ACCENT, FAR_ALPHA)],
      front: [disc(J.ankleN, 0.09, ACCENT)],
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scene assembly + fitting
// ─────────────────────────────────────────────────────────────────────────────

/** All primitives of one exercise at range value c, in draw order. */
function scene(ex, c) {
  const pose = poseAt(ex.keys, c);
  const { J, body } = ex.view === 'front' ? buildFront(pose) : buildSide(pose, ex);
  const eq = ex.equipment(J, pose) || {};
  return [...(eq.back || []), ...body.back, ...body.mid, ...body.front, ...(eq.front || [])];
}

function extend(box, p, r) {
  box.minX = Math.min(box.minX, p[0] - r);
  box.maxX = Math.max(box.maxX, p[0] + r);
  box.minY = Math.min(box.minY, p[1] - r);
  box.maxY = Math.max(box.maxY, p[1] + r);
}

/** Bounding box (world units) of everything drawn over a whole rep. */
function measure(ex, S) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i <= 50; i++) {
    for (const p of scene(ex, i / 50)) {
      if (p.k === 'cap') {
        extend(box, p.a, p.px / 2 / S);
        extend(box, p.b, p.px / 2 / S);
      } else if (p.k === 'ring') extend(box, p.c, p.r + p.px / 2 / S);
      else extend(box, p.c, p.r);
    }
  }
  if (ex.floor !== false) extend(box, [box.minX, FLOOR_Y], STROKE_PX / 2 / S);
  return box;
}

/** Pixels per unit + screen origin so the whole rep sits centred in frame. */
function fit(ex) {
  let S = 170;
  let box;
  for (let pass = 0; pass < 3; pass++) {
    box = measure(ex, S);
    const fitH = ex.fit || 0.7;
    S = Math.min((fitH * H) / (box.maxY - box.minY), (0.82 * W) / (box.maxX - box.minX), ex.maxS || 200);
  }
  const cx = W / 2 - S * ((box.minX + box.maxX) / 2);
  const cy = H / 2 + S * ((box.minY + box.maxY) / 2);
  return { S, cx, cy, box };
}

function drawScene(cv, ex, view, c) {
  const { S, cx, cy, box } = view;
  const X = (p) => cx + p[0] * S;
  const Y = (p) => cy - p[1] * S;
  if (ex.floor !== false) {
    const w = box.maxX - box.minX;
    cv.capsule(X([box.minX - 0.15 * w, 0]), Y([0, FLOOR_Y]), X([box.maxX + 0.15 * w, 0]), Y([0, FLOOR_Y]), STROKE_PX / 2, INK, FLOOR_ALPHA);
  }
  for (const p of scene(ex, c)) {
    if (p.k === 'cap') cv.capsule(X(p.a), Y(p.a), X(p.b), Y(p.b), p.px / 2, p.col, p.al);
    else if (p.k === 'ring') cv.ring(X(p.c), Y(p.c), p.r * S, p.px / 2, p.col, p.al);
    else cv.disc(X(p.c), Y(p.c), p.r * S, p.col, p.al);
  }
}

/** Range value for frame n — the only place time enters, so loops are exact. */
function rangeAtFrame(ex, n) {
  return cycle((n % FRAMES_PER_REP) / FRAMES_PER_REP, ex.timing || TIMING);
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────────────────────

function ffmpegArgs(outFile) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-an', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p',
    '-crf', '26', '-maxrate', '1.2M', '-bufsize', '2.4M',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-movflags', '+faststart',
    outFile,
  ];
}

async function renderExercise(ex, cv) {
  const outFile = path.join(OUT_DIR, `${ex.id}_v1.mp4`);
  const view = fit(ex);
  const t0 = Date.now();
  const ff = spawn(FFMPEG, ffmpegArgs(outFile), { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => (err += d));
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
  });
  ff.stdin.on('error', () => {}); // surfaced via close code

  let pending = Promise.resolve();
  for (let n = 0; n < FRAMES; n++) {
    const buf = cv.begin(n);
    drawScene(cv, ex, view, rangeAtFrame(ex, n));
    await pending; // the other buffer has been handed to the pipe
    pending = new Promise((resolve) => ff.stdin.write(buf, () => resolve()));
  }
  await pending;
  ff.stdin.end();
  await done;
  const bytes = fs.statSync(outFile).size;
  console.log(`${ex.id.padEnd(18)} S=${view.S.toFixed(0).padStart(3)} px/unit  ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return outFile;
}

/** Full-resolution stills of frames 0 and 50 (ends of range) → out/stills/. */
function stills(ex, cv) {
  const dir = path.join(OUT_DIR, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const view = fit(ex);
  const out = [];
  for (const n of [0, 50]) {
    cv.begin(0);
    drawScene(cv, ex, view, rangeAtFrame(ex, n));
    const dst = path.join(dir, `${ex.id}_${n}.png`);
    const r = spawnSync(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-',
      '-frames:v', '1', dst,
    ], { input: cv.buf });
    if (r.status !== 0) throw new Error(`still ${ex.id}: ${r.stderr}`);
    out.push(dst);
  }
  return out;
}

/** 12 frames of the first rep (every 8th frame), tiled 4×3. */
function contactSheet(ex) {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  const src = path.join(OUT_DIR, `${ex.id}_v1.mp4`);
  const dst = path.join(SHEET_DIR, `${ex.id}.png`);
  const r = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-vf', "select='lt(n,96)*not(mod(n,8))',scale=480:-1,tile=4x3",
    '-frames:v', '1', '-fps_mode', 'passthrough', dst,
  ]);
  if (r.status !== 0) throw new Error(`sheet ${ex.id}: ${r.stderr}`);
  return dst;
}

/** ffprobe the file and compare first/last frames (compressed) + in-process loop proof. */
function verify(ex, cv) {
  const file = path.join(OUT_DIR, `${ex.id}_v1.mp4`);
  const probe = spawnSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_frames:format=duration,size',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  const info = JSON.parse(probe.stdout);
  const s = info.streams[0];
  const f = info.format;

  // Compressed frame 0 vs 299 straight out of the mp4.
  const raw = spawnSync(FFMPEG, [
    '-v', 'error', '-i', file, '-vf', "select='eq(n,0)+eq(n,299)'", '-fps_mode', 'passthrough',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: W * H * 3 * 2 + 1024 });
  const frameBytes = W * H * 3;
  let mean = NaN;
  let max = NaN;
  if (raw.stdout.length === frameBytes * 2) {
    let sum = 0;
    max = 0;
    for (let i = 0; i < frameBytes; i++) {
      const d = Math.abs(raw.stdout[i] - raw.stdout[frameBytes + i]);
      sum += d;
      if (d > max) max = d;
    }
    mean = sum / frameBytes;
  }

  // Exact proof: the renderer's frame 300 is byte-identical to frame 0.
  const view = fit(ex);
  cv.begin(0);
  drawScene(cv, ex, view, rangeAtFrame(ex, 0));
  const f0 = Buffer.from(cv.buf);
  cv.begin(1);
  drawScene(cv, ex, view, rangeAtFrame(ex, FRAMES));
  const exact = f0.equals(cv.buf);

  const dur = Number(f.duration);
  const ok =
    s.codec_name === 'h264' && s.profile === 'Main' && s.width === W && s.height === H &&
    s.pix_fmt === 'yuv420p' && s.r_frame_rate === `${FPS}/1` && Number(s.nb_frames) === FRAMES &&
    Math.abs(dur - DURATION_S) < 0.001 && Number(f.size) <= 1.8 * 1024 * 1024 && exact && mean < 1.5;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${ex.id.padEnd(18)} ${s.codec_name}/${s.profile} ${s.width}x${s.height} ${s.pix_fmt} ${s.r_frame_rate} ` +
      `${s.nb_frames}f ${dur.toFixed(3)}s ${(Number(f.size) / 1024).toFixed(0)}KB  loop: render f0==f300 ${exact ? 'yes' : 'NO'}, ` +
      `mp4 f0 vs f299 mean|Δ|=${mean.toFixed(3)} max=${max}`,
  );
  return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const ids = args.filter((a) => !a.startsWith('--'));
  if (flags.has('--list')) {
    for (const ex of EXERCISES) console.log(ex.id);
    return;
  }
  const selected = ids.length ? EXERCISES.filter((e) => ids.includes(e.id)) : EXERCISES;
  const unknown = ids.filter((id) => !EXERCISES.some((e) => e.id === id));
  if (unknown.length) throw new Error(`unknown exercise id(s): ${unknown.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cv = new Canvas(W, H, BG);

  if (!flags.has('--verify-only') && !flags.has('--sheet-only') && !flags.has('--stills-only')) {
    for (const ex of selected) await renderExercise(ex, cv);
  }
  if (flags.has('--sheet') || flags.has('--sheet-only')) {
    for (const ex of selected) console.log('sheet', contactSheet(ex));
  }
  if (flags.has('--stills') || flags.has('--stills-only')) {
    for (const ex of selected) console.log('stills', stills(ex, cv).join(' '));
  }
  if (flags.has('--verify') || flags.has('--verify-only')) {
    let all = true;
    for (const ex of selected) all = verify(ex, cv) && all;
    if (!all) process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { EXERCISES, scene, fit, cycle };
