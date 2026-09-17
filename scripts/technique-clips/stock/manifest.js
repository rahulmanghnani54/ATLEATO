#!/usr/bin/env node
/**
 * Build (and optionally publish) the tutorial-clips manifest.
 *
 *   node scripts/technique-clips/stock/manifest.js            # list bucket → out/stock/manifest.json + diff
 *   node scripts/technique-clips/stock/manifest.js --publish  # + upload as ss:///tutorial-clips/manifest.json
 *
 * The manifest is {"version":1,"generatedAt":ISO,"clips":{id:N}} with N the
 * highest `<id>_v<N>.mp4` present in the bucket, ids sorted. It is the ONE
 * mutable object in the bucket: clips are immutable per version, the manifest
 * is overwritten so the app learns about new versions without a release.
 */
'use strict';

const fs = require('node:fs');
const {
  OUT_DIR, MANIFEST_FILE, BUCKET_URI,
  supabase, listBucket, versionsFromNames, relFromRoot,
} = require('./lib');

const MANIFEST_VERSION = 1;

function buildManifest(names, now = new Date()) {
  return { version: MANIFEST_VERSION, generatedAt: now.toISOString(), clips: versionsFromNames(names) };
}

/** Pure: previous vs next `clips` maps → { added, bumped, removed } lines. */
function diffClips(prev, next) {
  const added = [];
  const bumped = [];
  const removed = [];
  for (const id of Object.keys(next)) {
    if (!(id in prev)) added.push(`+ ${id} v${next[id]}`);
    else if (prev[id] !== next[id]) bumped.push(`~ ${id} v${prev[id]} → v${next[id]}`);
  }
  for (const id of Object.keys(prev)) if (!(id in next)) removed.push(`- ${id} (was v${prev[id]})`);
  return { added, bumped, removed };
}

function readPrevious() {
  try {
    const j = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    return j && typeof j.clips === 'object' && j.clips ? j : null;
  } catch {
    return null;
  }
}

function writeManifest(manifest) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return MANIFEST_FILE;
}

/** The CLI's `storage cp` never overwrites: a second publish answers
 *  409 KeyAlreadyExists (seen 2026-09-17, the first publish after the manifest
 *  was created). There is no upsert flag in the CLI, so the overwrite is
 *  remove-then-copy. The window between the two is well under a second, and a
 *  client that fetches inside it gets a 400, which lib/tutorialClips treats as
 *  "keep the last good copy" — never as an empty manifest.
 *  Exported for tests via the `run` seam. */
function isAlreadyExists(r) {
  const text = `${r.stdout || ''}
${r.stderr || ''}`;
  return /KeyAlreadyExists|"statusCode":s*"?409|Duplicate|already exists/i.test(text);
}

function publishManifest({ dryRun = false, run = supabase } = {}) {
  const rel = relFromRoot(MANIFEST_FILE);
  const dst = `${BUCKET_URI}manifest.json`;
  const cp = () => run(['storage', 'cp', rel, dst, '--experimental', '--content-type', 'application/json', '--cache-control', 'public, max-age=60'], { dryRun });
  let r = cp();
  if (r.status !== 0 && isAlreadyExists(r)) {
    // --yes: without it the CLI asks for confirmation, reads "no" from a
    // closed stdin and exits 0 having deleted nothing (2026-09-17: the second
    // cp then 409'd again). Exit code alone is therefore not proof — list the
    // bucket and require the object to be gone before copying.
    const rm = run(['storage', 'rm', dst, '--experimental', '--yes'], { dryRun });
    if (rm.status !== 0) throw new Error(`manifest overwrite failed at rm (${rm.status}): ${(rm.stderr || rm.stdout).trim()}`);
    if (!dryRun) {
      const ls = run(['storage', 'ls', BUCKET_URI, '--experimental']);
      if (ls.status === 0 && /(^|s)manifest.json(s|$)/.test(ls.stdout || '')) {
        throw new Error(`manifest overwrite: rm reported success but manifest.json is still in the bucket.
rm output: ${(rm.stderr || rm.stdout).trim() || '(none)'}`);
      }
    }
    r = cp();
  }
  if (r.status !== 0) throw new Error(`manifest upload failed (${r.status}): ${(r.stderr || r.stdout).trim()}`);
  return dst;
}

/** Full refresh: list → write → diff (→ publish). Returns the manifest. Used by prep.js too. */
function refresh({ publish = false, dryRun = false, log = console.log } = {}) {
  const prev = readPrevious();
  const names = listBucket();
  const manifest = buildManifest(names);
  writeManifest(manifest);
  const n = Object.keys(manifest.clips).length;
  log(`bucket: ${names.length} objects, ${n} clip ids → ${relFromRoot(MANIFEST_FILE)}`);

  if (prev) {
    const d = diffClips(prev.clips, manifest.clips);
    const lines = [...d.added, ...d.bumped, ...d.removed];
    log(lines.length ? `diff vs previous local manifest (${prev.generatedAt}):\n  ${lines.join('\n  ')}` : 'no change vs previous local manifest');
  } else {
    log('no previous local manifest — first run');
  }

  if (publish) {
    const dst = publishManifest({ dryRun });
    log(dryRun ? `would publish → ${dst}` : `published → ${dst}`);
  } else {
    log('(local only — pass --publish to upload manifest.json)');
  }
  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const dryRun = args.includes('--dry-run');
  const bad = args.filter((a) => !['--publish', '--dry-run'].includes(a));
  if (bad.length) {
    console.error(`unknown argument(s): ${bad.join(' ')}\nusage: node ${relFromRoot(__filename)} [--publish] [--dry-run]`);
    process.exit(2);
  }
  try {
    refresh({ publish, dryRun });
  } catch (err) {
    console.error(`manifest: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { buildManifest, diffClips, refresh, publishManifest, isAlreadyExists, writeManifest, readPrevious };
