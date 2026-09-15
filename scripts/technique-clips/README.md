# Technique clips

Looping 10 s pictogram clips of a stick figure performing each exercise the
technique flow teaches. Drawn in the app's illustrated language
(`components/formcoach/CameraSetupFigure.tsx`: flat round-cap strokes, ink
figure on `surfaceAlt`, brand accent for equipment only, no text) so they sit on
the technique page like an instruction, not a stock video.

Zero-dependency Node: a small signed-distance rasteriser draws each frame into
an RGB buffer and streams the raw frames into ffmpeg. Nothing to `npm install`.

```
scripts/technique-clips/
  render.js          CLI: loads exercises/*.js, encodes, makes contact sheets, verifies
  lib/raster.js      frame buffer, cap/ring/disc primitives, ffmpeg + ffprobe plumbing
  lib/figure.js      joint model, proportions, IK, keyframe lerp, rep timing, side/front cameras
  lib/equipment.js   equipment pictograms (bar, dumbbell, benches, cables, machines, box, …)
  exercises/<id>.js  ONE module per exercise — the only file you touch to add a clip
  out/               generated (gitignored): <id>_v1.mp4, sheets/<id>.png, stills/
```

## Regenerate

Requires ffmpeg + ffprobe. The script looks for the WinGet install first, then
`$FFMPEG` / `$FFPROBE`, then `PATH`. Run from the repo root:

```sh
node scripts/technique-clips/render.js                 # every exercises/*.js → encode + sheet + verify
node scripts/technique-clips/render.js deadlift pullup # just some ids
node scripts/technique-clips/render.js --verify-only   # ffprobe + loop check of the files already in out/
node scripts/technique-clips/render.js --sheet-only    # contact sheets only (out/sheets/<id>.png, 6×2 tiles)
node scripts/technique-clips/render.js --stills        # + out/stills/<id>_{0,50}.png (ends of range)
node scripts/technique-clips/render.js --list          # ids
```

`--no-sheet` / `--no-verify` trim the default run; `--stills-only` skips the
encode. `out/` is gitignored — regenerate it, never commit it.

Encode settings (fixed in `lib/raster.js`): 1280×720, 30 fps, exactly 300
frames (10.000 s), H.264 Main 3.1, yuv420p, CRF 26 capped at 1.2 Mbit/s, GOP
60, `+faststart`. Clips land at 70–170 KB; the verifier fails anything over
1.8 MB. x264 is deterministic here: identical frames + settings give a
byte-identical mp4, so an md5 of `out/<id>_v1.mp4` is a valid regression check.

### Verify

`--verify` (part of the default run) checks every clip: `h264`/`Main`,
1280×720, `yuv420p`, `30/1`, 300 frames, duration 10.000 s, size ≤ 1.8 MB,
the renderer's frame 300 byte-identical to frame 0, and the *encoded* frame 0
vs frame 299 differing by compression noise only (mean |Δ| < 1.5/255). A
`FAIL` line sets a non-zero exit code.

### Loop

3 reps per clip, 100 frames per rep. Everything animated is a pure function of
the rep phase (`lib/figure.js` `cycle`: ease-in-out down, short hold, ease-in-out
up, short hold), so frame 300 is byte-identical to frame 0. Do not read the
clock, `Math.random`, or frame counters in an exercise module.

## Exercise module contract

`exercises/<id>.js` exports one plain object. `render.js` validates it on load
(id = file name, view, keys ordered from `at: 0` to `at: 1`, `hip` on every
key, `equipment` a function) and refuses to run otherwise.

