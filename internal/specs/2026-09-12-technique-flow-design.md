# Exercise Technique → Camera Setup → Form Check — Design

**Date:** 2026-09-12
**Status:** approved for implementation (owner decisions recorded below)
**Owner decisions:** keep the app's existing design language (no palette/font change); ship the clip *placeholder* first, clips are added later by uploading files.

## 1. Goal

Tapping an exercise no longer drops the user straight into the camera. It opens a short, skippable technique card, then a camera-setup card, then Form Check — and Form Check only shows a score after a complete, valid rep. Learn → Prepare → Perform → Feedback, as one connected system.

Fast for experienced lifters: once the app knows you know a lift, it's two taps from the Form chip to the camera.

## 2. What exists today (verified against the code, 2026-09-11)

| Area | Today | Evidence |
|---|---|---|
| Entry points | Three places push `/form-coach` directly | `app/(tabs)/workouts.tsx:111-117, 277-283`; `app/workout-session.tsx:649` |
| Technique / setup screens | none; demos are external YouTube links | `lib/exerciseDemoUrls.ts` |
| Live validation | `CameraCoach` shows per-joint-group chips + one advice line, only after tracking starts | `components/formcoach/CameraCoach.tsx:56-165`, mounted `form-coach.tsx:1200-1202` |
| Score before rep 1 | shows **100** — `FormDecider.updateScore` yields 100 when nothing is confirmed | `lib/vision/formDecision.ts:329-340` |
| Correction shown | first finding, not the worst | `form-coach.tsx:891` |
| Per-rep scoring | `scoreRep/toRepData/buildReport` exist; report shows colour bars only; coach sentence spoken, never rendered; 0-rep finish is silent; `form_check_set_graded` never fired | `form-coach.tsx:253-353, 467-490, 1360-1428` |
| Skeleton | bones 0.9 opacity; all findings' joints highlighted | `form-coach.tsx:925-926, 904-912, 1089, 1108` |
| Content | 14 `ExerciseForm` entries (9 fields: name, keywords, category, targetMuscles, angleChecks, checkpoints, coachCues, commonMistakes, breathingCue); no id/video/camera angle/key points | `constants/exerciseFormLibrary.ts:35-45` |
| Memory / re-trigger | none | — |
| Video playback | `expo-av <Video>` already compiled in (Legend-only `video-review`) | `app/video-review.tsx:19, 286-293` |
| OTA | none — every JS change ships via the WSL release build + R8 smoke | `AndroidManifest.xml` `expo.modules.updates.ENABLED=false` |

## 3. User flow

```
Form chip (session) / FORM CHECK (Train tab)
 └─ /technique  ── paywall gate here (canAccess('ai_form_coach')), not in form-coach
      first time  ► PREVIEW   clip or poster · KEY POINTS · [WATCH TECHNIQUE] [I KNOW THIS — SKIP]
                  ► DONE      READY TO CHECK YOUR FORM? · [START FORM CHECK] [WATCH AGAIN]
                  ► SETUP     SET UP YOUR CAMERA · figure · 6 rows · [CAMERA READY] [BACK]
      known       ► READY     [START FORM CHECK] · VIEW TECHNIQUE · CAMERA SETUP
      no engine profile ► same PREVIEW, CTA = [DONE] (no camera claim)
 └─ router.replace → /form-coach   (stack: caller → form-coach; back returns to the workout)
      SETTING UP  ✓ Person ✓ Shoulders ✓ Elbows ✓ Wrists ✓ Hips  + one instruction
      POSITION GOOD → READY  "Start your set when you're ready"   (FORM: —, explained)
      REP 1 · Tracking ●  →  REP 1  FORM 89  ✓ ✓ !   →  …  →  SET FORM 89 + one coach sentence
      same fault in 3 of last 4 reps → "REVIEW TECHNIQUE" [REVIEW NOW] [CONTINUE SET]  (once per set)
```

**Every exercise opens Technique**, not only camera-covered ones. Gating the session chip on coverage would remove it from Rack Pull (default program Day-1 opener), Seated Dumbbell Press and Leg Press. Key points fall back to the exercise's existing `tips`. **START FORM CHECK appears only when the engine has an honest profile** (`hasVisionCoverage`), which is the spec's `form_check_available`.

