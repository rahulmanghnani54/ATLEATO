#!/usr/bin/env node
/**
 * render.js — technique clips as looping stick-figure pictograms.
 *
 * Zero dependencies: lib/raster.js fills an RGB buffer per frame with a small
 * signed-distance rasteriser and streams the raw frames into ffmpeg, which
 * encodes out/<id>_v1.mp4 (1280×720, 30 fps, 10.000 s, H.264 Main, yuv420p).
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
 * Layout:
 *   lib/raster.js     frame buffer, primitives, ffmpeg/ffprobe
 *   lib/figure.js     joint model, IK, keyframes, timing, side/front cameras
 *   lib/equipment.js  equipment pictograms
 *   exercises/<id>.js one module per exercise (contract in README.md)
 *
 *   node scripts/technique-clips/render.js                 # every exercises/*.js: encode + sheet + verify
 *   node scripts/technique-clips/render.js deadlift pullup # some
 *   node scripts/technique-clips/render.js --verify-only   # probe + loop check of the files in out/
 *   node scripts/technique-clips/render.js --sheet-only    # contact sheets only
 *   node scripts/technique-clips/render.js --stills        # + frame 0 / 50 PNGs
 *   node scripts/technique-clips/render.js --list          # ids only
 *   (--no-sheet / --no-verify trim the default run; --stills-only skips the encode)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const R = require('./lib/raster');
const { W, H, FRAMES, FRAMES_PER_REP, DURATION_S, FPS, MAX_BYTES, INK, STROKE_PX, FLOOR_ALPHA, FLOOR_Y } = R;
const { poseAt, cycle, TIMING, build } = require('./lib/figure');

const OUT_DIR = path.join(__dirname, 'out');
const SHEET_DIR = path.join(OUT_DIR, 'sheets');
const EX_DIR = path.join(__dirname, 'exercises');

// ─────────────────────────────────────────────────────────────────────────────
// Exercise modules
// ─────────────────────────────────────────────────────────────────────────────

const VIEWS = new Set(['side', 'front']);

/** Load and sanity-check one exercises/<id>.js module. */
function loadExercise(file) {
  const id = path.basename(file, '.js');
  const ex = require(file);
  const bad = (msg) => new Error(`exercises/${id}.js: ${msg}`);
  if (!ex || typeof ex !== 'object') throw bad('must export an object');
  if (ex.id !== id) throw bad(`id "${ex.id}" must equal the file name "${id}"`);
  if (!VIEWS.has(ex.view)) throw bad(`view must be "side" or "front" (got ${JSON.stringify(ex.view)})`);
  if (!Array.isArray(ex.keys) || ex.keys.length < 2) throw bad('keys must be an array of ≥ 2 keyframes');
  if (ex.keys[0].at !== 0 || ex.keys[ex.keys.length - 1].at !== 1) throw bad('keys must start at at:0 and end at at:1');
  for (let i = 1; i < ex.keys.length; i++) if (!(ex.keys[i].at > ex.keys[i - 1].at)) throw bad('keys[].at must increase');
  for (const k of ex.keys) if (!Array.isArray(k.hip)) throw bad('every key needs hip: [x, y]');
  if (ex.equipment != null && typeof ex.equipment !== 'function') throw bad('equipment must be a function (J, pose) => ({ back, front })');
  if (ex.timing) for (const f of ['down', 'hold1', 'up']) if (typeof ex.timing[f] !== 'number') throw bad(`timing.${f} missing`);
  return ex;
}