```js
module.exports = {
  id: 'lat_pulldown',        // REQUIRED — equals the file name; ids are final (batch catalog)
  view: 'side',              // REQUIRED — 'side' (figure faces +x) | 'front' (faces the viewer).
                             //            catalog view front_45 → use 'front' with a wide stance.
  keys: [ /* ≥ 2 keyframes, see below */ ],           // REQUIRED
  equipment: (J, pose) => ({ back: [...], front: [...] }), // optional; default draws nothing

  // optional tuning — omit unless the default framing is wrong
  fit: 0.7,                  // fraction of frame HEIGHT the rep's bounding box may fill (default 0.7)
  maxS: 200,                 // max pixels per unit (default 200) — lower it for tall scenes
  floor: true,               // false → no floor line (pull-up: the bar is at y = 0 and the figure hangs below)
  footSide: 1,               // side view: -1 flips the default toe direction (prone / lying on the front)
  noLegs: false, noFeet: false,
  timing: { down: 0.44, hold1: 0.06, up: 0.44 }, // fractions of one rep; remainder = hold at c = 0
};
```

### Keyframes

`keys` describe the figure at range value `c`: `c = 0` is the start of the rep,
`c = 1` the end of range; the rep runs 0 → 1 → 0 with easing. Every numeric
field (numbers and `[x, y]` points, nested objects too) is linearly
interpolated between neighbouring keys; strings/booleans come from the earlier
key. Add a mid key (`at: 0.5`) when a straight-line path looks wrong (see
`overhead_press.js`). You may invent extra numeric fields (e.g. `grip: 0`) and
read them back in `equipment(J, pose)`.

Units: torso = 1, floor at y = 0, y is UP. Fields the cameras understand:

| field | applies | meaning |
|---|---|---|
| `hip: [x,y]` | both | hip joint — required on every key |
| `lean: deg` | side | torso angle from straight up, + = toward +x (forward). `-90` = lying on the back, head toward -x |
| `headTilt: deg` | side | head/neck relative to the torso |
| `torso: k` | both | torso length multiplier (default 1) — foreshortens a leaning front-view figure |
| `shoulderHalf: u` | front | half shoulder width (default 0.4) |
| `hipHalf: u` | front | legs leave the pelvis this far either side of `hip` (default 0; draws a pelvis bar) |
| `neck: u` | front | visible neck length, neck base → head ring (default 0.12); the head follows it up or down |
| `headDrop: u` | front | lowers the head centre by this much (default 0). + = down toward / below the shoulder line, overlapping the torso is allowed — a hinged lifter seen from the front reads as looking at the floor. The neck stroke shortens first and vanishes once `headDrop ≥ neck` |
| `wristN/F` (side) `wristR/L` (front) `[x,y]` | both | absolute IK target for the hand |
| `wristRel: [x,y]` | both | IK target for BOTH hands relative to the shoulder |
| `armsHang: true` | both | both arms straight down |
| `arm` or `armN/F/R/L: [upperDeg, forearmDeg]` | both | absolute angles from straight down, + toward +x (front view: mirrored for L) — use for arcs (curl, raise) |
| `elbowDir: ±1` or `{N,F,R,L: ±1}` | both | which side of the shoulder→wrist line the elbow bends to |
| `armScale: k` or `armScaleN/F/R/L: k` | both | foreshortening: the drawn upper-arm AND forearm are `k ×` their length (0.35–1, default 1; clamped). The IK solves on the scaled bones, so a `wrist*` target keeps working — an arm reaching toward the camera (front view) is simply drawn shorter. Per-side wins over `armScale`; interpolated like any number |
| `ankleN/F` / `ankleR/L: [x,y]` | both | absolute IK target for the ankle |
| `leg` or `legN/F/R/L: [thighDeg, shinDeg]` | both | absolute angles from straight down |
| `kneeDir` | both | as `elbowDir`, for the knee |
| `toeN/F: [x,y]` | side | toe position (default: perpendicular to the shin, 0.24 long; kneeling/prone poses should set it) |

Depth cues in front view are opt-in and default to the plain figure: a
bent-over row from the front might use `headDrop: 0.3` at the bottom of the
hinge so the head hangs at shoulder height, and `armScale: 0.6` while the
hands come toward the viewer so the arms do not read as too long. Leaving the
fields out renders exactly as before (the clip md5s are a regression check).

