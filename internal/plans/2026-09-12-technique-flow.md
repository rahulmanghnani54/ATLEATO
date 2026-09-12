# Technique → Camera Setup → Form Check — Implementation Plan

**Spec:** `internal/specs/2026-09-12-technique-flow-design.md` (read it first; this plan does not repeat rationale).
**Integration branch:** `feat/technique-flow`. Each wave-1 task has its own worktree/branch (`wt/technique-<task>`); merges are clean because file scopes are disjoint.
**Repo rules:** jest roots = `__tests__/` only; `node node_modules/jest-cli/bin/jest.js <file>`; `npx tsc --noEmit -p .` (filter to your files while other agents are mid-edit); `docs/` is the public website — never write there; never touch `android/`, `supabase/functions/`, `.env*`.

---

## Wave 1 — parallel, disjoint files

### T1 · Content schema + matcher fixes
**Worktree:** `D:\Dev\fitai-pro-app-wt\content` · **Files:** `constants/exerciseFormLibrary.ts`, new `__tests__/exerciseFormLibrary.test.ts`. Nothing else.

1. `CoachCue.coachId` → `PersonaId` (import type from `@/lib/personaTheme`). Rename entry values `'ct'`→`'ct_fletcher'`, `'drmike'`→`'dr_mike'` (14 entries × 2). `getCoachCue(form, coachId: string)` keeps a `string` param but normalises via `programIdToPersona`-style prefix rules (`ct`→`ct_fletcher`, `drmike`/`dr_mike`→`dr_mike`, else exact), so both vocabularies resolve.
2. Extend `ExerciseForm` (all optional except `id`):
   ```ts
   id: string;                                   // = const name, e.g. 'bench_press'
   keyPoints?: string[];                         // 3–5 imperative lines
   cameraAngle?: 'side' | 'front' | 'front_45';
   cameraNote?: string;
   tutorial?: { version: number; durationSec: number | null } | null;
   detectedFaults?: Array<{ checkId: string; label: string }>;
   visionCategory?: VisionCategory | null;
   ```
   Populate all 14 entries: `id`; `keyPoints`/`cameraAngle`/`cameraNote` from the table in `C:\Users\hp\AppData\Local\Temp\claude\C--Users-hp-Downloads-orreryx\54bcfb09-4ecb-4c9a-9b81-785d1c74c16d\scratchpad\technique-flow-critique.md` (section "content-matcher → must_change_before_build → PROPOSED keyPoints"), which is drawn only from existing checkpoint/cue text; `tutorial: null` everywhere (placeholder-first); `detectedFaults` per profile using ONLY these check ids — press: `press.elbow_flare, press.wrist_stack, press.lockout, press.torso_stack`; curl: `curl.elbow_drift, curl.body_swing, curl.full_extension`; squat: `squat.depth, squat.knee_valgus, squat.hip_shift, squat.torso_pitch`; deadlift: `deadlift.hip_height, deadlift.bar_path, deadlift.hip_level, deadlift.lockout`; pull: `pull.elbow_drive, pull.shoulder_pack, pull.torso_swing, pull.full_stretch`; lunge: `lunge.shin_angle, lunge.depth, lunge.shoulder_level, lunge.torso_lean`. Labels are short user-facing nouns ("Elbow flare", "Wrist stack", "Lockout", "Torso lean"…).
   `visionCategory`: `null` on `lateral_raise` and `leg_curl`; `'lunge'` on `lunge`; omit elsewhere.