/** Every exercises/*.js, sorted by id. */
function loadAll() {
  return fs
    .readdirSync(EX_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => loadExercise(path.join(EX_DIR, f)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene assembly + fitting
// ─────────────────────────────────────────────────────────────────────────────

/** All primitives of one exercise at range value c, in draw order. */
function scene(ex, c) {
  const pose = poseAt(ex.keys, c);
  const { J, body } = build(pose, ex);
  const eq = (ex.equipment && ex.equipment(J, pose)) || {};
  return [...(eq.back || []), ...body.back, ...body.mid, ...body.front, ...(eq.front || [])];
}

/** Bounding box (world units) of everything drawn over a whole rep. */
function measure(ex, S) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i <= 50; i++) R.extendByPrims(box, scene(ex, i / 50), S);
  if (ex.floor !== false) R.extend(box, [box.minX, FLOOR_Y], STROKE_PX / 2 / S);
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
  if (ex.floor !== false) {
    const w = box.maxX - box.minX;
    const X = (x) => cx + x * S;
    const y = cy - FLOOR_Y * S;
    cv.capsule(X(box.minX - 0.15 * w), y, X(box.maxX + 0.15 * w), y, STROKE_PX / 2, INK, FLOOR_ALPHA);
  }
  R.drawPrims(cv, scene(ex, c), view);
}

/** Range value for frame n — the only place time enters, so loops are exact. */
function rangeAtFrame(ex, n) {
  return cycle((n % FRAMES_PER_REP) / FRAMES_PER_REP, ex.timing || TIMING);
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────────────────────

const outFile = (ex) => path.join(OUT_DIR, `${ex.id}_v1.mp4`);

async function renderExercise(ex, cv) {
  const view = fit(ex);
  const t0 = Date.now();
  const bytes = await R.encode(cv, outFile(ex), (c, n) => drawScene(c, ex, view, rangeAtFrame(ex, n)));
  console.log(`${ex.id.padEnd(26)} S=${view.S.toFixed(0).padStart(3)} px/unit  ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return outFile(ex);
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
    out.push(R.writePng(cv, path.join(dir, `${ex.id}_${n}.png`)));
  }
  return out;
}

/** 6×2 contact sheet of the first rep → out/sheets/<id>.png. */
function contactSheet(ex) {
  fs.mkdirSync(SHEET_DIR, { recursive: true });
  return R.contactSheet(outFile(ex), path.join(SHEET_DIR, `${ex.id}.png`));
}

/** ffprobe the file, compare first/last encoded frames, and prove frame 300 == frame 0 in-process. */
function verify(ex, cv) {
  const file = outFile(ex);
  const { stream: s, format: f } = R.probe(file);
  const { mean, max } = R.loopDelta(file);

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
    Math.abs(dur - DURATION_S) < 0.001 && Number(f.size) <= MAX_BYTES && exact && mean < 1.5;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${ex.id.padEnd(26)} ${s.codec_name}/${s.profile} ${s.width}x${s.height} ${s.pix_fmt} ${s.r_frame_rate} ` +
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
  const all = loadAll();
  if (flags.has('--list')) {
    for (const ex of all) console.log(ex.id);
    return;
  }
  const selected = ids.length ? all.filter((e) => ids.includes(e.id)) : all;
  const unknown = ids.filter((id) => !all.some((e) => e.id === id));
  if (unknown.length) throw new Error(`unknown exercise id(s): ${unknown.join(', ')} (no exercises/<id>.js)`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cv = new R.Canvas();

  const only = ['--verify-only', '--sheet-only', '--stills-only'].some((f) => flags.has(f));
  if (!only) {
    for (const ex of selected) await renderExercise(ex, cv);
  }
  if ((!only && !flags.has('--no-sheet')) || flags.has('--sheet') || flags.has('--sheet-only')) {
    for (const ex of selected) console.log('sheet', contactSheet(ex));
  }
  if (flags.has('--stills') || flags.has('--stills-only')) {
    for (const ex of selected) console.log('stills', stills(ex, cv).join(' '));
  }
  if ((!only && !flags.has('--no-verify')) || flags.has('--verify') || flags.has('--verify-only')) {
    let ok = true;
    for (const ex of selected) ok = verify(ex, cv) && ok;
    if (!ok) process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { loadAll, loadExercise, scene, fit, measure, drawScene, rangeAtFrame, verify };
