# FitAI Pro — Recovery-Adaptive Training, Biomechanics Form AI & Physique Analysis

**Date:** 2026-05-12  
**Status:** Approved  
**Sprints:** 1 (Recovery → Volume), 2 (Form AI upgrade), 3 (Physique Analysis)

---

## Overview

Three connected features that move FitAI Pro from a workout logger into a system that *sees* the user, adapts to their body, and coaches them in real time.

| Sprint | Feature | Core value |
|--------|---------|-----------|
| 1 | Recovery-adaptive volume | Workout auto-adjusts sets based on today's recovery score |
| 2 | Biomechanics form AI | Real joint-angle feedback + Claude coaching cues at 15fps |
| 3 | Physique analysis & tracking | E2E-encrypted body photos → AI weak-point + diet brief, tracked over time |

---

## Sprint 1 — Recovery-Adaptive Training

### Flow change

```
TRAIN tab → "START WORKOUT" → /workout-lobby → /workout-session
```

### New screen: `app/workout-lobby.tsx`

Sits between the TRAIN tab and the live workout session. The user reviews everything before the first rep.

**Sections:**

1. **Recovery card**
   - Calls `useTodayRecovery()` to fetch today's `recovery_checkins` row
   - If check-in exists: displays score (0–100), label (Poor / Low / Moderate / Good / Excellent), and volume pill: `−20% VOLUME` (amber) or `+20% VOLUME` (lime) or `NORMAL VOLUME` (neutral)
   - If no check-in: amber warning card — "No morning check-in. Tap to check in before you start." Button navigates to `recovery-checkin` screen with `returnTo=workout-lobby` param so it redirects back after submit
   - `volumeModifier` defaults to `1.0` if no check-in exists and user proceeds anyway

2. **Today's workout summary**
   - Exercise list with adjusted set counts pre-applied
   - `adjustedSets = Math.max(1, Math.round(originalSets * volumeModifier))`
   - Shows delta: "Barbell Squat — 3 → 2 sets (−20%)" in amber, "3 → 4 sets (+20%)" in lime
   - No change: shows normally

3. **Weight suggestions**
   - For each exercise, if `analyzeProgression()` returns a suggestion, show inline: `"Last: 80kg × 8 → Target: 82.5kg"`
   - Uses existing `useExerciseHistory` hook per exercise

4. **BEGIN WORKOUT button**
   - Passes `volumeModifier` and `programId` / `dayIndex` as route params to `workout-session`

### Changes to `app/workout-session.tsx`

- Reads `volumeModifier` from `useLocalSearchParams` (defaults to `1.0`)
- Applies modifier when initialising `sets` state:  
  `Array.from({ length: Math.max(1, Math.round(ex.sets * volumeModifier)) }, ...)`
- Header shows recovery pill: `RECOVERY 62 · VOL −20%` in the timer row when modifier ≠ 1.0

### Changes to `app/(tabs)/workouts.tsx`

- START WORKOUT button navigates to `/workout-lobby` instead of `/workout-session` directly

### Changes to `app/recovery-checkin.tsx`

- Reads optional `returnTo` param from route
- On successful submit, if `returnTo` is set, navigates back to that route instead of `router.back()`

---

## Sprint 2 — Biomechanics Form AI

### Camera upgrade

Replace `expo-camera` + `takePictureAsync` with `react-native-vision-camera` v3.

| | expo-camera | react-native-vision-camera |
|--|--|--|
| Frame capture | takePictureAsync → disk → read back | Direct pixel buffer in memory |
| Practical FPS | 5–8fps | 12–18fps |
| Disk I/O | Yes (bottleneck) | No |

Frame processor captures raw frame → `runOnJS` passes buffer to TF.js MoveNet Lightning on the JS thread. Frame interval set to `50ms`; the existing `processingRef` guard prevents overlapping frames so throughput self-limits to device capability.

**New packages:**
- `react-native-vision-camera` v3
- `react-native-worklets-core` (required by VisionCamera frame processors)

### `lib/poseAnalyzer.ts` upgrades

**1. Measured angles in messages**  
Every correction includes the actual value:  
`"Knee angle: 125° — target <90° for full depth"` not `"Go deeper"`