3. `visionCategoryFor(form)` → `form.visionCategory !== undefined ? form.visionCategory : CATEGORY_TO_VISION[form.category]`. Do **not** add values to `ExerciseForm['category']`.
4. Matcher `getExerciseForm(name)`: (a) normalise input: lowercase, `[-_]`→space, collapse whitespace; (b) exact `exerciseName` match wins; (c) else longest keyword, ties broken by array order (unchanged). Keywords: add `'romanian deadlift'`, `'rdl'` to romanian_deadlift; `'incline curl'`, `'incline dumbbell curl'` to bicep_curl; `'seated barbell press'`, `'seated dumbbell press'`, `'dumbbell press'`, `'shoulder press'` (already) to overhead_press; `'incline barbell press'`, `'incline press'` to incline_db_press; `'step up'` already on lunge (hyphen fix makes it hit). Remove `'tricep extension'` from tricep_pushdown (Overhead Tricep Extension must NOT match the curl profile). Keep `'bench'` etc.
5. New exports:
   ```ts
   export function getExerciseFormKey(exerciseName: string): string   // form.id ?? slug(name)  (slug: lowercase, non-alnum → '_', trim '_')
   export function requiredLandmarksFor(form: ExerciseForm | null): number[]   // getProfile(visionCategoryFor(form)).requiredJoints, [] when null
   export function tipsForExercise(exerciseName: string): string[]      // LibraryExercise.tips from constants/exerciseLibrary.ts, else experts.ts programs, else []
   export function keyPointsFor(exerciseName: string): string[]         // form.keyPoints ?? form.checkpoints.map(c => c.description) ?? tipsForExercise(name)
   ```
   `requiredLandmarksFor` imports `getProfile` from `@/lib/vision/biomechanics` (no cycle: biomechanics imports nothing from constants).
6. **Tests** (`__tests__/exerciseFormLibrary.test.ts`): table over these names → expected `id` and vision category: `Barbell Bench Press→bench_press/press`, `Incline Barbell Press→incline_db_press/press`, `Incline Dumbbell Curl→bicep_curl/curl`, `Incline Curl→bicep_curl/curl`, `Romanian Deadlift→romanian_deadlift/deadlift`, `Seated Barbell Press→overhead_press/press`, `Seated Dumbbell Press→overhead_press/press`, `Flat Dumbbell Press→bench_press/press` (add `'flat dumbbell press'` keyword to bench_press), `Step-Up→lunge/lunge`, `Walking Lunge→lunge/lunge`, `Bulgarian Split Squat→lunge/lunge`, `Lateral Raise→lateral_raise/null`, `Seated Leg Curl→leg_curl/null`, `Overhead Tricep Extension→null form`, `Hack Squat→barbell_squat/squat`, `Pull-Up→pullup/pull`; `hasVisionCoverage` false for Lateral Raise/Leg Curl/Overhead Tricep Extension, true for Bench/Squat/Lunge; every `detectedFaults[].checkId` of every entry exists in `getProfile(visionCategoryFor(form)).checks.map(c => c.id)` (import `getProfile`); every entry has `id === its const name` (assert unique ids); `getCoachCue(form,'ct_strength'|'ct'|'ct_fletcher')` returns the CT line, `'dr_mike_mav'|'drmike'` the Dr Mike line; `keyPointsFor('Rack Pull')` returns the library tips (non-empty).

Acceptance: tests green; `tsc` clean for this file and its two importers (`app/(tabs)/workouts.tsx`, `app/form-coach.tsx`).

### T2 · Tutorial memory + analytics events
**Worktree:** `D:\Dev\fitai-pro-app-wt\memory` · **Files:** new `lib/tutorialMemory.ts`, new `hooks/useTutorialMemory.ts`, new `__tests__/tutorialMemory.test.ts`, `lib/analytics.ts` (union only).

`lib/tutorialMemory.ts` (pattern: `lib/activeSession.ts` coerce + `lib/streakFreezes.ts` cache/ensureLoaded; direct `@react-native-async-storage/async-storage`):
```ts
export const TUTORIAL_MEMORY_KEY = 'tutorial_memory:v1';
export interface TutorialMemoryEntry { watched: number; skipped: number; lastSeenAt: number; knowsIt: boolean; setupSeen: boolean; lastRetriggerAt?: number }
export type TutorialMemory = Record<string, TutorialMemoryEntry>;
export async function loadTutorialMemory(): Promise<TutorialMemory>;          // cached after first read; corrupt/missing → {}
export function getEntry(key: string): TutorialMemoryEntry | null;              // sync, from cache (null before load)
export async function recordWatched(key: string): Promise<TutorialMemoryEntry>;
export async function recordSkipped(key: string): Promise<TutorialMemoryEntry>;
export async function markKnown(key: string, knowsIt: boolean): Promise<TutorialMemoryEntry>;
export async function markSetupSeen(key: string): Promise<TutorialMemoryEntry>;
export async function recordRetrigger(key: string, now?: number): Promise<TutorialMemoryEntry>;
export function shouldShowFastPath(e: TutorialMemoryEntry | null): boolean;    // !!e && (e.knowsIt || e.watched >= 1 || e.skipped >= 2)
export const RETRIGGER_COOLDOWN_MS = 10 * 60 * 1000;
export function shouldRetrigger(recentReps: ReadonlyArray<ReadonlyArray<string>>, entry: TutorialMemoryEntry | null, now: number, promptedThisSet: boolean): { checkId: string } | null;
//   recentReps = check-id sets of the last ≤4 completed reps, oldest first. Returns the check id that appears in ≥3 of the last 4 (needs ≥3 reps present), unless promptedThisSet or now - (entry?.lastRetriggerAt ?? -Infinity) < RETRIGGER_COOLDOWN_MS. Ties → the id with the most occurrences, then first seen.
export function _resetTutorialMemoryForTests(): void;
```
All writes: mutate cache, then `setItem` (await, try/catch, never throw to callers). `now` defaults to `Date.now()`.