## 4. Routes and navigation

- **`app/technique.tsx`** — root-level Stack sibling of `form-coach` (never under `(tabs)/`: a REPLACE from inside the tab group would swap out the whole tab navigator). In-file step machine `'ready' | 'preview' | 'done' | 'setup'`, same pattern as `app/physique-checkin.tsx`.
- Params: `{ exerciseName: string; persona?: string; mode?: 'auto' | 'review'; }`. `mode='review'` (opened from inside Form Check) shows PREVIEW only and ends with `router.back()`.
- Handoff: `router.replace({ pathname: '/form-coach', params: { exerciseName, persona } })`. Precedent: `workout-lobby.tsx:123-126`.
- Paywall gate moves **up** into technique: `if (!canAccess('ai_form_coach')) router.replace('/paywall?feature=ai_form_coach')` on mount. Today form-coach queues that replace and then requests camera permission in the same commit, so a free user without permission gets the OS camera prompt on top of the paywall (`form-coach.tsx:492-505`). form-coach keeps its own gate (harmless once access exists). For exercises with no engine profile, technique does not gate (there is nothing paid on that path).
- Callers: `workout-session.tsx:649`, `workouts.tsx:111-117, 277-283` → `pathname: '/technique'`. Session chip label: "Form" when covered, "How-to" when not.
- **Persona param is normalised at the technique boundary.** Callers pass either a `PersonaId` (`'cbum'|'arnold'|'nippard'|'ct_fletcher'|'dr_mike'`) or a programId (`'ct_strength'`, `'dr_mike_mav'`…). form-coach's local matcher drops `'ct_strength'` to cbum (`form-coach.tsx:153-160`); technique resolves once via `personaFromProgramId(...).id` and forwards the canonical `PersonaId`.
- Workout session survives: it stays mounted under the stack (native-stack, no freeze) and checkpoints to `lib/activeSession.ts` anyway. Technique/form-coach are always *pushed* from the session, never replaced over it.

## 5. Content package

Backward-compatible optional fields on `ExerciseForm` (`constants/exerciseFormLibrary.ts:35-45`). Only two importers exist (`workouts.tsx`, `form-coach.tsx`) and neither enumerates keys, so optional additions compile everywhere. **Do not add a new value to `ExerciseForm['category']`** — `CATEGORY_TO_VISION` is a `Record` over that union.

```ts
id: string;                                  // stable slug = const name ('bench_press'); memory + clip key
keyPoints?: string[];                        // 3–5 imperative lines; fallback checkpoints[].description, then library tips
cameraAngle?: 'side' | 'front' | 'front_45';
cameraNote?: string;                         // "Phone 30–45° from your side, at bench height"
tutorial?: { version: number; durationSec: number | null } | null;  // null = no clip yet
detectedFaults?: Array<{ checkId: string; label: string }>;          // checkId ∈ biomechanics PROFILES only
visionCategory?: VisionCategory | null;      // per-entry override; null = no live analysis
```

