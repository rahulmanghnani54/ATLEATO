/**
 * Shared plumbing for the stock-footage scripts (prep / manifest / shotlist).
 *
 * Zero dependencies beyond node built-ins, the repo's own node_modules/typescript
 * (already installed for the app) for reading the TS constants, ffmpeg/ffprobe
 * and the Supabase CLI on PATH.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLIPS_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(CLIPS_DIR, 'out', 'stock');
const SHEETS_DIR = path.join(OUT_DIR, 'sheets');
const MANIFEST_FILE = path.join(OUT_DIR, 'manifest.json');
const BUCKET = 'tutorial-clips';
const BUCKET_URI = `ss:///${BUCKET}/`;

/** Relative (POSIX) path from the repo root — the CLI misparses absolute D:\ paths as URLs. */
function relFromRoot(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// ffmpeg / ffprobe
// ─────────────────────────────────────────────────────────────────────────────

const WINGET_FF =
  'C:/Users/hp/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin';

function findTool(name, envOverride) {
  if (envOverride) return envOverride;
  const winget = path.join(WINGET_FF, `${name}.exe`);
  if (fs.existsSync(winget)) return winget;
  return name; // hope it is on PATH
}

const FFMPEG = findTool('ffmpeg', process.env.FFMPEG);
const FFPROBE = findTool('ffprobe', process.env.FFPROBE);

/** Production recipe shared with lib/raster.js — keep the two in step. */
const ENCODE = {
  width: 1280,
  height: 720,
  fps: 30,
  maxBytes: 1.8 * 1024 * 1024,
  maxDurationSec: 12,
  targetMin: 8,
  targetMax: 12,
  crfLadder: [26, 28, 30],
};

function encodeArgs(crf) {
  return [
    '-an', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p',
    '-crf', String(crf), '-maxrate', '1.2M', '-bufsize', '2.4M',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-movflags', '+faststart',
  ];
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw new Error(`${path.basename(cmd)}: ${r.error.message}`);
  return r;
}

/** ffprobe stream + format facts of a video file. */
function probe(file) {
  const r = run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,duration,display_matrix:stream_side_data=rotation:format=duration,size',
    '-of', 'json', file,
  ]);
  if (r.status !== 0) throw new Error(`ffprobe ${file}: ${r.stderr.trim()}`);
  const info = JSON.parse(r.stdout);
  if (!info.streams || !info.streams[0]) throw new Error(`ffprobe ${file}: no video stream`);
  return { stream: info.streams[0], format: info.format };
}

function frac(s) {
  if (!s) return NaN;
  const [a, b] = String(s).split('/').map(Number);
  return b ? a / b : a;
}

/** 12 frames spread evenly over the clip, tiled 6×2 into a PNG. */
function contactSheet(src, dst, durationSec, fps = ENCODE.fps) {
  const total = Math.max(12, Math.round(durationSec * fps));
  const step = Math.max(1, Math.floor(total / 12));
  const r = run(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-vf', `select='lt(n,${step * 12})*not(mod(n,${step}))',scale=480:-1,tile=6x2`,
    '-frames:v', '1', '-fps_mode', 'passthrough', dst,
  ]);
  if (r.status !== 0) throw new Error(`sheet ${dst}: ${r.stderr.trim()}`);
  return dst;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage (CLI on PATH; the project must be linked)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How to invoke the Supabase CLI without a shell. The npm install on Windows is
 * a `supabase.cmd` shim around `node …/node_modules/supabase/dist/supabase.js`
 * (Node refuses to spawn .cmd files directly), so run that script with the
 * current node; a real `supabase.exe` or a POSIX `supabase` is used as is.
 */