Side view: `N` = near side (drawn on top), `F` = far side (drawn lighter and
nudged 0.045 back). Front view: `R` is at +x. `lib/figure.js` exports `STAND`
(`{ hip: [0, 1.18], lean: 0, ankleN: [0, 0], ankleF: [0, 0] }`) and
`STAND_FRONT` to spread into keys.

### Equipment

`equipment(J, pose)` receives the resolved joints and returns `{ back, front }`
— arrays of primitives drawn behind / in front of the figure (either may be
omitted). Joints: `hip, shoulder, head, neckEnd` plus, per side,
`shoulderX, elbowX, wristX, hipX, kneeX, ankleX` (`toeX` in side view;
`shoulderR/L`, `neckBase` in front view) where X ∈ N,F (side) or R,L (front).

Build the arrays from `lib/equipment.js` (signatures below) or from the raw
primitives in `lib/raster.js`: `cap(a, b, px, col, al)`, `ring(c, r, px, col,
al)`, `disc(c, r, col, al)` with `ACCENT` / `INK`, `STROKE_PX` (15) /
`CABLE_PX` (9), `FAR_ALPHA` (0.42). Equipment is accent-coloured, the figure is
ink — do not mix. Spread arrays with `...` when combining.

### Complete example

```js
/** Lat pulldown, side view: seated under the thigh pad, bar from overhead to the upper chest. */
'use strict';
const { sub } = require('../lib/figure');
const { cableStack, seat, handleBar } = require('../lib/equipment');

const TOP = [1.6, 3.2]; // top pulley of the stack

module.exports = {
  id: 'lat_pulldown',
  view: 'side',
  maxS: 150, // a 3.2-unit-tall stack needs a wider view than a standing figure
  keys: [
    { at: 0, hip: [0, 0.75], lean: -5, ankleN: [0.55, 0], ankleF: [0.55, 0], wristN: [0.25, 2.6], wristF: [0.25, 2.6], elbowDir: -1 },
    { at: 1, hip: [0, 0.75], lean: -15, ankleN: [0.55, 0], ankleF: [0.55, 0], wristN: [0.2, 1.55], wristF: [0.2, 1.55], elbowDir: -1 },
  ],
  equipment: (J) => ({
    back: [
      ...cableStack({ x: TOP[0], top: TOP[1], to: J.wristN }),
      ...seat({ x: 0.1, y: 0.62, len: 0.6, back: { height: 0.5 } }),
    ],
    front: handleBar(J.wristN, sub(J.wristN, TOP)),
  }),
};
```

Then: `node scripts/technique-clips/render.js lat_pulldown` and open
`out/sheets/lat_pulldown.png` — a stranger should be able to name the exercise
from the 12 tiles. The existing 14 modules are the reference for posture
values (lying = `bench_press.js`, incline = `incline_db_press.js`, prone =
`leg_curl.js`, hanging = `pullup.js`, hinged = `barbell_row.js`, cable =
`tricep_pushdown.js`, front view = `lateral_raise.js`).

### Equipment primitives (`lib/equipment.js`)

All return an array of primitives; points are `[x, y]`; every function takes a
trailing `al` alpha (default 1 — pass `FAR_ALPHA` for far-side gear).