`hooks/useTutorialMemory.ts` (pattern `hooks/useVoiceCues.ts`): `useTutorialMemory(key: string) → { loaded: boolean; entry: TutorialMemoryEntry | null; fastPath: boolean; watched(); skipped(); setKnown(v); setupSeen(); }` — hydrate once, re-render after each write.

`lib/analytics.ts`: add `'tutorial_shown' | 'tutorial_skipped' | 'tutorial_completed' | 'technique_retrigger_shown'` to the union with a one-line comment each. Nothing else in that file.

**Tests:** mock AsyncStorage (`jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))`): round-trip; corrupt JSON → `{}`; fast-path thresholds (knowsIt / watched 1 / skipped 2, not skipped 1); `shouldRetrigger`: 3-of-4 fires, 2-of-4 doesn't, only 2 reps doesn't, cooldown blocks, `promptedThisSet` blocks, tie-break.

### T3 · Presentational components + clip cache
**Worktree:** `D:\Dev\fitai-pro-app-wt\components` · **Files:** new `lib/tutorialClips.ts`, new `components/formcoach/TechniquePlayer.tsx`, new `components/formcoach/CameraSetupFigure.tsx`, new `components/formcoach/KeyPointsList.tsx`, new `__tests__/tutorialClips.test.ts`.

`lib/tutorialClips.ts`:
```ts
export const TUTORIAL_BUCKET = 'tutorial-clips';
export function clipObjectPath(formId: string, version: number): string;      // `${formId}_v${version}.mp4`
export function clipPublicUrl(supabaseUrl: string, objectPath: string): string; // `${url}/storage/v1/object/public/${TUTORIAL_BUCKET}/${objectPath}` (trim trailing '/')
export function clipCachePath(cacheDir: string, objectPath: string): string;   // `${cacheDir}tutorial-clips/${objectPath}` (mkdir handled by caller)
export async function ensureClipCached(objectPath: string, opts?: { timeoutMs?: number }): Promise<string>;
//   uses `expo-file-system/legacy` (cacheDirectory, getInfoAsync, makeDirectoryAsync, downloadAsync) and process.env.EXPO_PUBLIC_SUPABASE_URL;
//   returns file:// uri; rejects on missing env, HTTP ≠ 200, or timeout (default 8000 ms; Promise.race, and delete a partial file on failure).
```
Pure functions tested; `ensureClipCached` tested with `jest.mock('expo-file-system/legacy')` for: cache hit skips download; 404 rejects and leaves no file; timeout rejects.

`TechniquePlayer` props `{ objectPath: string | null; poster: React.ReactNode; height: number; onReady?: () => void; onError?: () => void; testID?: string }`. Behaviour: `objectPath === null` → render poster only. Else render poster + `Skeleton` shimmer, call `ensureClipCached`; on success render `expo-av <Video source={{uri}} isLooping shouldPlay isMuted resizeMode={ResizeMode.COVER} style={{width:'100%',height}} useNativeControls={false} />` and `onReady`; on any failure keep poster and `onError` (once). Unmount-safe (ignore late resolves). Pause on `AppState` background is not required.

`CameraSetupFigure` props `{ orientation: 'lying' | 'standing'; cameraAngle: 'side' | 'front' | 'front_45'; accent: string; ink: string; width: number }` — react-native-svg only (already a dependency): flat 3 px round-cap strokes, a simple figure (lying = on a bench line; standing), a phone rectangle placed side / front / 30–45° with a short dashed sight-line to the torso. No gradients, no glow, no text inside the SVG. Deterministic (no random).