let supabaseCmd = null;
function resolveSupabase() {
  if (supabaseCmd) return supabaseCmd;
  if (process.env.SUPABASE_CLI) return (supabaseCmd = { cmd: process.env.SUPABASE_CLI, pre: [] });
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    for (const d of dirs) {
      if (fs.existsSync(path.join(d, 'supabase.exe'))) return (supabaseCmd = { cmd: path.join(d, 'supabase.exe'), pre: [] });
      const script = path.join(d, 'node_modules', 'supabase', 'dist', 'supabase.js');
      if (fs.existsSync(path.join(d, 'supabase.cmd')) && fs.existsSync(script)) {
        return (supabaseCmd = { cmd: process.execPath, pre: [script] });
      }
    }
    throw new Error('supabase CLI not found on PATH (set SUPABASE_CLI to the executable)');
  }
  return (supabaseCmd = { cmd: 'supabase', pre: [] });
}

function supabase(args, { dryRun = false } = {}) {
  const shown = `supabase ${args.join(' ')}`;
  if (dryRun) {
    console.log(`[dry-run] (cd ${REPO_ROOT}) ${shown}`);
    return { status: 0, stdout: '', stderr: '' };
  }
  const { cmd, pre } = resolveSupabase();
  const r = spawnSync(cmd, [...pre, ...args], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`${shown}: ${r.error.message}`);
  return r;
}

/** Object names in the bucket root (files only). Throws when the CLI fails. */
function listBucket() {
  const r = supabase(['storage', 'ls', BUCKET_URI, '--experimental']);
  if (r.status !== 0) {
    throw new Error(`supabase storage ls failed (${r.status}): ${(r.stderr || r.stdout).trim()}`);
  }
  return parseListing(r.stdout);
}

/** Pure: raw `storage ls` stdout → sorted object names (folders and chatter dropped). */
function parseListing(stdout) {
  const names = [];
  for (const raw of String(stdout).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.endsWith('/')) continue;
    if (/\s/.test(line)) continue; // "Initialising login role..." and friends
    names.push(line);
  }
  return [...new Set(names)].sort();
}

const CLIP_RE = /^([a-z0-9]+(?:_[a-z0-9]+)*)_v(\d+)\.mp4$/;

/** Pure: object names → { id: highestVersion } sorted by id. */
function versionsFromNames(names) {
  const best = {};
  for (const n of names) {
    const m = CLIP_RE.exec(n);
    if (!m) continue;
    const v = Number(m[2]);
    if (!(m[1] in best) || v > best[m[1]]) best[m[1]] = v;
  }
  return Object.fromEntries(Object.keys(best).sort().map((k) => [k, best[k]]));
}

// ─────────────────────────────────────────────────────────────────────────────
// App data (the TS constants) — see tsload.js
// ─────────────────────────────────────────────────────────────────────────────

/** All own-technique ids: 14 ExerciseForm + the TechniqueCards. */
function loadIds() {
  try {
    const { loadTechniqueData } = require('./tsload');
    const { entries } = loadTechniqueData();
    return entries.map((e) => e.id);
  } catch (err) {
    // Fallback: the `id: '...'` literals, so prep.js still validates when the
    // TS transpile trips over something unrelated.
    console.warn(`(ts loader failed — falling back to regex ids: ${err.message.split('\n')[0]})`);
    const ids = new Set();
    for (const f of ['constants/exerciseFormLibrary.ts', 'constants/techniqueCards.ts']) {
      const src = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
      for (const m of src.matchAll(/^\s+id:\s*'([a-z0-9_]+)'/gm)) ids.add(m[1]);
    }
    return [...ids].sort();
  }
}

function fmtBytes(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `stock-${process.pid}-${Date.now()}${ext}`);
}

module.exports = {
  REPO_ROOT, CLIPS_DIR, OUT_DIR, SHEETS_DIR, MANIFEST_FILE, BUCKET, BUCKET_URI,
  FFMPEG, FFPROBE, ENCODE, encodeArgs,
  run, probe, frac, contactSheet,
  supabase, listBucket, parseListing, versionsFromNames, CLIP_RE,
  loadIds, relFromRoot, fmtBytes, tmpFile,
};
