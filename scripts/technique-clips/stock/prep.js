#!/usr/bin/env node
/**
 * Prepare one bought stock clip for the tutorial-clips bucket.
 *
 *   node scripts/technique-clips/stock/prep.js <id> <input-file>
 *        [--start S] [--end S] [--version N] [--crop W:H:X:Y] [--upload] [--dry-run]
 *
 * Trims [start,end] (target 8–12 s), applies the optional source crop, fills a
 * 1280×720 frame (centre-crop to 16:9 — never letterboxed), 30 fps, no audio,
 * encodes with the production recipe (CRF 26 → 28 → 30 until ≤ 1.8 MB),
 * verifies with ffprobe and writes:
 *
 *   scripts/technique-clips/out/stock/<id>_v<N>.mp4
 *   scripts/technique-clips/out/stock/sheets/<id>_v<N>.png   (6×2 contact sheet)
 *
 * --upload: N defaults to (highest version in the bucket + 1); the object name
 * must not exist yet (versions are immutable); uploads from the repo root with
 * a RELATIVE path (the CLI misparses absolute D:\ paths as URLs) and then
 * republishes manifest.json. --dry-run prints the CLI commands instead.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  OUT_DIR, SHEETS_DIR, BUCKET_URI,
  FFMPEG, ENCODE, encodeArgs,
  run, probe, frac, contactSheet,
  supabase, listBucket, versionsFromNames,
  loadIds, relFromRoot, fmtBytes,
} = require('./lib');

const USAGE = `usage: node ${relFromRoot(__filename)} <id> <input-file> [--start S] [--end S] [--version N] [--crop W:H:X:Y] [--upload] [--dry-run]`;

// ─────────────────────────────────────────────────────────────────────────────
// args
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { id: null, input: null, start: 0, end: null, version: null, crop: null, upload: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--start') o.start = num(next(), a);
    else if (a === '--end') o.end = num(next(), a);
    else if (a === '--version') o.version = int(next(), a);
    else if (a === '--crop') o.crop = parseCrop(next());
    else if (a === '--upload') o.upload = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else positional.push(a);
  }
  [o.id, o.input] = positional;
  if (o.help) return o;
  if (!o.id || !o.input || positional.length > 2) throw new Error(USAGE);
  if (o.start < 0) throw new Error('--start must be ≥ 0');
  if (o.end != null && o.end <= o.start) throw new Error('--end must be greater than --start');
  if (o.version != null && o.version < 1) throw new Error('--version must be ≥ 1');
  return o;
}

function num(v, flag) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${flag}: not a number: ${v}`);
  return n;
}

function int(v, flag) {
  const n = num(v, flag);
  if (!Number.isInteger(n)) throw new Error(`${flag}: not an integer: ${v}`);
  return n;
}

function parseCrop(v) {
  const m = /^(\d+):(\d+):(\d+):(\d+)$/.exec(v);
  if (!m) throw new Error(`--crop must be W:H:X:Y in source pixels, got ${v}`);
  const [w, h, x, y] = m.slice(1).map(Number);
  if (w < 16 || h < 9) throw new Error('--crop window too small');
  return { w, h, x, y };
}

// ─────────────────────────────────────────────────────────────────────────────
// encode + verify
// ─────────────────────────────────────────────────────────────────────────────

function buildFilter(crop) {
  const { width: W, height: H, fps } = ENCODE;
  const chain = [];
  if (crop) chain.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`);
  chain.push(`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`);
  chain.push(`crop=${W}:${H}`); // centre: whatever overhangs 16:9 after the fill is cut, never padded
  chain.push(`fps=${fps}`, 'setsar=1', 'format=yuv420p');
  return chain.join(',');
}

function encodeOnce({ input, start, length, crop, crf, out }) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-ss', start.toFixed(3), '-i', input, '-t', length.toFixed(3),
    '-vf', buildFilter(crop),
    ...encodeArgs(crf),
    out,
  ];
  const r = run(FFMPEG, args);
  if (r.status !== 0) throw new Error(`ffmpeg (crf ${crf}) failed: ${r.stderr.trim()}`);
  return fs.statSync(out).size;
}

/** CRF ladder until the file fits. Returns { crf, size, tries }. */
function encodeToBudget(job, encode = encodeOnce) {
  const tries = [];
  for (const crf of ENCODE.crfLadder) {
    const size = encode({ ...job, crf });
    tries.push({ crf, size });
    if (size <= ENCODE.maxBytes) return { crf, size, tries };
  }
  return { ...tries[tries.length - 1], tries };
}