- `visionCategoryFor(form)` becomes `form.visionCategory ?? CATEGORY_TO_VISION[form.category]`. Set `null` on **Lateral Raise** and **Leg Curl** (the `curl` profile is elbow-driven and can never count their reps — today they open a camera that stays silent), `'lunge'` on the **Lunge** entry (the engine's lunge profile is unreachable dead code today; lunges are judged by the squat profile, whose depth check is meaningless with one knee down).
- `requiredLandmarksFor(form) = getProfile(visionCategoryFor(form)).requiredJoints` — no duplicated landmark lists.
- **Detected faults are the 23 check ids** in `lib/vision/biomechanics.ts` (press 4, curl 3, squat 4, deadlift 4, pull 4, lunge 4) plus rep-level `shallow | rushed | grindy | uneven`. Everything else in `commonMistakes` is a *coaching note* (shown under KEY POINTS), never labelled "detected". A test asserts every `detectedFaults.checkId` exists in `PROFILES`.
- **Matcher fixes** (`getExerciseForm`, `:494-510`), each with a test:
  - exact-name pass first; normalise `-`/`_` → space (`'Step-Up'` currently matches nothing);
  - `'romanian deadlift'` keyword on the RDL entry (today ties with `'deadlift'` and loses on array order);
  - `'incline curl'`, `'incline dumbbell curl'` → bicep_curl (today → incline **press**);
  - `'seated barbell press'`, `'seated dumbbell press'`, `'dumbbell press'` → overhead_press (today Seated Barbell Press → bench; Seated/Flat Dumbbell Press match nothing);
  - `'incline barbell press'` → the incline entry (today → flat bench);
  - `'overhead tricep extension'` must **not** land on Tricep Pushdown (the curl profile's `elbow_drift` reads an overhead elbow as maximal drift → false critical); give it `visionCategory: null` via its own minimal entry or exclude the keyword;
  - coach-cue ids: library uses `'ct'|'drmike'`, app uses `'ct_fletcher'|'dr_mike'` → CT Fletcher and Dr Mike users always receive CBUM's cue (`getCoachCue` falls back to `coachCues[0]`). Rename the library ids to the canonical `PersonaId` and type the parameter.
- Content authoring: `keyPoints`, `cameraAngle`, `cameraNote` for all 14 entries, drawn from the existing checkpoint/cue text (draft table in the critique notes). No new biomechanics claims.

## 6. Clips — remote, download-once, placeholder-first

- **Host:** Supabase Storage bucket `tutorial-clips`, public read, no client write. Created in the dashboard (migrations cannot create buckets; `005_physique.sql:67-69` documents the same for `physique-photos`). Policy: `create policy "tutorial_clips_public_read" on storage.objects for select to public using (bucket_id = 'tutorial-clips');` — no insert/update/delete policies.
- **URL:** `supabase.storage.from('tutorial-clips').getPublicUrl(\`${form.id}_v${tutorial.version}.mp4\`)` from the existing client. No new env var (EXPO_PUBLIC_* is baked at build time and there is no `.env.example`).
- **Versioned filenames** (`bench_press_v1.mp4`) because public objects are CDN-cached; overwriting in place serves stale bytes.
- **Player (`TechniquePlayer`):** download once to `cacheDirectory` via `expo-file-system/legacy` `downloadAsync`, then `expo-av <Video source={{uri: file://…}} isLooping shouldPlay isMuted resizeMode="cover">`. Rationale: expo-av's ExoPlayer has no cache and repeat-mode re-fetches from byte 0 — a 2 MB clip looping every 12 s is ~10 MB/min on cellular. Local file = one fetch per exercise per device + offline replay + hitch-free loop.
- **Placeholder / degradation:** if `tutorial` is null, the download errors, or 8 s pass → poster state (illustrated figure + KEY POINTS), CTA reads **CONTINUE** instead of WATCH TECHNIQUE. No "coming soon" copy. The poster is also the loading state.
- **Encoding recipe** (owner runs on any phone footage):
  `ffmpeg -i in.mov -an -vf "scale=-2:720,fps=30" -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p -crf 26 -maxrate 1.2M -bufsize 2.4M -g 60 -keyint_min 60 -sc_threshold 0 -movflags +faststart out.mp4`
  10–12 s, trimmed so the last frame matches the first; target ≤ 1.8 MB.
- **Deprecation:** expo-av `Video` is deprecated in SDK 54 but functional. All video code lives in one component so the swap to `expo-video` (a native change) is cheap when the SDK bump forces it.

## 7. Persistence and re-trigger

- `lib/tutorialMemory.ts` — AsyncStorage key `tutorial_memory:v1` (versioned JSON, `coerce()` on read, in-memory cache + `ensureLoaded()`; precedent `lib/activeSession.ts`, `lib/streakFreezes.ts`). Device-scoped like every other pref.

```ts
interface TutorialMemoryEntry { watched: number; skipped: number; lastSeenAt: number; knowsIt: boolean; setupSeen: boolean; lastRetriggerAt?: number }
type TutorialMemory = Record<string /* form.id */, TutorialMemoryEntry>;
shouldShowFastPath(e) = !!e && (e.knowsIt || e.watched >= 1 || e.skipped >= 2)
```

- `hooks/useTutorialMemory.ts` hydrates once (pattern `hooks/useVoiceCues.ts`); technique renders a `Skeleton` for the frame before `loaded`, never the preview.
- **Smart re-trigger** (pure rule, tested): screen-side refs in form-coach — `curRepFindingsRef: Set<checkId>` filled from `verdict.findings` per frame, pushed to `recentRepsRef` (cap 4) on `completedRep`. Prompt when a check id appears in ≥ 3 of the last 4 completed reps, not yet prompted this set, and `now − lastRetriggerAt > 10 min` for this exercise. Refs, not state (must not widen `handlePose` deps). Reset in `finishSet`, the long-press reset and the category effect; `loseTracking` clears only the current-rep set (`engine.abandon()` keeps banked reps).
- Analytics (`lib/analytics.ts` closed union; sanitiser drops keys matching `name|note|…`, strings > 40 chars, nulls): add `tutorial_shown | tutorial_skipped | tutorial_completed | technique_retrigger_shown`, props `{ exercise, trigger: 'first_time'|'smart'|'manual', watched_count }`. Wire the already-declared `form_check_set_graded` in `finishSet`.

## 8. Form Check screen changes (`app/form-coach.tsx`, single owner)

Additive edits only. **Do not touch:** module-scope `VisionCameraProxy.initFrameProcessorPlugin` and `'worklet'` directives (`:63-72`), `handlePose` and its deps (`:604-771`), `frameProcessor` (`:786-800`), the render loop + stale watchdog (`:806-841`), the `lastSpokenLineRef` / `voice.stop()` de-dupe (`:560-566, 745-750`). New styles go in `makeStyles`.

- **Score gate in the screen, not the engine.** `verdict.score == null` already means "engine refused to judge" (`judged`, `:902`) and drives NO CLEAR VIEW; nulling it for "no rep yet" would corrupt that. `FormReadout` receives `score = repCount > 0 ? lastRepScore : null` and a new `state: 'awaiting' | 'tracking' | 'scored'` so the dash is explained and the a11y label is truthful (today a null score with null advice claims the camera cannot see you).
- Move `scoreRep/REP_THRESHOLDS/toRepData/buildReport` (`:253-353`, incl. `clamp01 :275`) to `lib/vision/repScore.ts` (pure, tested); form-coach imports it. Nothing else uses them.
- Status pill (`:978-999`): `POSITION GOOD` when `canJudge && repCount === 0 && !calibrating`; `READY` once calibrated; standby copy → "Start your set when you're ready". Known: `finishSet → engine.reset()` also resets the calibrator, so READY flaps to CALIBRATING between sets — keep calibration across sets (`VisionEngine.resetSet()` that resets the machine but not the calibrator) rather than paper over it in copy.
- Landmark checklist: `CameraCoach` stays gated on `quality != null` (when not tracking, `quality` and `displayKpts` are both null). Add optional `joints?: Record<number, 'high'|'medium'|'low'>` computed at ~8 Hz from `targetKptsRef` in `tickAnalysis` (not from `displayKpts`, which changes every 33 ms and would defeat the memo), rendering Person/Shoulders/Elbows/Wrists/Hips tick rows under "SETTING UP" with exactly one instruction line. Not-tracking keeps the existing "Step into frame" sheet. Never mount it when `canJudge && !judged` (it would print "Camera locked").
- Top correction: `FormDecider.update()` sorts `findings` by the existing private `outranks` (`formDecision.ts:386-390`) at **both** return sites (`:213-219, :235-243`). `verdict.speak` is non-null for one frame only — the screen latches `{finding, atMs}` and prefers it inside the decider's 9 s window, else `findings[0]`. Remove the mid-set praise sheet (`:1150-1156`; praise remains spoken).
- `FormReadout` collapses to `REP n · Tracking ●` during a set; CONFIDENCE numeral and `n/17` move behind the existing long-press debug toggle.
- Report overlay (`:1360-1428`): rows `REP 1  89  ✓` / `REP 3  71  ! shallow` from `setReport.data`; render the coach sentence built in `finishSet` (`:467-490`); 0-rep finish shows guidance instead of returning silently (`:473`); `track('form_check_set_graded', { exercise, reps, avg_score })` (flat scalar props).
- Skeleton (`:925-926, 1089, 1108, 904-912, 923-924`): keep the per-tier encoding but scale it — bones 0.32 / 0.16, joints 0.35 / 0.2; flagged chain stays at full opacity; `flaggedJoints` from the displayed finding only; a bone is coloured only when **both** endpoints are flagged.
- Head: a "Technique" text button next to flip (`:1031-1040`; `headBtn` is a 38 px circle, so a new text style) → `router.push({ pathname: '/technique', params: { exerciseName, persona, mode: 'review' } })`. `typedRoutes` is on: the route must exist before this compiles.

## 9. Presentational components (`components/formcoach/`)

- `TechniquePlayer` — props `{ clipPath: string | null; poster: ReactNode; onReady?; onError? }`; owns download-then-play, timeout, poster fallback.
- `CameraSetupFigure` — react-native-svg body-on-bench / standing figure + phone at the recommended angle; parameterised by `cameraAngle` and `orientation: 'lying' | 'standing'`; flat 3 px round-cap strokes in `t.text` ink, persona accent only on the phone. No gradients, no glow.
- `KeyPointsList` — lucide `Check` tick rows (as `paywall.tsx:227-232`).
- Existing to reuse: `CanvasScreen tabBar={false}`, `Crown` (flat, no `accent` glow), `Section/Hairline`, `PressableScale`, `Skeleton`, the pill CTA from `physique-checkin.tsx:148-162`, Plus Jakarta 800 uppercase titles, `useThemedStyles`, `TOKENS.dark` pinned on the camera stage.

## 10. Design language (owner decision: unchanged)

Existing tokens only: white / cool-tinted backgrounds, ink `#0B1410`, per-persona accent on CTAs, Plus Jakarta Sans 800 uppercase headings, dark Crown blocks. No coral, no new font, no gradients or glow on the new screens; the calibration ring gauge is replaced by the checklist.

## 11. Scoring rule (spec §15)

A number is shown only when: exercise has an engine profile · required landmarks visible (`canJudge`) · calibration complete · at least one rep accepted by the state machine (full cycle + min ROM + shape gate). Otherwise the readout shows a dash with a reason. Camera-angle validity cannot be measured by the engine today; it is enforced by the setup instructions only — recorded as a known limitation, not a claim.

## 12. Out of scope (deliberately)

LEARN MORE (hidden until content exists); server-synced memory; a view-angle classifier; migrating to `expo-video`; removing unused deps (`@shopify/react-native-skia`, `victory-native`, the 6.4 MB unreferenced `pose_landmark_full.tflite`) — separate owner call, needs a native build.

## 13. Testing

- Jest (`__tests__/`): matcher table over all 95 exercise names; `detectedFaults` ⊆ `PROFILES`; `visionCategory` override; `repScore` parity with the old inline logic; tutorial memory round-trip / corrupt JSON / fast-path thresholds; re-trigger rule (3-of-4, cooldown, once per set); `FormDecider` findings ordering.
- Device (release/R8 APK, per repo rule): first-run flow; fast path in 2 taps; clip absent → poster; one clip uploaded → plays and loops from cache; airplane mode replay; score dash until rep 1; single correction; report rows + sentence; re-trigger after 3 flawed reps; free user → paywall from technique with no camera prompt; back from camera lands on the session with sets intact; dark scheme.

## 14. Risks

- `form-coach.tsx` is the most fragile file in the app (worklets, RunOnJS deps, voice de-dupe). Single owner, additive edits, device matrix above.
- Every change here still needs the WSL release build + R8 runtime smoke (no OTA). The `expo-av` video path has only ever been reachable behind the Legend tier and is unproven under R8 on a real device until this smoke.
- Matcher fixes change which content/profile existing users get — shipped with tests, acceptable pre-launch.
- Memory is keyed by `form.id`; renaming an exercise re-homes its memory. Acceptable pre-launch.
- Bandwidth once clips exist: ~30 MB per fully-engaged device. Check the Supabase plan's egress before uploading clips.