**2. Bilateral asymmetry detection**  
Runs on every frame after exercise-specific analysis:
- Shoulder height difference > 15px → `"Left shoulder is higher than right — even out your bar path"`
- Left vs right knee angle difference > 20° → `"Right knee caving more than left — push both out equally"`

**3. Velocity cue (bar speed)**  
Track wrist Y-position across last 5 frames. Compute pixels-per-frame descent rate.  
On bench press descent, if rate is too fast (> threshold): `"Lower the bar slower — aim for 2–3 seconds down"`

**4. New exercise analyzers**  
Add: Romanian deadlift, barbell row, lat pulldown, bicep curl, tricep pushdown, lunge, hip thrust.  
Each follows the same pattern as existing analyzers: compute 2–3 key angles, check bilateral symmetry, return `PoseCorrection[]`.

### Claude coaching cue layer

**Trigger:** When any `severity: 'error'` correction fires and cooldown has elapsed.

**Cooldown:** 15 seconds between Claude calls (enforced via `useRef` timestamp).

**Data sent to `form-feedback` edge function:**
```json
{
  "exerciseName": "Barbell Back Squat",
  "persona": "cbum",
  "detectedIssues": ["knee_valgus_left"],
  "angles": {
    "knee_angle_left": 145,
    "knee_angle_right": 138,
    "torso_lean": 42,
    "hip_depth": 112
  }
}
```

**Response shown as:**
```
✦ CBUM SAYS
"Your knees are caving hard bro. Think about pushing the floor apart with your feet — 
drive those knees out over your pinky toes."
```

**Fade-out:** If no error correction fires for 5 consecutive seconds, Claude cue fades out.

### `app/form-coach.tsx` changes