| function | draws |
|---|---|
| `bar(a, b, px = STROKE_PX, al)` | one accent stroke — the building block |
| `post(x, top, bottom = 0, al)` | vertical post to the floor |
| `barbellSide(at, r = PLATE_R, al)` | barbell end-on: plate ring + bar dot (`PLATE_R` 0.26, `PLATE_R_SMALL` 0.19) |
| `barbellFront(c, halfLen = 0.62, plateR = 0.13, al)` | barbell from the front: thin bar + a plate disc each end |
| `dumbbell(wrist, elbow, len = 0.3, al, vertical = false)` | dumbbell across the wrist, perpendicular to the forearm (or vertical) |
| `dumbbellAt(at, dir, len = 0.3, al)` | dumbbell centred on `at` along unit `dir` |
| `plate(at, r = 0.12, al)` | small weight / kettlebell stand-in (disc) |
| `benchFlat(x1, x2, y, legs[], al)` | flat bench pad + posts at each x in `legs` |
| `inclinePad(from, angleFromUp, len, al)` | one angled pad (0 = vertical, 90 = flat toward +x) |
| `seat({ x, y, len = 0.5, back = { height, angleFromUp = 0, rear = -1 }, al })` | seat pad + post, optional back pad at the rear end |
| `inclineBench({ seat, angleFromUp = 30, padLen = 1.4, seatLen = 0.45, al })` | seat + back pad leaning toward -x + posts (also preacher / spider / chest-supported pads) |
| `declineBench({ head, foot, roller = true, al })` | pad from low `head` end to high `foot` end + posts + foot roller |
| `legPressSled({ seat, backAngleFromUp = 45, backLen = 1.1, seatLen = 0.55, platform: { a, b }, al })` | reclined back pad + seat + foot platform from `a` to `b` with a strut |
| `footPlatform(at, dir = [0,1], len = 0.5, al)` | short thick plate centred on `at` along `dir` |
| `box({ x, w, h, y = 0, al })` | rectangle standing on the floor (step / plyo box) |
| `wall({ x, top, bottom = 0, al })` | vertical line |
| `pullupBar(x1 = -1.25, x2 = 1.25, y = 0, al)` | horizontal bar |
| `dipBars({ x1, x2, top, handleLen = 0.35, al })` | two posts with short handles on top |
| `rackPins({ x, y, height = 2.2, pinLen = 0.35, dir = 1, al })` | rack upright + safety pin at height `y` toward `dir` |
| `machineLever({ pivot, end, tip = 'roller' \| 'handle' \| null, handleLen = 0.26, al })` | pivot dot + thin arm + roller disc or handle stroke |
| `cableLine(from, to, al)` | thin cable + pulley dot at `from` |
| `cableStack({ x, top = 3, base = 0, pulley = [x, top], to = null, al })` | tall column + top pulley + cable to `to` (omit `to` for a bare column) |
| `lowPulley({ x, top = 0.35, to = null, al })` | short column + low pulley + cable |
| `handleBar(at, dir, len = 0.26, al)` | straight bar across the hand, perpendicular to cable direction `dir` |
| `ropeHandle(at, dir, len = 0.2, spreadDeg = 28, al)` | two rope ends fanning from `at` along `dir` (dir = hand − pulley) |
| `vHandle(at, dir, len = 0.18, spreadDeg = 35, al)` | V-handle at `at` opening toward `dir` |
| `wheel({ c, r = 0.17, al })` | ab wheel: ring + axle dot |
| `roller(at, r = 0.09, al)` | ankle / shin roller pad (disc) |

Constants: `PLATE_R`, `PLATE_R_SMALL`, `DUMBBELL_KNOB`, `PULLEY_R`, `ROLLER_R`.
Vector helpers from `lib/figure.js`: `add(p, v, k)`, `sub(a, b)`, `norm(v)`,
`dist(a, b)`, `ccw(v)`, `cw(v)`, `lerp(a, b, t)`, `fromUp(deg)`, `fromDown(deg)`, `ik(...)`.

## Upload

The app loads `tutorial-clips/<id>_v1.mp4` from Supabase Storage. Push a clip
with the Supabase CLI **from the repo root with a relative source path** —
absolute `D:\…` paths are misparsed as URLs:

```sh
supabase storage cp scripts/technique-clips/out/deadlift_v1.mp4 ss:///tutorial-clips/deadlift_v1.mp4 --experimental
```

Repeat per id (or loop over `scripts/technique-clips/out/*_v1.mp4`). The bucket
is public-read; the CLI needs a linked project (`supabase link`). Run
`--verify-only` before uploading.

## Replacing one with real footage

Keep the `_v1` pictograms as the baseline and add real footage as `_v2` so the
app can fall back and old builds keep working:

