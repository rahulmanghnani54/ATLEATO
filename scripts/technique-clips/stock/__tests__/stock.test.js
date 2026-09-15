/**
 * Pure-logic tests for the stock-footage scripts. No ffmpeg, no network:
 *
 *   node node_modules/jest-cli/bin/jest.js --roots=scripts/technique-clips/stock -- scripts/technique-clips/stock/__tests__/stock.test.js
 *
 * (jest.config.js roots the app's tests at __tests__/, hence the --roots override.)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseListing, versionsFromNames, ENCODE } = require('../lib');
const { buildManifest, diffClips } = require('../manifest');
const { parseArgs, parseCrop, buildFilter, encodeToBudget } = require('../prep');
const { framingFrom, lookFor, render, buildRows } = require('../shotlist');
const { loadTechniqueData } = require('../tsload');

describe('bucket listing', () => {
  test('parseListing drops CLI chatter, folders and blanks, sorts and dedupes', () => {
    const out = 'Initialising login role...\r\nzeta_v1.mp4\nalpha_v2.mp4\n\nsheets/\nalpha_v2.mp4\n';
    expect(parseListing(out)).toEqual(['alpha_v2.mp4', 'zeta_v1.mp4']);
  });

  test('versionsFromNames keeps the highest version per id, ignores strangers', () => {
    const names = ['deadlift_v1.mp4', 'deadlift_v3.mp4', 'deadlift_v2.mp4', 'manifest.json', 'Bench_v1.mp4', 'plank_v1.mp4', 'plank_v1.png'];
    expect(versionsFromNames(names)).toEqual({ deadlift: 3, plank: 1 });
    expect(Object.keys(versionsFromNames(['b_v1.mp4', 'a_v1.mp4']))).toEqual(['a', 'b']);
  });
});

describe('manifest', () => {
  test('buildManifest shape', () => {
    const m = buildManifest(['x_v2.mp4', 'x_v1.mp4'], new Date('2026-01-02T03:04:05Z'));
    expect(m).toEqual({ version: 1, generatedAt: '2026-01-02T03:04:05.000Z', clips: { x: 2 } });
  });

  test('diffClips reports added / bumped / removed', () => {
    const d = diffClips({ a: 1, b: 1, c: 2 }, { a: 1, b: 2, d: 1 });
    expect(d.added).toEqual(['+ d v1']);
    expect(d.bumped).toEqual(['~ b v1 → v2']);
    expect(d.removed).toEqual(['- c (was v2)']);
  });
});

describe('prep args + filter', () => {
  test('parseArgs defaults and options', () => {
    const o = parseArgs(['deadlift', 'in.mp4']);
    expect(o).toMatchObject({ id: 'deadlift', input: 'in.mp4', start: 0, end: null, version: null, crop: null, upload: false });
    const p = parseArgs(['deadlift', 'in.mp4', '--start', '1.5', '--end', '10', '--version', '3', '--crop', '1440:810:0:135', '--upload']);
    expect(p).toMatchObject({ start: 1.5, end: 10, version: 3, crop: { w: 1440, h: 810, x: 0, y: 135 }, upload: true });
  });

  test('parseArgs rejects bad input', () => {
    expect(() => parseArgs(['deadlift'])).toThrow(/usage/);
    expect(() => parseArgs(['deadlift', 'in.mp4', '--end', '2', '--start', '3'])).toThrow(/--end/);
    expect(() => parseArgs(['deadlift', 'in.mp4', '--version', '1.5'])).toThrow(/integer/);
    expect(() => parseArgs(['deadlift', 'in.mp4', '--wat'])).toThrow(/unknown option/);
    expect(() => parseCrop('1280x720')).toThrow(/W:H:X:Y/);
  });

  test('buildFilter fills 1280x720 by centre crop, never pads', () => {
    const f = buildFilter(null);
    expect(f).toBe('scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720,fps=30,setsar=1,format=yuv420p');
    expect(f).not.toMatch(/pad/);
    expect(buildFilter({ w: 100, h: 50, x: 1, y: 2 })).toMatch(/^crop=100:50:1:2,scale=/);
  });

  test('encodeToBudget walks the CRF ladder until the file fits', () => {
    const sizes = { 26: ENCODE.maxBytes + 10, 28: ENCODE.maxBytes + 1, 30: ENCODE.maxBytes - 5 };
    const calls = [];
    const r = encodeToBudget({}, ({ crf }) => { calls.push(crf); return sizes[crf]; });
    expect(calls).toEqual([26, 28, 30]);
    expect(r.crf).toBe(30);
    expect(r.tries).toHaveLength(3);
    const early = encodeToBudget({}, () => 1000);
    expect(early.crf).toBe(26);
    expect(early.tries).toHaveLength(1);
  });
});

describe('shot list', () => {
  test('framing derives from the camera note', () => {
    expect(framingFrom('Phone directly to your side, at hip height, whole body in frame')).toBe('full body');
    expect(framingFrom('Phone to your side, at chest height, head to hips in frame')).toBe('head to hips');
    expect(framingFrom('Phone to your side, at knee height, knees to feet in frame')).toBe('knees to feet');
    expect(framingFrom('')).toBe('head to hips');
  });

  test('lookFor is one line built from view + posture + framing', () => {
    const s = lookFor({ cameraAngle: 'front_45', posture: 'lying', cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame' });
    expect(s).toBe('Shot 30–45° off the front, lifter lying on the back, both arms in frame; no cuts, camera static.');
    expect(s).not.toMatch(/\n/);
  });

  test('loads 14 forms + 59 cards = 73 unique ids from the TS constants and files every one under a library body part', () => {
    const data = loadTechniqueData();
    expect(data.forms).toHaveLength(14);
    expect(data.cards).toHaveLength(59);
    expect(data.entries).toHaveLength(73);
    expect(new Set(data.entries.map((e) => e.id)).size).toBe(73);
    const groups = buildRows(data.entries, data.library);
    expect(groups.map((g) => g.id)).toEqual([...data.library.map((g) => g.id), 'other']);
    expect(groups.find((g) => g.id === 'other').rows).toEqual([]);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(73);
  });

  test('the committed internal/STOCK_FOOTAGE_SHOTLIST.md is what the generator emits', () => {
    const file = path.resolve(__dirname, '..', '..', '..', '..', 'internal', 'STOCK_FOOTAGE_SHOTLIST.md');
    const committed = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(render(loadTechniqueData()));
    expect(committed.match(/^\| `[a-z0-9_]+` \|/gm)).toHaveLength(73);
    expect(committed).toMatch(/## LICENSE CHECKLIST/);
    expect(committed).toMatch(/## HOW TO/);
  });
});
