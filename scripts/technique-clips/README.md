# Technique clips

Looping 10 s pictogram clips of a stick figure performing each of the 14
exercises the technique flow teaches. Drawn in the app's illustrated language
(`components/formcoach/CameraSetupFigure.tsx`: flat round-cap strokes, ink
figure on `surfaceAlt`, brand accent for equipment only, no text) so they sit on
the technique page like an instruction, not a stock video.

`render.js` is zero-dependency Node: a small signed-distance rasteriser draws
each frame into an RGB buffer and streams the raw frames into ffmpeg. Nothing to
`npm install`.

## Regenerate

Requires ffmpeg + ffprobe. The script looks for the WinGet install first, then
`$FFMPEG` / `$FFPROBE`, then `PATH`.

```sh
node scripts/technique-clips/render.js                 # all 14 → out/<id>_v1.mp4
node scripts/technique-clips/render.js deadlift pullup # just some
node scripts/technique-clips/render.js --sheet         # + out/sheets/<id>.png contact sheets
node scripts/technique-clips/render.js --stills        # + out/stills/<id>_{0,50}.png (ends of range)
node scripts/technique-clips/render.js --verify        # ffprobe + loop check
node scripts/technique-clips/render.js --list          # ids
```

`--sheet-only`, `--stills-only` and `--verify-only` skip the encode and work on
the files already in `out/`. `out/` is gitignored; regenerate it, do not commit it.

Encode settings (baked into the script): 1280×720, 30 fps, exactly 300 frames
(10.000 s), H.264 Main 3.1, yuv420p, CRF 26 capped at 1.2 Mbit/s, GOP 60,
`+faststart`. Every clip lands at 70–170 KB.

### Loop

3 reps per clip, 100 frames per rep. Everything animated is a pure function of
the rep phase, so frame 300 is byte-identical to frame 0 — `--verify` proves it
by rendering both and comparing, and also diffs frame 0 against frame 299 out of
the encoded mp4 (should be compression noise only, mean |Δ| well under 1/255).

### Editing a pose

Each entry in `EXERCISES` is a view (`side` | `front`), keyframes over the eased
range value `c` (0 = start of the rep, 1 = end of range) and an `equipment`
function that draws from the joint positions. Limbs are given either as IK
targets (`wristN/F`, `ankleN/F`, `wristRel`) — the bar path is then a straight
line and the elbows/knees follow — or as absolute angles (`arm`, `leg`) when the
hand should swing in an arc (curl, pushdown, lateral raise). Units: torso = 1,
floor at y = 0, the side-view figure faces +x. After changing a pose, run with
`--sheet` and look at the contact sheet — a stranger should be able to name the
exercise from it.

## Upload

The app loads `tutorial-clips/<id>_v1.mp4` from Supabase Storage. Push a
regenerated clip with the Supabase CLI:

```sh
supabase storage cp scripts/technique-clips/out/deadlift_v1.mp4 ss:///tutorial-clips/deadlift_v1.mp4 --experimental
```

(Repeat per id, or loop over `out/*_v1.mp4`.) The bucket is public-read; the CLI
needs a linked project (`supabase link`).

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

## The 14 ids

`barbell_squat`, `goblet_squat`, `lunge`, `deadlift`, `romanian_deadlift`,
`bench_press`, `incline_db_press`, `overhead_press`, `lateral_raise`, `pullup`,
`barbell_row`, `bicep_curl`, `tricep_pushdown`, `leg_curl`.