/** ffprobe the result against the production contract. Returns { ok, checks[], facts }. */
function verify(file) {
  const { stream, format } = probe(file);
  const size = Number(format.size);
  const fps = frac(stream.r_frame_rate);
  const duration = Number(stream.duration ?? format.duration);
  const nb = Number(stream.nb_frames);
  const checks = [
    ['codec h264', stream.codec_name === 'h264', stream.codec_name],
    ['profile Main', stream.profile === 'Main', stream.profile],
    [`${ENCODE.width}x${ENCODE.height}`, stream.width === ENCODE.width && stream.height === ENCODE.height, `${stream.width}x${stream.height}`],
    ['pix_fmt yuv420p', stream.pix_fmt === 'yuv420p', stream.pix_fmt],
    [`${ENCODE.fps} fps`, Math.abs(fps - ENCODE.fps) < 1e-6, stream.r_frame_rate],
    [`duration ≤ ${ENCODE.maxDurationSec} s`, duration <= ENCODE.maxDurationSec + 0.05, `${duration.toFixed(3)} s`],
    [`size ≤ ${fmtBytes(ENCODE.maxBytes)}`, size <= ENCODE.maxBytes, fmtBytes(size)],
  ];
  return { ok: checks.every((c) => c[1]), checks, facts: { size, fps, duration, frames: nb } };
}