`KeyPointsList` props `{ points: string[]; accent: string }` — rows with lucide `Check size={15} strokeWidth={2.6}` in `accent`, body text `Fonts.body` 15/1.5, hairline between rows; uses `useThemedStyles`.

Acceptance: `tsc` clean; `tutorialClips` tests green; components render with the props above (no runtime imports of `lib/supabase`).

### T4 · Vision engine: repScore, ordered findings, resetSet
**Worktree:** `D:\Dev\fitai-pro-app-wt\vision` · **Files:** new `lib/vision/repScore.ts`, `lib/vision/formDecision.ts`, `lib/vision/index.ts`, new `__tests__/repScore.test.ts`, new `__tests__/formDecisionOrder.test.ts`.

1. `lib/vision/repScore.ts`: move **verbatim** from `app/form-coach.tsx:253-353` — `REP_THRESHOLDS`, `REP_DEFAULT_TH`, `clamp01`, `scoreRep`, `toRepData`, `buildReport`, and the `RepData` / `SetReport` types they use (find their declarations in form-coach.tsx and move them too). Export all. Do **not** edit form-coach.tsx (T7 deletes the block and imports). Test: a small table of `(bottomDeg, tempoMs, symmetry, category)` → `{score, flaw}` recorded by running the ORIGINAL function once (copy numbers into the test as the oracle); `buildReport` on 0 and 3 reps.
2. `formDecision.ts`: in `update()`, return `findings` sorted by the existing private `outranks` (best first) — sort `confirmed` before mapping at the second return site; first return site already `[]`. Add a one-line comment on `FormVerdict.findings`: "ordered worst-first". Test: drive a `FormDecider` with two persistent findings of different severity and assert `findings[0]` is the higher severity once both are confirmed (use `lib/vision/__tests__/replay.ts` generators as reference for how to build frames; keep the test in `__tests__/`).
3. `index.ts`: add `resetSet(): void` on `VisionEngine` — resets machine + decider + lock + `lastT`, **keeps the calibrator**. Leave `reset()` unchanged. Docblock: why (calibration is body geometry, which does not change between sets; re-calibrating after every graded set flapped READY→CALIBRATING).

Acceptance: `tsc` clean; new tests green; `__tests__/repQuality.test.ts` and `__tests__/benchOrientation.test.ts` still green.

### T8 · Live-stage components
**Worktree:** `D:\Dev\fitai-pro-app-wt\livestage` · **Files:** `components/formcoach/CameraCoach.tsx`, `components/formcoach/FormReadout.tsx`, `components/formcoach/CalibrationOverlay.tsx`. All prop changes **additive/optional** — `app/form-coach.tsx` must compile unchanged against them.

