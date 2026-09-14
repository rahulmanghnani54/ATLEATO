/**
 * lib/raster.js — the frame buffer, the signed-distance primitives, the scene
 * primitive descriptors and the ffmpeg/ffprobe plumbing.
 *
 * Nothing in here knows about exercises. The figure and equipment modules
 * describe a frame as a list of *primitives in world units* (see `cap`, `ring`,
 * `disc` below); `drawPrims` projects that list through a view (px/unit +
 * origin) onto the `Canvas`, and `encode` streams 300 such canvases into
 * ffmpeg's stdin.
 *
 * Output format is fixed here and nowhere else: 1280×720, 30 fps, 10.000 s,
 * H.264 Main 3.1, yuv420p, CRF 26 capped at 1.2 Mbit/s, GOP 60, +faststart.
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
const MAX_BYTES = 1.8 * 1024 * 1024;

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
// Palette (constants/tokens.ts, light theme) + stroke language
// ─────────────────────────────────────────────────────────────────────────────

const BG = [0xf2, 0xf5, 0xf3]; // surfaceAlt
const INK = [0x0b, 0x14, 0x10]; // text / figure
const ACCENT = [0x12, 0xb9, 0x81]; // brand emerald — equipment only

const STROKE_PX = 15; // ≈ 3 units of the 240-wide figure viewBox at 1280 px
const CABLE_PX = 9; // thinner stroke for cables / thin bars
const FLOOR_ALPHA = 0.28;
const FAR_ALPHA = 0.42; // far-side limbs (and far-side equipment) in side view
const FLOOR_Y = -0.09; // the floor line sits just under the feet (y = 0)

// ─────────────────────────────────────────────────────────────────────────────
// Scene primitives (world units; strokes in px). A frame is an array of these.
// ─────────────────────────────────────────────────────────────────────────────

/** Round-capped stroke from point `a` to point `b`, `px` wide. */
const cap = (a, b, px, col, al = 1) => ({ k: 'cap', a, b, px, col, al });
/** Circle outline centred on `c`, radius `r` units, stroke `px` wide. */
const ring = (c, r, px, col, al = 1) => ({ k: 'ring', c, r, px, col, al });
/** Filled circle centred on `c`, radius `r` units. */
const disc = (c, r, col, al = 1) => ({ k: 'disc', c, r, col, al });

/** Grow `box` ({minX,maxX,minY,maxY}) to contain point `p` padded by `r`. */
function extend(box, p, r) {
  box.minX = Math.min(box.minX, p[0] - r);
  box.maxX = Math.max(box.maxX, p[0] + r);
  box.minY = Math.min(box.minY, p[1] - r);
  box.maxY = Math.max(box.maxY, p[1] + r);
}

/** Grow `box` to contain every primitive in `prims` at `S` px/unit. */
function extendByPrims(box, prims, S) {
  for (const p of prims) {
    if (p.k === 'cap') {
      extend(box, p.a, p.px / 2 / S);
      extend(box, p.b, p.px / 2 / S);
    } else if (p.k === 'ring') extend(box, p.c, p.r + p.px / 2 / S);
    else extend(box, p.c, p.r);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rasteriser — signed-distance coverage, bounding-box iteration, alpha blend
// ─────────────────────────────────────────────────────────────────────────────

class Canvas {
  constructor(w = W, h = H, bg = BG) {
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

  /** Select the buffer for `frameIndex` (alternating) and clear it to BG. */
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

/**
 * Rasterise a list of world-unit primitives through `view` = { S, cx, cy }
 * (pixels per unit, screen position of world origin; world y is UP).
 */
function drawPrims(cv, prims, view) {
  const { S, cx, cy } = view;
  const X = (p) => cx + p[0] * S;
  const Y = (p) => cy - p[1] * S;
  for (const p of prims) {
    if (p.k === 'cap') cv.capsule(X(p.a), Y(p.a), X(p.b), Y(p.b), p.px / 2, p.col, p.al);
    else if (p.k === 'ring') cv.ring(X(p.c), Y(p.c), p.r * S, p.px / 2, p.col, p.al);
    else cv.disc(X(p.c), Y(p.c), p.r * S, p.col, p.al);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ffmpeg / ffprobe
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

/**
 * Encode FRAMES frames to `outFile`. `paint(cv, n)` must draw frame `n` onto
 * the canvas buffer returned by `cv.begin(n)` (already cleared). Resolves with
 * the file size in bytes.
 */
async function encode(cv, outFile, paint) {
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
    paint(cv, n);
    await pending; // the other buffer has been handed to the pipe
    pending = new Promise((resolve) => ff.stdin.write(buf, () => resolve()));
  }
  await pending;
  ff.stdin.end();
  await done;
  return fs.statSync(outFile).size;
}

/** Write the canvas's current buffer as a PNG. */
function writePng(cv, dst) {
  const r = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${cv.w}x${cv.h}`, '-i', '-',
    '-frames:v', '1', dst,
  ], { input: cv.buf });
  if (r.status !== 0) throw new Error(`png ${dst}: ${r.stderr}`);
  return dst;
}

/** 12 frames of the first rep (every 8th frame) tiled 6×2 into a PNG. */
function contactSheet(src, dst) {
  const r = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-vf', "select='lt(n,96)*not(mod(n,8))',scale=480:-1,tile=6x2",
    '-frames:v', '1', '-fps_mode', 'passthrough', dst,
  ]);
  if (r.status !== 0) throw new Error(`sheet ${dst}: ${r.stderr}`);
  return dst;
}

/** ffprobe stream + format facts of an mp4. */
function probe(file) {
  const r = spawnSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_frames:format=duration,size',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe ${file}: ${r.stderr}`);
  const info = JSON.parse(r.stdout);
  return { stream: info.streams[0], format: info.format };
}

/** Decode frames 0 and 299 of an mp4 and return { mean, max } of |Δ| per byte. */
function loopDelta(file) {
  const raw = spawnSync(FFMPEG, [
    '-v', 'error', '-i', file, '-vf', `select='eq(n,0)+eq(n,${FRAMES - 1})'`, '-fps_mode', 'passthrough',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: W * H * 3 * 2 + 1024 });
  const frameBytes = W * H * 3;
  if (raw.stdout.length !== frameBytes * 2) return { mean: NaN, max: NaN };
  let sum = 0;
  let max = 0;
  for (let i = 0; i < frameBytes; i++) {
    const d = Math.abs(raw.stdout[i] - raw.stdout[frameBytes + i]);
    sum += d;
    if (d > max) max = d;
  }
  return { mean: sum / frameBytes, max };
}

module.exports = {
  W, H, FPS, DURATION_S, FRAMES, REPS, FRAMES_PER_REP, MAX_BYTES,
  FFMPEG, FFPROBE,
  BG, INK, ACCENT, STROKE_PX, CABLE_PX, FLOOR_ALPHA, FAR_ALPHA, FLOOR_Y,
  cap, ring, disc, extend, extendByPrims,
  Canvas, drawPrims,
  encode, writePng, contactSheet, probe, loopDelta,
};