/** Mean |Δ| per byte between the first and last decoded frame — a loop-seam hint, not a gate. */
function loopSeam(file, frames) {
  const { width: W, height: H } = ENCODE;
  if (!Number.isFinite(frames) || frames < 2) return NaN;
  const raw = run(FFMPEG, [
    '-v', 'error', '-nostdin', '-i', file, '-vf', `select='eq(n,0)+eq(n,${frames - 1})'`, '-fps_mode', 'passthrough',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { encoding: 'buffer', maxBuffer: W * H * 3 * 2 + 4096 });
  const bytes = W * H * 3;
  if (!raw.stdout || raw.stdout.length !== bytes * 2) return NaN;
  let sum = 0;
  for (let i = 0; i < bytes; i++) sum += Math.abs(raw.stdout[i] - raw.stdout[bytes + i]);
  return sum / bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    if (err.message !== USAGE) console.error(USAGE);
    process.exit(2);
  }
  if (o.help) {
    console.log(USAGE);
    return;
  }
  const warnings = [];
  const warn = (m) => { warnings.push(m); console.warn(`warning: ${m}`); };

  // 1. id
  const ids = loadIds();
  if (!ids.includes(o.id)) {
    const near = ids.filter((x) => x.includes(o.id) || o.id.includes(x)).slice(0, 6);
    console.error(`unknown id "${o.id}" — ids come from constants/exerciseFormLibrary.ts + constants/techniqueCards.ts (${ids.length} known)${near.length ? `\n  did you mean: ${near.join(', ')}` : ''}`);
    process.exit(2);
  }

  // 2. input
  const input = path.resolve(o.input);
  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`);
    process.exit(2);
  }
  const src = probe(input);
  const srcDuration = Number(src.stream.duration ?? src.format.duration);
  const srcFps = frac(src.stream.avg_frame_rate || src.stream.r_frame_rate);
  const rotated = Array.isArray(src.stream.side_data_list) && src.stream.side_data_list.some((s) => s.rotation);
  console.log(`input : ${input}`);
  console.log(`        ${src.stream.codec_name} ${src.stream.width}x${src.stream.height}${rotated ? ' (rotation tag — ffmpeg auto-rotates)' : ''}, ${srcFps.toFixed(2)} fps, ${srcDuration.toFixed(2)} s, ${fmtBytes(Number(src.format.size))}`);
  if (src.stream.width < ENCODE.width || src.stream.height < ENCODE.height) warn(`source is smaller than ${ENCODE.width}x${ENCODE.height} — it will be upscaled`);

  // 3. range
  const start = o.start;
  let end = o.end;
  if (end == null) {
    end = Number.isFinite(srcDuration) ? Math.min(srcDuration, start + 10) : start + 10;
    if (Number.isFinite(srcDuration) && srcDuration - start > 10) console.log(`        no --end given — taking 10 s from --start ${start}`);
  }
  if (Number.isFinite(srcDuration) && start >= srcDuration) {
    console.error(`--start ${start} is past the end of the input (${srcDuration.toFixed(2)} s)`);
    process.exit(2);
  }
  if (Number.isFinite(srcDuration) && end > srcDuration + 0.01) {
    warn(`--end ${end} is past the end of the input — clamped to ${srcDuration.toFixed(3)}`);
    end = srcDuration;
  }
  const length = end - start;
  if (length > ENCODE.maxDurationSec + 0.01) {
    console.error(`range is ${length.toFixed(2)} s — the app rejects clips over ${ENCODE.maxDurationSec} s; tighten --start/--end (target ${ENCODE.targetMin}–${ENCODE.targetMax} s)`);
    process.exit(2);
  }
  if (length < ENCODE.targetMin) warn(`range is ${length.toFixed(2)} s — target is ${ENCODE.targetMin}–${ENCODE.targetMax} s (2–3 clean reps)`);

  // 4. crop sanity
  if (o.crop) {
    const { w, h, x, y } = o.crop;
    if (x + w > src.stream.width || y + h > src.stream.height) {
      console.error(`--crop ${w}:${h}:${x}:${y} does not fit inside the ${src.stream.width}x${src.stream.height} source`);
      process.exit(2);
    }
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) > 0.01) warn(`--crop is ${ratio.toFixed(3)}:1, not 16:9 — the window is filled and centre-cropped again to 1280x720`);
    if (w < ENCODE.width) warn(`--crop window is narrower than ${ENCODE.width}px — it will be upscaled`);
  }

  // 5. version + immutability
  let version = o.version;
  let bucket = null;
  if (o.upload && !o.dryRun) {
    bucket = listBucket();
    const versions = versionsFromNames(bucket);
    if (version == null) version = Math.max(1, versions[o.id] ?? 1) + 1;
    const objectName = `${o.id}_v${version}.mp4`;
    if (bucket.includes(objectName)) {
      console.error(`refusing to overwrite ${BUCKET_URI}${objectName} — versions are immutable; highest in bucket is v${versions[o.id]}, use --version ${versions[o.id] + 1} or omit --version`);
      process.exit(3);
    }
  }
  if (version == null) version = 2;
  const stem = `${o.id}_v${version}`;
  const out = path.join(OUT_DIR, `${stem}.mp4`);
  const sheet = path.join(SHEETS_DIR, `${stem}.png`);
  fs.mkdirSync(SHEETS_DIR, { recursive: true });

  // 6. encode
  console.log(`encode: ${stem}.mp4  [${start.toFixed(3)} → ${end.toFixed(3)} s = ${length.toFixed(2)} s]${o.crop ? `  crop ${o.crop.w}:${o.crop.h}:${o.crop.x}:${o.crop.y}` : '  centre-crop to 16:9'}`);
  const enc = encodeToBudget({ input, start, length, crop: o.crop, out });
  for (const t of enc.tries) console.log(`        crf ${t.crf} → ${fmtBytes(t.size)}${t.size > ENCODE.maxBytes ? '  (over budget)' : ''}`);

  // 7. verify + sheet
  const v = verify(out);
  for (const [label, ok, got] of v.checks) console.log(`        ${ok ? 'ok  ' : 'FAIL'} ${label}  (${got})`);
  const seam = loopSeam(out, v.facts.frames);
  if (Number.isFinite(seam)) {
    console.log(`        loop seam: mean |Δ| first↔last frame = ${seam.toFixed(2)}/255 ${seam < 6 ? '(tight)' : seam < 14 ? '(visible jump — check the sheet)' : '(large — re-cut so it starts and ends at the top)'}`);
    if (seam >= 14) warn('first and last frames differ a lot — the loop will jump');
  }
  contactSheet(out, sheet, v.facts.duration);
  if (!v.ok) {
    console.error(`\n${stem}.mp4 FAILED verification — not uploading. File kept at ${relFromRoot(out)} for inspection.`);
    process.exit(1);
  }

  // 8. upload + manifest
  let uploaded = null;
  let manifestNote = 'not published (no --upload)';
  if (o.upload) {
    const objectName = `${stem}.mp4`;
    const r = supabase(['storage', 'cp', relFromRoot(out), `${BUCKET_URI}${objectName}`, '--experimental', '--content-type', 'video/mp4'], { dryRun: o.dryRun });
    if (r.status !== 0) {
      console.error(`upload failed (${r.status}): ${(r.stderr || r.stdout).trim()}`);
      process.exit(1);
    }
    uploaded = `${BUCKET_URI}${objectName}`;
    try {
      const { refresh } = require('./manifest');
      const m = refresh({ publish: true, dryRun: o.dryRun, log: (s) => console.log(`        ${s.replace(/\n/g, '\n        ')}`) });
      manifestNote = o.dryRun ? 'would publish' : `published (${o.id} → v${m.clips[o.id] ?? '?'})`;
    } catch (err) {
      console.error(`manifest publish failed: ${err.message}\n  the clip IS uploaded — run: node scripts/technique-clips/stock/manifest.js --publish`);
      process.exit(1);
    }
  }

  // 9. summary
  const pad = (k) => k.padEnd(10);
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`${pad('id')}${o.id}   v${version}`);
  console.log(`${pad('source')}${input}`);
  console.log(`${pad('range')}${start.toFixed(3)} → ${end.toFixed(3)} s  (${length.toFixed(2)} s, ${v.facts.frames} frames)`);
  console.log(`${pad('output')}${relFromRoot(out)}  ${fmtBytes(v.facts.size)}  crf ${enc.crf}`);
  console.log(`${pad('sheet')}${relFromRoot(sheet)}  ← open it: tiles 1 and 12 should match`);
  console.log(`${pad('verify')}${v.ok ? 'PASS' : 'FAIL'}  h264 Main ${ENCODE.width}x${ENCODE.height} ${ENCODE.fps} fps ≤ ${ENCODE.maxDurationSec} s ≤ ${fmtBytes(ENCODE.maxBytes)}`);
  console.log(`${pad('upload')}${uploaded ? (o.dryRun ? `would upload → ${uploaded}` : uploaded) : `skipped — re-run with --upload (next version is picked from the bucket)`}`);
  console.log(`${pad('manifest')}${manifestNote}`);
  if (warnings.length) console.log(`${pad('warnings')}${warnings.join('\n          ')}`);
  console.log('────────────────────────────────────────────────────────');
}

if (require.main === module) main();

module.exports = { parseArgs, parseCrop, buildFilter, verify, encodeToBudget };