- Accepts `persona` route param (passed from workout session's Form button)
- Replaces `CameraView` from `expo-camera` with `Camera` from `react-native-vision-camera`
- New `useRef`: `lastClaudeCallAt` (cooldown tracker)
- New state: `claudeCue: string | null`
- New state: `wristYHistory: number[]` (last 5 frames for velocity detection)
- Frame interval: `50ms` (was `500ms`)

---

## Sprint 3 — Physique Analysis & Progress Tracking

### Guided Camera Capture: `app/physique-capture.tsx`

3-shot guided flow: **front → side → back**

**Per-shot checks before capture is allowed:**
1. **Distance** — MoveNet keypoints must span 40–80% of frame height (too close / too far warning)
2. **Lighting** — average frame brightness must be > 80/255 (too dark warning)
3. **Posture** — nose, shoulders, and hips must be vertically aligned within tolerance (not twisted)

Shows semi-transparent silhouette overlay. User aligns to it. All 3 checks pass → capture button activates. After all 3 shots, preview screen shows them together before confirming.

**Entry points:**
- Onboarding `step2-stats` — optional "Add starting photo" after stats are entered
- Progress tab → "ADD CHECK-IN" button in the PHYSIQUE section

### End-to-End Encryption

Photos never leave the device unencrypted.

**Key management:**
1. On first physique capture, generate a user-specific AES-256 key
2. Store key in `expo-secure-store` under key `physique_enc_key` (device-only, never sent to server)
3. Encrypt each photo's byte array on-device before upload
4. Upload ciphertext to Supabase Storage bucket `physique-photos` (RLS: user can only access own objects)
5. To view: download ciphertext → decrypt locally using key from SecureStore

**Claude never receives raw pixel data.** Instead, `physique-capture.tsx` runs MoveNet on each photo after capture and extracts:
- Silhouette proportions per muscle group (shoulders, chest, back, arms, legs — rated 1–5 based on visible width relative to frame)
- Waist-to-shoulder ratio
- Posture notes (forward head, shoulder elevation asymmetry)

This description is what gets sent to Claude — the photos stay on device.

**User warning (shown once):** "If you lose this device without a backup, your physique photos cannot be recovered. They are encrypted with a key stored only on this device."

### Edge function: `supabase/functions/physique-analysis/index.ts`

**Input:**
```json
{
  "goal": "build_muscle",
  "programmeId": "cbum_evolved",
  "muscleProminence": { "shoulders": 3, "chest": 4, "back": 2, "arms": 3, "legs": 2 },
  "waistShoulderRatio": 0.74,
  "measurements": { "chest_cm": 102, "waist_cm": 84, "arms_cm": 38 },
  "previousAnalysis": { ... } // null on first check-in
}
```

**Output (structured JSON):**
```json
{
  "weakPoints": ["rear delts", "hamstrings", "upper back"],
  "bodyFatEstimate": "16–19%",
  "programmeNote": "CBum Evolved suits your goal. Prioritise pulling movements to bring up your back.",
  "dietAdjustment": "At estimated 17% body fat on a muscle-building goal, a moderate surplus of 200–300 kcal is optimal. Prioritise protein at 2.2g/kg.",
  "top3Focus": ["rear delts", "hamstrings", "upper back"],
  "progressionNote": null // populated on subsequent check-ins
}
```

### New database table: `physique_checkins`

```sql
CREATE TABLE physique_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  checkin_date DATE NOT NULL,
  encrypted_front_url TEXT,
  encrypted_side_url TEXT,
  encrypted_back_url TEXT,
  chest_cm NUMERIC(5,1),
  waist_cm NUMERIC(5,1),
  hips_cm NUMERIC(5,1),
  left_arm_cm NUMERIC(5,1),
  right_arm_cm NUMERIC(5,1),
  left_thigh_cm NUMERIC(5,1),
  right_thigh_cm NUMERIC(5,1),
  ai_analysis JSONB,
  muscle_prominence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, checkin_date)
);

ALTER TABLE physique_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "physique_own" ON physique_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Progress tab additions (`app/(tabs)/progress.tsx`)

**PHYSIQUE section** (inserted above weekly volume chart):

1. **Photo timeline** — horizontal scroll of check-in thumbnails (decrypted on view). Tap any two to compare side-by-side. Thumbnails show the date label and waist measurement if entered.

2. **Measurements chart** — line chart of waist, chest, arm over time (reuses `VolumeChart` pattern).

3. **AI PHYSIQUE BRIEF card** — shows latest `ai_analysis` with weak points, body fat estimate, top 3 focus areas, and diet note. On subsequent check-ins, shows the progression note comparing current vs previous.

4. **ADD CHECK-IN button** — navigates to `physique-capture.tsx`.

---

## New files summary

| File | Purpose |
|------|---------|
| `app/workout-lobby.tsx` | Pre-workout review screen |
| `app/physique-capture.tsx` | Guided 3-shot camera capture |
| `supabase/functions/physique-analysis/index.ts` | Claude physique analysis edge function |
| `supabase/migrations/005_physique.sql` | physique_checkins table + RLS |
| `lib/physiqueEncryption.ts` | AES-256 encrypt/decrypt helpers using Web Crypto API (via `react-native-quick-crypto` polyfill) |
| `lib/physiqueAnalyzer.ts` | On-device silhouette extraction (MoveNet → muscle prominence scores) |
| `hooks/usePhysiqueCheckins.ts` | Query + mutation hooks for physique_checkins |

## Modified files summary

| File | Change |
|------|--------|
| `app/(tabs)/workouts.tsx` | START WORKOUT → /workout-lobby |
| `app/(tabs)/progress.tsx` | Add PHYSIQUE section |
| `app/workout-session.tsx` | Read volumeModifier param, apply to sets, show recovery pill |
| `app/recovery-checkin.tsx` | Handle returnTo param for post-check-in redirect |
| `app/(onboarding)/step2-stats.tsx` | Add optional physique photo step |
| `app/form-coach.tsx` | VisionCamera, 50ms interval, Claude cue, bilateral analysis |
| `lib/poseAnalyzer.ts` | Measured angles, bilateral checks, velocity cue, 7 new exercises |
| `supabase/functions/form-feedback/index.ts` | Accept structured angles + persona |

---

## Out of scope (future)

- Native TFLite for true 20fps+ (current: 12–18fps via VisionCamera)
- Apple Health / Google Fit wearable integration
- Community anonymised lifting statistics
- iCloud / Google Drive backup for encryption keys