- `FormReadout`: new optional `state?: 'awaiting' | 'tracking' | 'scored'` (default derives: `score != null ? 'scored' : 'awaiting'`), `repIndex?: number`, `debug?: boolean` (default false). Render: `awaiting` → eyebrow `FORM`, a dash, helper line `First rep sets your score` and a11y label saying so (never the "camera cannot see you" copy unless `advice` is set); `tracking` → `REP {repIndex} · Tracking ●` (● in `stage.success`), no numeral; `scored` → existing numeral + `REP {repIndex}` eyebrow. CONFIDENCE numeral and `n/17` render only when `debug`.
- `CameraCoach`: `quality` stays required; new optional `joints?: Partial<Record<'person'|'shoulders'|'elbows'|'wrists'|'hips'|'knees'|'ankles', 'high'|'medium'|'low'>>`, `variant?: 'checklist' | 'compact'` (default `'compact'` = today's chips). `checklist` renders header `SETTING UP`, tick rows for `person` + the required groups (from `category`, reuse `requiredGroups`), `Check` for high / `!` for medium / `×` for low, and exactly one instruction line (`quality.advice`). Keep the memo; `joints` is compared shallowly by tier values (custom `areEqual`).
- `CalibrationOverlay`: replace the 196 px `AnimatedRing` gauge with a mono label `CALIBRATING` + a thin 3 px progress bar (`progress` 0..1) + one line "Hold still for a moment". Keep props identical.

Acceptance: `tsc` clean across the repo (form-coach.tsx untouched compiles); visual sanity via a quick description of the rendered tree in the report.

---

## Wave 2 — after wave-1 branches merge into `feat/technique-flow`

### T6 · `app/technique.tsx` + callers
**Files:** new `app/technique.tsx`, `app/workout-session.tsx` (chip only, ~`:643-653`), `app/(tabs)/workouts.tsx` (`:102-123`, `:270-285`).

- Params `{ exerciseName: string; persona?: string; mode?: 'auto' | 'review' }`. Resolve `personaId = personaFromProgramId(persona).id` (accepts PersonaId or programId), `form = getExerciseForm(exerciseName)`, `key = getExerciseFormKey(exerciseName)`, `covered = hasVisionCoverage(exerciseName)`, `points = keyPointsFor(exerciseName)`.
- Gate on mount: `if (covered && !canAccess('ai_form_coach')) router.replace('/paywall?feature=ai_form_coach')`.
- Steps `'ready' | 'preview' | 'done' | 'setup'`; initial: `mode==='review'` → `'preview'`; else `fastPath` → `'ready'`; else `'preview'`. Render `Skeleton` until `loaded`.
- `preview`: `CanvasScreen tabBar={false}` → flat `Crown` (eyebrow `TECHNIQUE · STEP 1 OF 3`, uppercase exercise name, `onBack`) → `TechniquePlayer` (16:9, `objectPath = form?.tutorial ? clipObjectPath(form.id, form.tutorial.version) : null`, poster = `CameraSetupFigure` on a soft slab) → `Section "KEY POINTS"` + `KeyPointsList` → CTA bar: primary `WATCH TECHNIQUE` (or `CONTINUE` when no clip / clip failed) → `recordWatched` → `'done'`; secondary text `I KNOW THIS — SKIP` → `recordSkipped` → covered ? `'setup'` (first time) or handoff : `router.back()`. Track `tutorial_shown` on mount (`trigger`).
- `done`: title `READY TO CHECK YOUR FORM?`; primary `START FORM CHECK` (covered) or `DONE` (not covered → `router.back()`); secondary `WATCH AGAIN` → `'preview'`. Track `tutorial_completed`.
- `setup` (covered only, first time = `!entry?.setupSeen`, and always reachable from `ready` via "CAMERA SETUP"): eyebrow `STEP 3 OF 3`, title `SET UP YOUR CAMERA`, `CameraSetupFigure` (orientation `'lying'` for bench/incline ids, else standing; angle from `form.cameraAngle ?? 'side'`), `cameraNote`, six instruction rows (KeyPointsList), primary `CAMERA READY` → `useCameraPermission().requestPermission()` (react-native-vision-camera) → `markSetupSeen` → handoff; secondary `BACK`.
- `ready`: title = exercise name, one line "You've done this one before."; primary `START FORM CHECK` → handoff; secondary `VIEW TECHNIQUE` → `'preview'`; tertiary text `CAMERA SETUP` → `'setup'`; a small `Mark as known` toggle (`markKnown`).
- Handoff: `router.replace({ pathname: '/form-coach', params: { exerciseName, persona: personaId } })`.
- Callers: all three pushes → `pathname: '/technique'`, params `{ exerciseName, persona: <what they pass today> }`. Session chip label `Form` when `hasVisionCoverage(ex.name)` else `How-to`; never hidden.
- Design: existing tokens only (`useTheme/useThemedStyles`, persona accent via `personaAccent`, Plus Jakarta 800 uppercase titles, the pill CTA from `physique-checkin.tsx:148-162`). No gradients/glow.

Tests: `tsc`; manual flow list in spec §13.

### T7 · `app/form-coach.tsx` (single owner)
**File:** `app/form-coach.tsx` only. Forbidden zones (do not restructure): `:63-72`, `handlePose` body + deps `:604-771`, `frameProcessor :786-800`, render loop `:806-841`, `lastSpokenLineRef`/`voice.stop()` de-dupe `:560-566, 745-750`. Line numbers are from commit `79fd7a5`; re-anchor by content.

1. Delete `:253-353` (`REP_THRESHOLDS … buildReport`, plus the `RepData`/`SetReport` declarations moved by T4); `import { toRepData, buildReport, type RepData, type SetReport } from '@/lib/vision/repScore'`.
2. Score gate (screen): `lastRepScoreRef`, `repIndexRef`; on `res.completedRep` (`:752-757`) set both from `toRepData(res.completedRep, categoryRef.current)`. `FormReadout` receives `score = repCount > 0 ? lastRepScore : null`, `state = repCount === 0 ? 'awaiting' : (inRep ? 'tracking' : 'scored')` where `inRep` = engine phase not in `setup|idle|rest`, `repIndex`, `debug = debugVisible`.
3. Status pill (`:978-999`): `POSITION GOOD` when `canJudge && repCount === 0 && !calibrating` (first ~1.5 s after calibration completes, via a timestamp ref), then `READY`; standby sheet copy → "Start your set when you're ready".
4. Checklist: compute `jointTiers` at ~8 Hz inside `tickAnalysis` from `targetKptsRef.current` with `jointConfidenceTier` (groups: person = any of shoulders/hips high; shoulders 11/12; elbows 13/14; wrists 15/16; hips 23/24; knees 25/26; ankles 27/28 — group tier = min of the pair); store in a ref + publish with `analysisTick`. Pass `joints` + `variant="checklist"` to `CameraCoach` at the existing mount (`:1200-1202`), gate unchanged. Not-tracking keeps the existing sheet (`:1166-1179`), copy → "Step into frame — head, torso and both arms".
5. Top correction: `spokenRef: {finding, atMs} | null` set where `verdict.speak` is handled (`:745-750`); `topFinding = (spokenRef within 9000 ms) ? spokenRef.finding : verdict?.findings[0] ?? null`. Remove the praise sheet (`:1150-1156` + its comment block).
6. Report overlay (`:1360-1428`): rows `REP n  score  ✓ | ! flaw` from `setReport.data` (flaw text from the existing `FLAW_LABELS` if present, else the raw flaw); render the coach sentence built in `finishSet` (`:467-490`) in a `crown` block; when `engine.reps.length === 0` show "No complete reps were detected — a full rep is down and back up with the whole upper body in frame" instead of returning silently (`:473`); `track('form_check_set_graded', { exercise: categoryRef.current ?? 'unknown', reps, avg_score })`.
7. `finishSet` → `engine.resetSet()` instead of `engine.reset()` (T4).
8. Skeleton: `boneOpacity` high 0.32 / medium 0.16 (`:925-926`), joint fill 0.35 / 0.2 (`:1108`); `flaggedJoints` from `topFinding` only (`:904-912`); a bone takes the accent only when both endpoints are flagged (`:923-924`); flagged elements at 0.95.
9. Re-trigger: `curRepFindingsRef = new Set<string>()` filled from `verdict.findings.map(f => f.id)` per frame; on `completedRep` push `[...set]` to `recentRepsRef` (cap 4), clear; call `shouldRetrigger(recentRepsRef.current, getEntry(key), Date.now(), promptedThisSetRef.current)`; if it returns, `promptedThisSetRef = true`, `recordRetrigger(key)`, `track('technique_retrigger_shown', { exercise, check: checkId })`, show a sheet in `stageBottom`: "REVIEW TECHNIQUE — {label} in 3 of your last 4 reps" with `PressableScale` buttons `REVIEW NOW` → `router.push({ pathname: '/technique', params: { exerciseName, persona, mode: 'review' } })` and `CONTINUE SET` → dismiss. Reset all three refs in `finishSet`, the long-press reset (`:1223-1227`) and the category effect (`:528-540`); `loseTracking` clears only `curRepFindingsRef`.
10. Head: text button `Technique` (new `headTextBtn` style) next to flip (`:1031-1040`) → same push as REVIEW NOW.
11. New styles in `makeStyles` only. Refs, not state, for anything read inside `handlePose`/`tickAnalysis`.

Acceptance: `tsc` clean; jest green; report lists every edit with its final line numbers; manual device matrix in spec §13.

---

## Wave 3 — integrate
1. Merge `wt/technique-*` into `feat/technique-flow` (fast-forward/clean); run full jest + tsc + `eslint .` on the merged tree.
2. Spec-compliance + code-quality review of the merged diff.
3. WSL release build (`scripts/build-evulto-js.sh` from PowerShell), install on the Pixel, run the device matrix; R8 smoke on the video path (upload one test clip to `tutorial-clips` for that).
4. Merge to `master` when the device matrix passes.