1. Encode the footage with the same settings so the player behaves identically:

   ```sh
   ffmpeg -i raw.mov -an -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30" \
     -t 10 -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p -crf 26 -maxrate 1.2M -bufsize 2.4M \
     -g 60 -keyint_min 60 -sc_threshold 0 -movflags +faststart deadlift_v2.mp4
   ```

   Trim it so the last frame flows into the first (start and end in the same
   rest position) — the player loops it.

2. `supabase storage cp deadlift_v2.mp4 ss:///tutorial-clips/deadlift_v2.mp4 --experimental`

3. Point that exercise's clip version at `v2` in the technique content (the
   pictogram stays at `_v1` for the others). Never overwrite `_v1` in place —
   clients cache by URL.

## Stock footage

`stock/` is the hand-run pipeline for replacing pictograms with bought
footage. Zero dependencies: node built-ins, the repo's own `typescript` (to
read the constants), ffmpeg/ffprobe and the Supabase CLI. Run everything from
the repo root.

```
scripts/technique-clips/stock/
  shotlist.js   internal/STOCK_FOOTAGE_SHOTLIST.md from constants/exerciseFormLibrary.ts + techniqueCards.ts
  prep.js       <id> <input> [--start S] [--end S] [--version N] [--crop W:H:X:Y] [--upload] → out/stock/<id>_v<N>.mp4 + sheets/<id>_v<N>.png
  manifest.js   [--publish] — bucket listing → out/stock/manifest.json {"version":1,"generatedAt","clips":{id:N}}
  lib.js        ffmpeg/ffprobe/supabase plumbing, bucket parsing, id loader
  tsload.js     require hook: transpiles .ts via node_modules/typescript, resolves '@/…'
  __tests__/    node node_modules/jest-cli/bin/jest.js --roots=scripts/technique-clips/stock -- scripts/technique-clips/stock/__tests__/stock.test.js
```

1. Buy against [`internal/STOCK_FOOTAGE_SHOTLIST.md`](../../internal/STOCK_FOOTAGE_SHOTLIST.md)
   (one row per id: view, posture, framing, what to look for, target file,
   licence checkbox) and its LICENSE CHECKLIST. Regenerate it after editing the
   constants: `node scripts/technique-clips/stock/shotlist.js` (a test fails
   when the committed file is stale).
2. `node scripts/technique-clips/stock/prep.js deadlift raw.mp4 --start 3.2 --end 12.8`
   — trims to 8–12 s, crops to 16:9 (centre, or `--crop`), 1280×720 @ 30 fps,
   no audio, the production recipe above (CRF 26 → 28 → 30 until ≤ 1.8 MB),
   ffprobe verification, 6×2 contact sheet. Check the sheet: tiles 1 and 12 must
   both be the top position.
3. Add `--upload`: the version defaults to the bucket's highest + 1, an existing
   object name is refused (versions are immutable), the clip is uploaded with the
   relative path the CLI needs, then `manifest.js --publish` runs. Without
   `--upload` the version defaults to 2. `--dry-run` prints the CLI commands.
4. `node scripts/technique-clips/stock/manifest.js` alone rewrites the local
   manifest and prints the diff against the previous one; `--publish` overwrites
   `ss:///tutorial-clips/manifest.json` — the one mutable object in the bucket.

`out/stock/` is gitignored with the rest of `out/`. Keep the licence receipts
and `out/stock/LICENSES.csv` (id, provider, item id, license type, date) backed
up next to the source files.

## Ids

`node scripts/technique-clips/render.js --list` prints them (one per
`exercises/*.js`). The original 14: `barbell_squat`, `goblet_squat`, `lunge`,
`deadlift`, `romanian_deadlift`, `bench_press`, `incline_db_press`,
`overhead_press`, `lateral_raise`, `pullup`, `barbell_row`, `bicep_curl`,
`tricep_pushdown`, `leg_curl`. New ids come from the technique batch catalog and
must not be renamed.
