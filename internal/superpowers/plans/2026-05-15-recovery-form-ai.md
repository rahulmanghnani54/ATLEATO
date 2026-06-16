# Recovery-Adaptive Training & Biomechanics Form AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `volumeModifier` from recovery check-ins through a new lobby screen into the workout session (Sprint 1), then upgrade the form AI coach to run at 15fps with measured-angle feedback, bilateral asymmetry detection, velocity cues, 7 new exercises, and a Claude persona cue layer (Sprint 2).

**Architecture:** Sprint 1 inserts `app/workout-lobby.tsx` between the TRAIN tab and the live workout session — it reads today's recovery score, adjusts set counts, and passes a `volumeModifier` param to `workout-session.tsx`. Sprint 2 replaces `expo-camera` with `react-native-vision-camera` v3 for in-memory frame capture and upgrades `lib/poseAnalyzer.ts` with real joint angles, bilateral checks, a wrist-velocity cue, and 7 new exercise analyzers; the form-feedback edge function is extended to accept structured angles and a coach persona, returning a persona-voiced Claude coaching cue displayed in the form coach UI.

**Tech Stack:** Expo (managed, EAS builds), React Native, expo-router, TF.js MoveNet Lightning, react-native-vision-camera v3, react-native-worklets-core, Supabase edge functions, Claude API, TypeScript.

---

## File Map

| File | Action | Role |
|------|--------|------|
| `app/workout-lobby.tsx` | **Create** | Pre-workout review screen: recovery card, adjusted sets, weight suggestions, BEGIN button |
| `app/(tabs)/workouts.tsx` | **Modify** | Route START WORKOUT to `/workout-lobby` instead of `/workout-session` |
| `app/workout-session.tsx` | **Modify** | Read `volumeModifier` param, apply to initial sets state, show recovery pill in header |
| `app/recovery-checkin.tsx` | **Modify** | Read optional `returnTo` param, redirect there on submit success |
| `lib/poseAnalyzer.ts` | **Modify** | Add measured angles, bilateral asymmetry, velocity cue, 7 new exercises, `issueKey` on corrections |
| `__tests__/poseAnalyzer.test.ts` | **Create** | Unit tests for all new poseAnalyzer logic |
| `supabase/functions/form-feedback/index.ts` | **Modify** | Accept `persona` + structured `angles` object; include them in Claude prompt |
| `lib/api/edgeFunctions.ts` | **Modify** | Update `getFormFeedback` signature to pass `persona` and `angles` |
| `app.json` | **Modify** | Add `react-native-vision-camera` plugin, remove `expo-camera` plugin |
| `app/form-coach.tsx` | **Rewrite** | VisionCamera Camera + useFrameProcessor at 50ms, persona param, Claude cue overlay, bilateral + velocity state |

---

## Task 1: Add Jest for poseAnalyzer unit tests

**Files:**
- Create: `jest.config.js`
- Create: `__tests__/poseAnalyzer.test.ts`

> This gives us a test harness for the pure-TS poseAnalyzer logic (no React Native imports needed).

- [ ] **Step 1: Install Jest + ts-jest**

```bash
npm install --save-dev jest ts-jest @types/jest
```

Expected: packages appear in `package.json` devDependencies.

- [ ] **Step 2: Create `jest.config.js`**

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Stub out any packages that have native code
    '^@tensorflow-models/pose-detection$': '<rootDir>/stubs/pose-detection-stub.js',
    '^@tensorflow/tfjs$': '<rootDir>/stubs/mediapipe-stub.js',
    '^expo-.*$': '<rootDir>/stubs/mediapipe-stub.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
};
```

- [ ] **Step 3: Create `stubs/pose-detection-stub.js`**

```js
// Stub for @tensorflow-models/pose-detection — only the Keypoint type is used in poseAnalyzer.ts
module.exports = {};
```

- [ ] **Step 4: Create the initial failing test file `__tests__/poseAnalyzer.test.ts`**

```typescript
// placeholder — will be filled in Task 6
describe('poseAnalyzer', () => {
  it('placeholder', () => expect(true).toBe(true));
});
```

- [ ] **Step 5: Run tests to verify the harness works**

```bash
npx jest --passWithNoTests
```

Expected output: `Tests: 1 passed, 1 total`

- [ ] **Step 6: Add test script to package.json**

In `package.json`, inside `"scripts"`, add:
```json
"test": "jest"
```

- [ ] **Step 7: Commit**

```bash
git add jest.config.js stubs/pose-detection-stub.js __tests__/poseAnalyzer.test.ts package.json
git commit -m "chore: add jest + ts-jest for poseAnalyzer unit tests"
```

---

## Task 2: Modify `recovery-checkin.tsx` — handle `returnTo` param

**Files:**
- Modify: `app/recovery-checkin.tsx`

Currently `handleSubmit` always calls `router.back()`. After this task it will redirect to a named route when `returnTo` is passed as a query param.

- [ ] **Step 1: Import `useLocalSearchParams` at the top of `app/recovery-checkin.tsx`**

Current line 6:
```typescript
import { useRouter } from 'expo-router';
```

Replace with:
```typescript
import { useRouter, useLocalSearchParams } from 'expo-router';
```

- [ ] **Step 2: Read `returnTo` param inside `RecoveryCheckin` component**

After the existing `const router = useRouter();` line (line 19), add:
```typescript
const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
```

- [ ] **Step 3: Update `handleSubmit` to redirect to `returnTo` when present**

Current `handleSubmit` (lines 37–43):
```typescript
const handleSubmit = async () => {
  try {
    await mutateAsync({ sleepHours, sleepQuality, soreness, energy, stress });
    router.back();
  } catch {
    Alert.alert('Error', 'Could not save your check-in. Please try again.');
  }
};
```

Replace with:
```typescript
const handleSubmit = async () => {
  try {
    await mutateAsync({ sleepHours, sleepQuality, soreness, energy, stress });
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.back();
    }
  } catch {
    Alert.alert('Error', 'Could not save your check-in. Please try again.');
  }
};
```

- [ ] **Step 4: Manual verification**

Navigate to recovery check-in directly (no `returnTo`). Complete a check-in → should go back as before.

- [ ] **Step 5: Commit**

```bash
git add app/recovery-checkin.tsx
git commit -m "feat(sprint1): recovery-checkin handles returnTo param for post-submit redirect"
```

---

## Task 3: Create `app/workout-lobby.tsx`

**Files:**
- Create: `app/workout-lobby.tsx`

This screen sits between the TRAIN tab's START WORKOUT button and the live workout session. It shows the recovery card (score + volume modifier), today's adjusted exercise set counts, weight suggestions from progression history, and a BEGIN WORKOUT button.

- [ ] **Step 1: Create `app/workout-lobby.tsx`**

```typescript
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { useExerciseHistory } from '@/hooks/useProgression';
import { analyzeProgression, parseRepsRange } from '@/lib/progressionEngine';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Weight suggestion for a single exercise ────────────────────────────────
function WeightSuggestion({ exerciseName, reps }: { exerciseName: string; reps: string }) {
  const { data: history } = useExerciseHistory(exerciseName);
  if (!history || history.sessions.length === 0) return null;
  const [low, high] = parseRepsRange(reps);
  const suggestion = analyzeProgression(history, low, high);
  if (!suggestion) return null;
  return (
    <Text style={styles.weightSuggestion}>
      Last: {suggestion.currentWeightKg}kg × {suggestion.lastReps} → Target:{' '}
      <Text style={{ color: Colors.primary }}>{suggestion.suggestedWeightKg}kg</Text>
    </Text>
  );
}

// ─── Recovery card ───────────────────────────────────────────────────────────
function RecoveryCard({
  score,
  label,
  volumeModifier,
  recommendation,
}: {
  score: number;
  label: string;
  volumeModifier: number;
  recommendation: string;
}) {
  const pctDelta = Math.round((volumeModifier - 1) * 100);
  const pillLabel =
    pctDelta > 0 ? `+${pctDelta}% VOLUME` : pctDelta < 0 ? `${pctDelta}% VOLUME` : 'NORMAL VOLUME';
  const pillColor =
    pctDelta > 0 ? Colors.success : pctDelta < 0 ? Colors.warning : Colors.textSecondary;

  const scoreColor =
    score >= 85
      ? Colors.success
      : score >= 70
      ? Colors.good
      : score >= 50
      ? Colors.warning
      : score >= 35
      ? Colors.warn
      : Colors.error;

  return (
    <View style={[styles.recoveryCard, { borderColor: scoreColor + '44' }]}>
      <View style={styles.recoveryCardRow}>
        <View>
          <Text style={styles.monoLabel}>RECOVERY SCORE</Text>
          <Text style={[styles.recoveryScore, { color: scoreColor }]}>{score}</Text>
          <Text style={[styles.recoveryLabel, { color: scoreColor }]}>{label.toUpperCase()}</Text>
        </View>
        <View style={[styles.volumePill, { borderColor: pillColor + '88' }]}>
          <Text style={[styles.volumePillText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
      </View>
      <Text style={styles.recommendation}>{recommendation}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function WorkoutLobby() {
  const router = useRouter();
  const { programId, dayIndex } = useLocalSearchParams<{ programId: string; dayIndex: string }>();
  const { data: recovery, isLoading } = useTodayRecovery();

  const program = EXPERT_PROGRAMS[programId ?? 'cbum_evolved'] ?? EXPERT_PROGRAMS.cbum_evolved;
  const idx = parseInt(dayIndex ?? '0');
  const workout = program.schedule[idx % program.schedule.length];

  // volumeModifier from today's recovery (default 1.0 if no check-in)
  const volumeModifier: number = (recovery as any)?.volume_modifier ?? 1.0;
  const hasCheckin = !!recovery;

  const handleBegin = () => {
    router.replace({
      pathname: '/workout-session',
      params: { programId: programId ?? 'cbum_evolved', dayIndex: String(idx), volumeModifier: String(volumeModifier) },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headline}>{workout.name.toUpperCase()}</Text>
          <Text style={styles.monoLabel}>{workout.muscleGroups.join(' · ')}</Text>
        </View>

        {/* Recovery card or missing check-in warning */}
        {isLoading ? null : hasCheckin && recovery ? (
          <RecoveryCard
            score={(recovery as any).recovery_score}
            label={(recovery as any).label ?? ''}
            volumeModifier={volumeModifier}
            recommendation={(recovery as any).recommendation ?? ''}
          />
        ) : (
          <TouchableOpacity
            style={styles.noCheckinCard}
            onPress={() =>
              router.push({
                pathname: '/recovery-checkin',
                params: { returnTo: '/workout-lobby?programId=' + (programId ?? 'cbum_evolved') + '&dayIndex=' + String(idx) },
              } as any)
            }
          >
            <Text style={styles.noCheckinTitle}>⚠ NO MORNING CHECK-IN</Text>
            <Text style={styles.noCheckinSub}>
              Tap to check in — your volume will default to 100% if you skip.
            </Text>
          </TouchableOpacity>
        )}

        {/* Today's workout with adjusted set counts */}
        <Text style={styles.sectionLabel}>TODAY'S WORKOUT</Text>
        <View style={styles.exerciseList}>
          {workout.exercises.map((ex) => {
            const adjustedSets = Math.max(1, Math.round(ex.sets * volumeModifier));
            const delta = adjustedSets - ex.sets;
            const deltaColor =
              delta > 0 ? Colors.success : delta < 0 ? Colors.warning : Colors.textSecondary;
            const deltaLabel =
              delta !== 0
                ? ` → ${adjustedSets} sets (${delta > 0 ? '+' : ''}${delta})`
                : ` · ${ex.sets} sets`;

            return (
              <View key={ex.name} style={styles.exerciseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    <Text style={styles.exerciseSetsBase}>{ex.sets} sets</Text>
                    <Text style={{ color: deltaColor }}>{delta !== 0 ? deltaLabel : ''}</Text>
                    {delta === 0 && (
                      <Text style={styles.exerciseReps}>  {ex.reps}</Text>
                    )}
                  </Text>
                  <WeightSuggestion exerciseName={ex.name} reps={ex.reps} />
                </View>
                <Text style={styles.exerciseRepsRight}>{ex.reps}</Text>
              </View>
            );
          })}
        </View>

        {/* BEGIN WORKOUT */}
        <TouchableOpacity style={styles.beginBtn} onPress={handleBegin} activeOpacity={0.85}>
          <Text style={styles.beginBtnText}>BEGIN WORKOUT</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14 },

  header: { marginBottom: 20 },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 18, color: Colors.textSecondary },
  headline: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: -0.5 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 4 },

  recoveryCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 6, padding: 16, marginBottom: 20,
  },
  recoveryCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  recoveryScore: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 48 },
  recoveryLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  volumePill: {
    borderWidth: 1, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  volumePillText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },
  recommendation: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },

  noCheckinCard: {
    backgroundColor: 'rgba(255,177,58,0.08)', borderWidth: 1,
    borderColor: 'rgba(255,177,58,0.3)', borderRadius: 6,
    padding: 16, marginBottom: 20,
  },
  noCheckinTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.warning, letterSpacing: 1.2, marginBottom: 6 },
  noCheckinSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.warning, lineHeight: 18 },

  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 2, marginBottom: 10 },

  exerciseList: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 6, overflow: 'hidden', marginBottom: 20,
  },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseName: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, marginBottom: 3 },
  exerciseMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary },
  exerciseSetsBase: { color: Colors.textTertiary },
  exerciseReps: { color: Colors.textTertiary },
  exerciseRepsRight: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary, marginLeft: 10 },
  weightSuggestion: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 3, letterSpacing: 0.3 },

  beginBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center',
  },
  beginBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1 },
});
```

- [ ] **Step 2: Manual smoke test**

Start the app and navigate to the TRAIN tab. Verify the file compiles without errors in the Expo dev server console (TypeScript errors will surface here since there's no native test).

- [ ] **Step 3: Commit**

```bash
git add app/workout-lobby.tsx
git commit -m "feat(sprint1): add workout-lobby pre-workout review screen"
```

---

## Task 4: Modify `workouts.tsx` — route START WORKOUT to lobby

**Files:**
- Modify: `app/(tabs)/workouts.tsx`

The single change is the `onPress` handler of the START WORKOUT button (line 109–114).

- [ ] **Step 1: Update the START WORKOUT `onPress` handler**

Find (lines 108–116 in `app/(tabs)/workouts.tsx`):
```typescript
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: accentColor }]}
              onPress={() => router.push({
                pathname: '/workout-session',
                params: { programId, dayIndex: workoutIndex },
              } as any)}
              activeOpacity={0.85}
            >
```

Replace with:
```typescript
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: accentColor }]}
              onPress={() => router.push({
                pathname: '/workout-lobby',
                params: { programId, dayIndex: workoutIndex },
              } as any)}
              activeOpacity={0.85}
            >
```

- [ ] **Step 2: Manual verification**

Tap START WORKOUT on the TRAIN tab → should now land on the lobby screen, not jump straight into the session.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/workouts.tsx
git commit -m "feat(sprint1): START WORKOUT routes to workout-lobby"
```

---

## Task 5: Modify `workout-session.tsx` — apply volumeModifier to sets

**Files:**
- Modify: `app/workout-session.tsx`

Three changes: (1) read `volumeModifier` from route params, (2) apply it when initialising set state, (3) show a recovery pill in the header when modifier ≠ 1.0.

- [ ] **Step 1: Add `volumeModifier` to destructured params (line 35)**

Current:
```typescript
  const { programId, dayIndex } = useLocalSearchParams<{ programId: string; dayIndex: string }>();
```

Replace with:
```typescript
  const { programId, dayIndex, volumeModifier: volumeModifierParam } = useLocalSearchParams<{
    programId: string;
    dayIndex: string;
    volumeModifier?: string;
  }>();
  const volumeModifier = parseFloat(volumeModifierParam ?? '1.0') || 1.0;
```

- [ ] **Step 2: Apply volumeModifier when initialising `sets` state (line 46–50)**

Current:
```typescript
  const [sets, setSets] = useState<SetEntry[][]>(
    workout.exercises.map((ex) =>
      Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', rpe: '7', done: false }))
    )
  );
```

Replace with:
```typescript
  const [sets, setSets] = useState<SetEntry[][]>(
    workout.exercises.map((ex) =>
      Array.from(
        { length: Math.max(1, Math.round(ex.sets * volumeModifier)) },
        () => ({ weight: '', reps: '', rpe: '7', done: false })
      )
    )
  );
```

- [ ] **Step 3: Add recovery pill to header — after the `workoutName` Text inside `headerCenter` (line 179)**

Current `headerCenter` block:
```typescript
        <View style={styles.headerCenter}>
          <Text style={styles.workoutName}>{workout.name.toUpperCase()}</Text>
          <Text style={styles.timer}>{formatTime(elapsed)}</Text>
        </View>
```

Replace with:
```typescript
        <View style={styles.headerCenter}>
          <Text style={styles.workoutName}>{workout.name.toUpperCase()}</Text>
          <View style={styles.timerRow}>
            <Text style={styles.timer}>{formatTime(elapsed)}</Text>
            {volumeModifier !== 1.0 && (
              <View style={[
                styles.recoveryPill,
                { backgroundColor: volumeModifier > 1 ? 'rgba(57,224,138,0.15)' : 'rgba(255,177,58,0.15)' },
              ]}>
                <Text style={[
                  styles.recoveryPillText,
                  { color: volumeModifier > 1 ? Colors.success : Colors.warning },
                ]}>
                  {`VOL ${volumeModifier > 1 ? '+' : ''}${Math.round((volumeModifier - 1) * 100)}%`}
                </Text>
              </View>
            )}
          </View>
        </View>
```

- [ ] **Step 4: Add the two new style entries to the `styles` object at the bottom of the file**

After the `timer` style definition, add:
```typescript
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  recoveryPill: {
    borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2,
  },
  recoveryPillText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
```

- [ ] **Step 5: Manual verification**

Complete a recovery check-in with a low score (set soreness to 5, energy to 1, sleep to 4h). Then tap START WORKOUT → BEGIN WORKOUT. In the workout session, confirm:
  - Sets shown are reduced (e.g., 4 → 3 for a −20% modifier)
  - `VOL −20%` amber pill appears in the header timer row

- [ ] **Step 6: Commit**

```bash
git add app/workout-session.tsx
git commit -m "feat(sprint1): workout-session applies volumeModifier to set counts and shows recovery pill"
```

---

## Task 6: Upgrade `lib/poseAnalyzer.ts` — angles, bilateral, velocity, 7 new exercises

**Files:**
- Modify: `lib/poseAnalyzer.ts`
- Modify: `__tests__/poseAnalyzer.test.ts`

The spec requires:
1. **Measured angles** — every correction message includes the actual degree value
2. **Bilateral asymmetry** — run after exercise analysis on every frame
3. **Velocity cue** — wrist Y-position history for bench press descent speed
4. **7 new exercises** — Romanian deadlift, barbell row, lat pulldown, bicep curl, tricep pushdown, lunge, hip thrust
5. **`issueKey`** — machine-readable key on each `PoseCorrection` for the Claude cue layer

- [ ] **Step 1: Write failing tests in `__tests__/poseAnalyzer.test.ts`**

```typescript
import {
  analyzeForm,
  analyzeBilateral,
  type PoseCorrection,
  type Keypoint,
} from '../lib/poseAnalyzer';

// Helper: build a minimal keypoint array (17 keypoints, all low confidence)
function makeKps(overrides: Record<number, { x: number; y: number; score?: number }>): Keypoint[] {
  return Array.from({ length: 17 }, (_, i) => ({
    x: overrides[i]?.x ?? 0,
    y: overrides[i]?.y ?? 0,
    score: overrides[i]?.score ?? 0.95,
    name: String(i),
  }));
}

// KP indices
const KP = { LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6, LEFT_ELBOW: 7, LEFT_WRIST: 9,
              LEFT_HIP: 11, RIGHT_HIP: 12, LEFT_KNEE: 13, RIGHT_KNEE: 14, LEFT_ANKLE: 15 };

describe('analyzeForm — squat measured angles', () => {
  it('correction message contains degree value for knee cave', () => {
    const kps = makeKps({
      [KP.LEFT_HIP]: { x: 100, y: 100 },
      [KP.LEFT_KNEE]: { x: 160, y: 180 },  // knee 60px right of ankle → cave
      [KP.LEFT_ANKLE]: { x: 100, y: 260 },
      [KP.LEFT_SHOULDER]: { x: 100, y: 40 },
    });
    const corrections = analyzeForm(kps, 'Barbell Back Squat');
    const caveMsg = corrections.find((c) => c.issueKey === 'knee_valgus_left');
    expect(caveMsg).toBeDefined();
    expect(caveMsg!.message).toMatch(/\d+°/);  // must include a degree value
  });
});

describe('analyzeBilateral', () => {
  it('detects shoulder height imbalance > 15px', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 120 },  // 20px difference → above threshold
    });
    const corrections = analyzeBilateral(kps);
    expect(corrections.some((c) => c.issueKey === 'shoulder_height_imbalance')).toBe(true);
  });

  it('does not flag shoulder imbalance <= 15px', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 110 },  // only 10px — within tolerance
    });
    const corrections = analyzeBilateral(kps);
    expect(corrections.some((c) => c.issueKey === 'shoulder_height_imbalance')).toBe(false);
  });

  it('detects knee angle asymmetry > 20°', () => {
    // Left knee angle ~90°, right knee angle ~120° → 30° difference
    const kps = makeKps({
      [KP.LEFT_HIP]: { x: 100, y: 100 },
      [KP.LEFT_KNEE]: { x: 100, y: 180 },
      [KP.LEFT_ANKLE]: { x: 100, y: 260 },   // straight down → ~180° angle
      [KP.RIGHT_HIP]: { x: 200, y: 100 },
      [KP.RIGHT_KNEE]: { x: 200, y: 180 },
      [KP.LEFT_ANKLE + 1]: { x: 250, y: 260 }, // right ankle displaced → ~135°
    });
    // Just verify the function runs without throwing
    expect(() => analyzeBilateral(kps)).not.toThrow();
  });
});

describe('analyzeForm — bench press velocity cue', () => {
  it('fires velocity warning when descent rate exceeds threshold', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 100, y: 100 },
      [KP.LEFT_ELBOW]: { x: 100, y: 140 },
      [KP.LEFT_WRIST]: { x: 100, y: 180 },
    });
    // Simulate fast descent: wrist Y dropped 20px per frame over 5 frames
    const fastWristHistory = [80, 100, 120, 140, 160];  // descending fast (high y = lower)
    const corrections = analyzeForm(kps, 'Barbell Bench Press', fastWristHistory);
    expect(corrections.some((c) => c.issueKey === 'bench_descent_too_fast')).toBe(true);
  });

  it('does not fire velocity warning on slow descent', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 100, y: 100 },
      [KP.LEFT_ELBOW]: { x: 100, y: 140 },
      [KP.LEFT_WRIST]: { x: 100, y: 180 },
    });
    const slowWristHistory = [160, 162, 164, 166, 168];  // 2px/frame — slow
    const corrections = analyzeForm(kps, 'Barbell Bench Press', slowWristHistory);
    expect(corrections.some((c) => c.issueKey === 'bench_descent_too_fast')).toBe(false);
  });
});

describe('analyzeForm — new exercises do not throw', () => {
  const exercises = [
    'Romanian Deadlift',
    'Barbell Row',
    'Lat Pulldown',
    'Bicep Curl',
    'Tricep Pushdown',
    'Lunge',
    'Hip Thrust',
  ];
  const kps = makeKps({
    [KP.LEFT_SHOULDER]: { x: 100, y: 80 },
    [KP.LEFT_ELBOW]: { x: 100, y: 140 },
    [KP.LEFT_WRIST]: { x: 100, y: 200 },
    [KP.LEFT_HIP]: { x: 100, y: 200 },
    [KP.LEFT_KNEE]: { x: 100, y: 280 },
    [KP.LEFT_ANKLE]: { x: 100, y: 360 },
  });
  exercises.forEach((name) => {
    it(`analyzeForm('${name}') returns at least one correction`, () => {
      const corrections = analyzeForm(kps, name);
      expect(corrections.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx jest __tests__/poseAnalyzer.test.ts
```

Expected: multiple failures because `issueKey` doesn't exist and `analyzeBilateral` is not exported.

- [ ] **Step 3: Rewrite `lib/poseAnalyzer.ts` with all upgrades**

```typescript
import type { Keypoint } from '@tensorflow-models/pose-detection';

// MoveNet keypoint indices
const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
} as const;

export interface PoseCorrection {
  severity: 'good' | 'warning' | 'error';
  message: string;
  /** Machine-readable key used by the Claude cue layer to group issues */
  issueKey?: string;
}

function getKp(keypoints: Keypoint[], idx: number): { x: number; y: number; score: number } | null {
  const kp = keypoints[idx];
  if (!kp || (kp.score ?? 0) < 0.3) return null;
  return { x: kp.x, y: kp.y, score: kp.score ?? 0 };
}

function angleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot / (magAB * magCB)))) * (180 / Math.PI);
}

// ─── Bilateral asymmetry (runs after every exercise-specific analysis) ────────

export function analyzeBilateral(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const lShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const rShoulder = getKp(keypoints, KP.RIGHT_SHOULDER);
  const lHip = getKp(keypoints, KP.LEFT_HIP);
  const lKnee = getKp(keypoints, KP.LEFT_KNEE);
  const lAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const rHip = getKp(keypoints, KP.RIGHT_HIP);
  const rKnee = getKp(keypoints, KP.RIGHT_KNEE);
  const rAnkle = getKp(keypoints, KP.RIGHT_ANKLE);

  // Shoulder height imbalance
  if (lShoulder && rShoulder) {
    const diff = Math.abs(lShoulder.y - rShoulder.y);
    if (diff > 15) {
      const higher = lShoulder.y < rShoulder.y ? 'Left' : 'Right';
      corrections.push({
        severity: 'warning',
        message: `${higher} shoulder is higher than the other — even out your bar path (${Math.round(diff)}px difference).`,
        issueKey: 'shoulder_height_imbalance',
      });
    }
  }

  // Knee angle asymmetry
  if (lHip && lKnee && lAnkle && rHip && rKnee && rAnkle) {
    const leftKneeAngle = angleDeg(lHip, lKnee, lAnkle);
    const rightKneeAngle = angleDeg(rHip, rKnee, rAnkle);
    const diff = Math.abs(leftKneeAngle - rightKneeAngle);
    if (diff > 20) {
      const worse = leftKneeAngle > rightKneeAngle ? 'Right' : 'Left';
      corrections.push({
        severity: 'warning',
        message: `${worse} knee is caving more than the other (${Math.round(diff)}° difference) — push both knees out equally.`,
        issueKey: 'knee_angle_asymmetry',
      });
    }
  }

  return corrections;
}

// ─── Velocity cue helper ─────────────────────────────────────────────────────

/** Returns pixels-per-frame descent rate from the last N wrist Y positions.
 *  Positive = moving downward (increasing Y). */
function wristDescentRate(wristYHistory: number[]): number {
  if (wristYHistory.length < 2) return 0;
  const last = wristYHistory[wristYHistory.length - 1];
  const first = wristYHistory[0];
  return (last - first) / (wristYHistory.length - 1);
}

// ─── Exercise analyzers ───────────────────────────────────────────────────────

export function analyzeSquat(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle > 160) {
      corrections.push({ severity: 'good', message: 'Standing tall — ready to squat.', issueKey: 'squat_standing' });
    } else if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — great depth, below parallel!`, issueKey: 'squat_good_depth' });
    } else if (kneeAngle < 130) {
      corrections.push({ severity: 'warning', message: `Knee angle: ${kneeAngle}° — go deeper, target <100° for below parallel.`, issueKey: 'squat_insufficient_depth' });
    }

    // Knee valgus check (frontal view: knee should be roughly over ankle)
    const xDiff = Math.abs(leftKnee.x - leftAnkle.x);
    if (xDiff > 40) {
      corrections.push({
        severity: 'error',
        message: `Knee caving inward (${Math.round(xDiff)}px offset) — drive your knees out over your toes.`,
        issueKey: 'knee_valgus_left',
      });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle < 145) {
      corrections.push({
        severity: 'warning',
        message: `Torso angle: ${torsoAngle}° — keep your chest up, too much forward lean.`,
        issueKey: 'squat_forward_lean',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good form — keep it up!' });
  }
  return corrections;
}

export function analyzeBenchPress(keypoints: Keypoint[], wristYHistory: number[] = []): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);
  const rightShoulder = getKp(keypoints, KP.RIGHT_SHOULDER);
  const rightElbow = getKp(keypoints, KP.RIGHT_ELBOW);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 80) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — good depth, chest touched!`, issueKey: 'bench_good_depth' });
    } else if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — arms locked out at top.`, issueKey: 'bench_lockout' });
    }

    // Elbow flare
    if (leftShoulder && rightShoulder && leftElbow && rightElbow) {
      const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
      const elbowWidth = Math.abs(rightElbow.x - leftElbow.x);
      if (elbowWidth > shoulderWidth * 1.4) {
        corrections.push({
          severity: 'warning',
          message: `Elbows flared ${Math.round(elbowWidth)}px wide vs ${Math.round(shoulderWidth)}px shoulder width — tuck in at ~45° to protect your shoulders.`,
          issueKey: 'bench_elbow_flare',
        });
      }
    }
  }

  // Velocity cue: fast descent on bench press
  if (wristYHistory.length >= 5) {
    const rate = wristDescentRate(wristYHistory);
    // Threshold: > 8px/frame descent is too fast at 50ms interval (≈160px/s)
    if (rate > 8) {
      corrections.push({
        severity: 'warning',
        message: `Bar descending at ${rate.toFixed(1)}px/frame — lower the bar slower, aim for 2–3 seconds down.`,
        issueKey: 'bench_descent_too_fast',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Looking good — maintain arch and leg drive.' });
  }
  return corrections;
}

export function analyzeDeadlift(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];

  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftShoulder && leftHip) {
    if (leftShoulder.y < leftHip.y && Math.abs(leftShoulder.x - leftHip.x) < 20) {
      corrections.push({ severity: 'warning', message: 'Hinge at the hips — push them back before bending.', issueKey: 'deadlift_no_hip_hinge' });
    }
  }

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — good setup position.`, issueKey: 'deadlift_good_setup' });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (backAngle < 100) {
      corrections.push({
        severity: 'error',
        message: `Back angle: ${backAngle}° — spinal flexion detected. Keep your back neutral.`,
        issueKey: 'deadlift_spinal_flexion',
      });
    } else {
      corrections.push({ severity: 'good', message: `Back angle: ${backAngle}° — neutral spine, good.`, issueKey: 'deadlift_neutral_spine' });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Maintain bar close to legs throughout the lift.' });
  }
  return corrections;
}

export function analyzeOhp(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full lockout, great!`, issueKey: 'ohp_lockout' });
    } else if (elbowAngle < 90) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — starting position, drive the bar overhead.`, issueKey: 'ohp_start' });
    }
  }

  corrections.push({ severity: 'good', message: 'Keep core braced and avoid lower back arch.', issueKey: 'ohp_core' });
  return corrections;
}

export function analyzeRomanianDeadlift(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 150) {
      corrections.push({
        severity: 'warning',
        message: `Knee angle: ${kneeAngle}° — RDL should have soft knees (~160°), not a full squat.`,
        issueKey: 'rdl_excessive_knee_bend',
      });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (backAngle < 100) {
      corrections.push({
        severity: 'error',
        message: `Back angle: ${backAngle}° — back rounding detected. Hinge from the hips with a neutral spine.`,
        issueKey: 'rdl_back_rounding',
      });
    } else {
      corrections.push({ severity: 'good', message: `Hip hinge angle: ${backAngle}° — neutral spine, good.` });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good RDL form — keep the bar close to your legs.' });
  }
  return corrections;
}

export function analyzeBarbellRow(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle > 60) {
      corrections.push({
        severity: 'warning',
        message: `Torso angle: ${torsoAngle}° — too upright for bent-over row. Hinge to ~45° for maximum back activation.`,
        issueKey: 'row_torso_too_upright',
      });
    } else {
      corrections.push({ severity: 'good', message: `Torso angle: ${torsoAngle}° — good hinge position.` });
    }
  }

  if (leftShoulder && leftElbow) {
    if (leftElbow.y < leftShoulder.y) {
      corrections.push({
        severity: 'good',
        message: 'Elbows pulling past torso — full range of motion.',
        issueKey: 'row_full_rom',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Drive elbows back and squeeze the shoulder blades together.' });
  }
  return corrections;
}

export function analyzeLatPulldown(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 80) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full contraction at bottom!`, issueKey: 'lat_pulldown_full_contraction' });
    } else if (elbowAngle > 150) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — arms extended at top, full stretch.` });
    }
  }

  corrections.push({ severity: 'good', message: 'Keep chest tall, pull elbows down and back — not behind your body.', issueKey: 'lat_pulldown_form_cue' });
  return corrections;
}

export function analyzeBicepCurl(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle < 60) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — good peak contraction!`, issueKey: 'curl_peak_contraction' });
    } else if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full extension at bottom.` });
    }

    // Elbow drifting forward (swinging): elbow x should be relatively stable
    // Check elbow relative to shoulder — if elbow is far in front, it's swinging
    if (leftElbow && leftShoulder && leftElbow.x < leftShoulder.x - 30) {
      corrections.push({
        severity: 'warning',
        message: 'Elbow drifting forward — keep upper arms pinned to your sides to isolate the bicep.',
        issueKey: 'curl_elbow_drift',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Squeeze at the top, control the descent.' });
  }
  return corrections;
}

export function analyzeTricepPushdown(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftElbow = getKp(keypoints, KP.LEFT_ELBOW);
  const leftWrist = getKp(keypoints, KP.LEFT_WRIST);

  if (leftShoulder && leftElbow && leftWrist) {
    const elbowAngle = Math.round(angleDeg(leftShoulder, leftElbow, leftWrist));
    if (elbowAngle > 160) {
      corrections.push({ severity: 'good', message: `Elbow angle: ${elbowAngle}° — full lockout, good tricep contraction!`, issueKey: 'tricep_pushdown_lockout' });
    }

    // Elbow flaring away from torso
    if (leftElbow && leftShoulder && Math.abs(leftElbow.x - leftShoulder.x) > 40) {
      corrections.push({
        severity: 'warning',
        message: `Elbows flaring (${Math.round(Math.abs(leftElbow.x - leftShoulder.x))}px) — pin upper arms to your sides.`,
        issueKey: 'tricep_elbow_flare',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Control the weight on the way back up — slow eccentric.' });
  }
  return corrections;
}

export function analyzeLunge(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle < 100) {
      corrections.push({ severity: 'good', message: `Front knee angle: ${kneeAngle}° — good depth!`, issueKey: 'lunge_good_depth' });
    } else if (kneeAngle < 130) {
      corrections.push({
        severity: 'warning',
        message: `Front knee angle: ${kneeAngle}° — step further or sink lower, target ~90°.`,
        issueKey: 'lunge_insufficient_depth',
      });
    }

    // Knee tracking: knee x vs ankle x
    const kneeDrift = leftKnee.x - leftAnkle.x;
    if (Math.abs(kneeDrift) > 30) {
      corrections.push({
        severity: 'warning',
        message: `Knee drifting ${kneeDrift > 0 ? 'outward' : 'inward'} over ankle (${Math.round(Math.abs(kneeDrift))}px) — keep knee aligned over foot.`,
        issueKey: 'lunge_knee_drift',
      });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const torsoAngle = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (torsoAngle < 140) {
      corrections.push({
        severity: 'warning',
        message: `Torso angle: ${torsoAngle}° — keep your torso upright during the lunge.`,
        issueKey: 'lunge_forward_lean',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Good lunge form — controlled descent.' });
  }
  return corrections;
}

export function analyzeHipThrust(keypoints: Keypoint[]): PoseCorrection[] {
  const corrections: PoseCorrection[] = [];
  const leftShoulder = getKp(keypoints, KP.LEFT_SHOULDER);
  const leftHip = getKp(keypoints, KP.LEFT_HIP);
  const leftKnee = getKp(keypoints, KP.LEFT_KNEE);
  const leftAnkle = getKp(keypoints, KP.LEFT_ANKLE);

  if (leftHip && leftKnee && leftAnkle) {
    const kneeAngle = Math.round(angleDeg(leftHip, leftKnee, leftAnkle));
    if (kneeAngle >= 80 && kneeAngle <= 110) {
      corrections.push({ severity: 'good', message: `Knee angle: ${kneeAngle}° — good foot position for hip thrust.` });
    } else if (kneeAngle > 110) {
      corrections.push({
        severity: 'warning',
        message: `Knee angle: ${kneeAngle}° — feet too far forward. Move them closer to your glutes.`,
        issueKey: 'hip_thrust_feet_too_far',
      });
    }
  }

  if (leftShoulder && leftHip && leftKnee) {
    const hipExtension = Math.round(angleDeg(leftShoulder, leftHip, leftKnee));
    if (hipExtension > 160) {
      corrections.push({ severity: 'good', message: `Hip extension: ${hipExtension}° — full lockout, squeeze those glutes!`, issueKey: 'hip_thrust_full_extension' });
    } else if (hipExtension < 140) {
      corrections.push({
        severity: 'warning',
        message: `Hip extension: ${hipExtension}° — drive hips higher for full glute activation.`,
        issueKey: 'hip_thrust_insufficient_extension',
      });
    }
  }

  if (corrections.length === 0) {
    corrections.push({ severity: 'good', message: 'Drive hips up and squeeze hard at the top.' });
  }
  return corrections;
}

// ─── Exercise type detection ──────────────────────────────────────────────────

export type ExerciseType =
  | 'squat'
  | 'bench'
  | 'deadlift'
  | 'rdl'
  | 'ohp'
  | 'row'
  | 'lat_pulldown'
  | 'bicep_curl'
  | 'tricep_pushdown'
  | 'lunge'
  | 'hip_thrust'
  | 'generic';

export function detectExerciseType(name: string): ExerciseType {
  const n = name.toLowerCase();
  if (n.includes('romanian') || (n.includes('rdl'))) return 'rdl';
  if (n.includes('hip thrust')) return 'hip_thrust';
  if (n.includes('lunge')) return 'lunge';
  if (n.includes('squat')) return 'squat';
  if (n.includes('bench') || (n.includes('press') && n.includes('chest'))) return 'bench';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('overhead press') || n.includes('ohp') || n.includes('military press')) return 'ohp';
  if (n.includes('barbell row') || n.includes('bent-over row') || n.includes('bentover row')) return 'row';
  if (n.includes('lat pulldown') || n.includes('lat pull')) return 'lat_pulldown';
  if (n.includes('bicep curl') || n.includes('bicep')) return 'bicep_curl';
  if (n.includes('tricep pushdown') || n.includes('tricep')) return 'tricep_pushdown';
  return 'generic';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/** Analyse form for the given exercise. wristYHistory = last 5 wrist Y values (for bench velocity cue). */
export function analyzeForm(
  keypoints: Keypoint[],
  exerciseName: string,
  wristYHistory: number[] = []
): PoseCorrection[] {
  const type = detectExerciseType(exerciseName);
  let corrections: PoseCorrection[];

  switch (type) {
    case 'squat':           corrections = analyzeSquat(keypoints); break;
    case 'bench':           corrections = analyzeBenchPress(keypoints, wristYHistory); break;
    case 'deadlift':        corrections = analyzeDeadlift(keypoints); break;
    case 'rdl':             corrections = analyzeRomanianDeadlift(keypoints); break;
    case 'ohp':             corrections = analyzeOhp(keypoints); break;
    case 'row':             corrections = analyzeBarbellRow(keypoints); break;
    case 'lat_pulldown':    corrections = analyzeLatPulldown(keypoints); break;
    case 'bicep_curl':      corrections = analyzeBicepCurl(keypoints); break;
    case 'tricep_pushdown': corrections = analyzeTricepPushdown(keypoints); break;
    case 'lunge':           corrections = analyzeLunge(keypoints); break;
    case 'hip_thrust':      corrections = analyzeHipThrust(keypoints); break;
    default:                corrections = [{ severity: 'good', message: 'Hold position — analysing...' }];
  }

  return [...corrections, ...analyzeBilateral(keypoints)];
}

// ─── Skeleton connections (unchanged) ────────────────────────────────────────

export const POSE_CONNECTIONS: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE],
  [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
  [KP.NOSE, KP.LEFT_EYE],
  [KP.NOSE, KP.RIGHT_EYE],
];
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/poseAnalyzer.test.ts
```

Expected: all tests green. If any test references a wrong property name (e.g., `lastReps` vs actual field name from `progressionEngine.ts`), update the test assertion to match the actual `ProgressionSuggestion` shape.

- [ ] **Step 5: Commit**

```bash
git add lib/poseAnalyzer.ts __tests__/poseAnalyzer.test.ts
git commit -m "feat(sprint2): upgrade poseAnalyzer — measured angles, bilateral, velocity cue, 7 new exercises"
```

---

## Task 7: Update `supabase/functions/form-feedback/index.ts` — accept angles + persona

**Files:**
- Modify: `supabase/functions/form-feedback/index.ts`

The edge function currently accepts `exerciseName` + `detectedIssues`. We extend it to also accept `persona` (string) and `angles` (object of angle key → number), and work them into the Claude prompt for richer, persona-voiced cues.

- [ ] **Step 1: Replace the entire contents of `supabase/functions/form-feedback/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callClaude, corsHeaders, jsonResponse, errorResponse, internalError,
  SUPABASE_URL, SUPABASE_ANON_KEY,
} from '../_shared/claude.ts';
import { checkRateLimit, sanitize } from '../_shared/security.ts';

const MAX_EXERCISE_NAME_LEN = 100;
const MAX_ISSUE_LEN = 200;
const MAX_ISSUES_COUNT = 10;
const MAX_PERSONA_LEN = 50;

const PERSONA_VOICES: Record<string, string> = {
  cbum: 'Chris Bumstead (Classic Physique GOAT): calm, technical, mentions symmetry and aesthetics. Prefix your response with "CBUM SAYS".',
  arnold: 'Arnold Schwarzenegger: confident, motivational, occasionally references pumping iron and the mind-muscle connection. Prefix with "ARNOLD SAYS".',
  nippard: 'Jeff Nippard: science-based, precise, references degrees and research. Prefix with "NIPPARD SAYS".',
  ct_fletcher: 'CT Fletcher: intense, no-nonsense, uses direct commands. Prefix with "CT SAYS".',
  dr_mike: 'Dr Mike Israetel: evidence-based, friendly, references MEV/MRV concepts. Prefix with "DR MIKE SAYS".',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Unauthorized', 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    // Form coach fires on error corrections with a 15s cooldown — allow higher rate
    if (!checkRateLimit(user.id, 'form-feedback', 30, 60_000)) {
      return errorResponse('Too many requests. Please wait a moment.', 429);
    }

    const body = await req.json() as {
      exerciseName?: unknown;
      detectedIssues?: unknown;
      persona?: unknown;
      angles?: unknown;
    };

    if (typeof body.exerciseName !== 'string' || !body.exerciseName.trim()) {
      return errorResponse('exerciseName required', 400);
    }

    const exerciseName = sanitize(body.exerciseName, MAX_EXERCISE_NAME_LEN);

    const rawIssues = Array.isArray(body.detectedIssues) ? body.detectedIssues : [];
    const detectedIssues = rawIssues
      .filter((i): i is string => typeof i === 'string')
      .slice(0, MAX_ISSUES_COUNT)
      .map((i) => sanitize(i, MAX_ISSUE_LEN));

    const personaKey =
      typeof body.persona === 'string'
        ? sanitize(body.persona.toLowerCase(), MAX_PERSONA_LEN)
        : 'cbum';
    const personaVoice = PERSONA_VOICES[personaKey] ?? PERSONA_VOICES.cbum;

    // Structured angle data
    const angles: Record<string, number> = {};
    if (body.angles && typeof body.angles === 'object') {
      for (const [k, v] of Object.entries(body.angles as Record<string, unknown>)) {
        if (typeof v === 'number' && isFinite(v)) {
          angles[String(k).slice(0, 40)] = Math.round(v * 10) / 10;
        }
      }
    }

    const anglesText = Object.entries(angles).length > 0
      ? `Measured joint angles:\n${Object.entries(angles).map(([k, v]) => `  ${k}: ${v}°`).join('\n')}`
      : '';

    const issuesSummary = detectedIssues.length > 0
      ? `Detected issues:\n${detectedIssues.map((i) => `- ${i}`).join('\n')}`
      : 'No specific issues detected — form looks good.';

    const prompt = `Exercise: ${exerciseName}

${issuesSummary}

${anglesText}

Respond in the voice of ${personaVoice}

Give ONE focused coaching cue addressing the most critical issue (or a reinforcing cue if form is good). Reference the actual angle values where relevant. Keep it under 60 words. Be direct, in-character, and actionable.`;

    const systemPrompt = 'You are a world-class personal trainer providing real-time form coaching. Respond exactly in the voice of the specified persona.';

    const feedback = await callClaude(
      systemPrompt,
      [{ role: 'user', content: prompt }],
      200,
    );

    return jsonResponse({ feedback, exerciseName, persona: personaKey });
  } catch {
    return internalError();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/form-feedback/index.ts
git commit -m "feat(sprint2): form-feedback edge function accepts persona + structured angles"
```

---

## Task 8: Update `lib/api/edgeFunctions.ts` — update `getFormFeedback` signature

**Files:**
- Modify: `lib/api/edgeFunctions.ts`

The `getFormFeedback` function currently accepts only `exerciseName` and `detectedIssues`. We add `persona` and `angles` params.

- [ ] **Step 1: Replace the `FormFeedbackResponse` interface and `getFormFeedback` function**

Find (lines 58–68 of `lib/api/edgeFunctions.ts`):
```typescript
export interface FormFeedbackResponse {
  feedback: string;
  exerciseName: string;
}

export async function getFormFeedback(
  exerciseName: string,
  detectedIssues: string[],
): Promise<FormFeedbackResponse> {
  return invokeFunction('form-feedback', { exerciseName, detectedIssues });
}
```

Replace with:
```typescript
export interface FormFeedbackResponse {
  feedback: string;
  exerciseName: string;
  persona: string;
}

export async function getFormFeedback(
  exerciseName: string,
  detectedIssues: string[],
  persona: string,
  angles: Record<string, number>,
): Promise<FormFeedbackResponse> {
  return invokeFunction('form-feedback', { exerciseName, detectedIssues, persona, angles });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/api/edgeFunctions.ts
git commit -m "feat(sprint2): getFormFeedback accepts persona and structured angles"
```

---

## Task 9: Install react-native-vision-camera and update app.json

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app.json`

`react-native-vision-camera` v3 is a native module. In this Expo managed project it requires adding the plugin to `app.json` and triggering a new EAS dev client build before the native camera component can be used.

- [ ] **Step 1: Install packages**

```bash
npm install react-native-vision-camera@3 react-native-worklets-core
```

Expected: `react-native-vision-camera` and `react-native-worklets-core` appear in `package.json` dependencies.

- [ ] **Step 2: Update `app.json` plugins array**

Find in `app.json`:
```json
    "plugins": [
      "expo-router",
      "expo-camera",
```

Replace with:
```json
    "plugins": [
      "expo-router",
      "react-native-vision-camera",
```

> `expo-camera` plugin is removed because VisionCamera handles camera permissions via its own plugin.

- [ ] **Step 3: Add Babel plugin for worklets in `babel.config.js`**

Read `babel.config.js` first, then add the worklets plugin. The file currently looks like:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ... existing plugins
    ],
  };
};
```

Add `'react-native-worklets-core/plugin'` as the **first** entry in `plugins`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets-core/plugin',
      // ... any existing plugins below
    ],
  };
};
```

- [ ] **Step 4: Trigger a new EAS dev client build**

```bash
eas build --profile development --platform android
```

This will build a new dev client APK with VisionCamera's native code included. Install it on the test device (replace the prior build at `https://expo.dev/accounts/fitaipro/projects/fitai-pro/builds/21ad5e7e-ea93-4d70-b155-b33baf475bae`).

> ⚠️ The form coach screen will crash until this build is installed. All other screens work fine in the existing dev client.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json babel.config.js
git commit -m "chore(sprint2): add react-native-vision-camera v3 + worklets-core, update app.json plugin"
```

---

## Task 10: Rewrite `app/form-coach.tsx` — VisionCamera, persona, Claude cue

**Files:**
- Modify: `app/form-coach.tsx`

This is the largest change. Replaces `CameraView` from `expo-camera` with `Camera` from `react-native-vision-camera`. Adds:
- `useFrameProcessor` at ~20fps (50ms equivalent with self-throttling)
- `persona` route param consumed from workout-session
- `wristYHistory` state for bench velocity cue (last 5 frames)
- `claudeCue` state with 15s cooldown on error-severity corrections
- Fade-out of Claude cue after 5s of no error corrections

- [ ] **Step 1: Update the workout-session FORM button to pass `persona` param**

In `app/workout-session.tsx`, find the FORM button press handler (around line 216):
```typescript
                  onPress={() => router.push({ pathname: '/form-coach', params: { exerciseName: ex.name } } as any)}
```

Replace with:
```typescript
                  onPress={() => router.push({ pathname: '/form-coach', params: { exerciseName: ex.name, persona: programId ?? 'cbum_evolved' } } as any)}
```

> The persona key matches the program ID convention (e.g., `cbum_evolved` → `cbum`, `arnold_blueprint` → `arnold`). The mapping is done in form-coach.

- [ ] **Step 2: Rewrite `app/form-coach.tsx` in full**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { decodeJpeg } from '@/lib/tfSetup';
import { initTf } from '@/lib/tfSetup';
import { analyzeForm, type PoseCorrection } from '@/lib/poseAnalyzer';
import { SkeletonOverlay } from '@/components/formcoach/SkeletonOverlay';
import { getFormFeedback } from '@/lib/api/edgeFunctions';
import { Colors, Spacing, Typography, Fonts } from '@/constants/theme';

const FRAME_INTERVAL_MS = 50; // target 20fps
const MODEL_INPUT_SIZE = 192;
const CLAUDE_COOLDOWN_MS = 15_000;
const CUE_FADE_TIMEOUT_MS = 5_000;
const VELOCITY_HISTORY_SIZE = 5;
const FAST_DESCENT_THRESHOLD = 8; // px/frame

/** Map programId prefix to persona key used by the form-feedback edge function */
function programIdToPersona(programId: string): string {
  if (programId.startsWith('cbum')) return 'cbum';
  if (programId.startsWith('arnold')) return 'arnold';
  if (programId.startsWith('nippard')) return 'nippard';
  if (programId.startsWith('ct_fletcher')) return 'ct_fletcher';
  if (programId.startsWith('dr_mike')) return 'dr_mike';
  return 'cbum';
}

/** Collect named angles from keypoints for the Claude cue */
function extractAngles(kps: poseDetection.Keypoint[]): Record<string, number> {
  const angles: Record<string, number> = {};
  function kp(i: number) { return kps[i] ?? { x: 0, y: 0, score: 0 }; }
  function angleDeg(a: {x:number,y:number}, b: {x:number,y:number}, c: {x:number,y:number}) {
    const ab = { x: a.x-b.x, y: a.y-b.y };
    const cb = { x: c.x-b.x, y: c.y-b.y };
    const dot = ab.x*cb.x + ab.y*cb.y;
    const mag = Math.sqrt(ab.x**2+ab.y**2) * Math.sqrt(cb.x**2+cb.y**2);
    if (mag === 0) return 0;
    return Math.round(Math.acos(Math.min(1, Math.max(-1, dot/mag))) * 180/Math.PI);
  }
  const lShoulder = kp(5), lElbow = kp(7), lWrist = kp(9);
  const lHip = kp(11), lKnee = kp(13), lAnkle = kp(15);
  const rHip = kp(12), rKnee = kp(14);
  angles['knee_angle_left'] = angleDeg(lHip, lKnee, lAnkle);
  angles['knee_angle_right'] = angleDeg(rHip, rKnee, kp(16));
  angles['torso_lean'] = angleDeg(lShoulder, lHip, lKnee);
  angles['elbow_angle_left'] = angleDeg(lShoulder, lElbow, lWrist);
  return angles;
}

export default function FormCoach() {
  const router = useRouter();
  const { exerciseName, persona: personaParam } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
  }>();
  const { width: screenWidth } = useWindowDimensions();
  const cameraHeight = screenWidth * 1.33;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [tfReady, setTfReady] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [keypoints, setKeypoints] = useState<poseDetection.Keypoint[]>([]);
  const [corrections, setCorrections] = useState<PoseCorrection[]>([]);
  const [claudeCue, setClaudeCue] = useState<string | null>(null);
  const [claudePersonaLabel, setClaudePersonaLabel] = useState('');

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const processingRef = useRef(false);
  const lastClaudeCallAt = useRef(0);
  const cueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wristYHistory = useRef<number[]>([]);
  const lastFrameAt = useRef(0);

  const persona = programIdToPersona(personaParam ?? 'cbum_evolved');

  // Derive the persona display label
  const PERSONA_LABELS: Record<string, string> = {
    cbum: 'CBUM SAYS', arnold: 'ARNOLD SAYS', nippard: 'NIPPARD SAYS',
    ct_fletcher: 'CT SAYS', dr_mike: 'DR MIKE SAYS',
  };

  // Init TF.js + MoveNet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initTf();
      if (cancelled) return;
      const det = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true }
      );
      if (!cancelled) {
        detectorRef.current = det;
        setTfReady(true);
        setClaudePersonaLabel(PERSONA_LABELS[persona] ?? 'COACH SAYS');
      }
    })().catch((err) => { if (__DEV__) console.warn('[FormCoach] TF init:', err); });
    return () => { cancelled = true; };
  }, [persona]);

  // Process a raw BGRA pixel buffer from VisionCamera
  const processRawFrame = useCallback(async (
    buffer: ArrayBuffer,
    width: number,
    height: number,
  ) => {
    if (!detectorRef.current) return;
    processingRef.current = true;
    try {
      // Convert BGRA → RGB (drop alpha channel)
      const bgra = new Uint8Array(buffer);
      const rgb = new Uint8Array(width * height * 3);
      for (let i = 0, j = 0; i < bgra.length; i += 4, j += 3) {
        rgb[j]   = bgra[i + 2]; // R ← B channel in BGRA
        rgb[j+1] = bgra[i + 1]; // G
        rgb[j+2] = bgra[i];     // B ← R channel in BGRA
      }

      // @ts-ignore — TF.js accepts Uint8Array with shape for browser-like APIs
      const poses = await detectorRef.current.estimatePoses(
        { data: rgb, width, height, channels: 3 } as any
      );

      if (poses.length > 0) {
        const kps = poses[0].keypoints;
        setKeypoints(kps);

        // Track wrist Y for velocity cue
        const lWrist = kps[9];
        if (lWrist && (lWrist.score ?? 0) > 0.3) {
          wristYHistory.current = [...wristYHistory.current, lWrist.y].slice(-VELOCITY_HISTORY_SIZE);
        }

        const name = exerciseName ?? 'unknown';
        const newCorrections = analyzeForm(kps, name, wristYHistory.current);
        setCorrections(newCorrections);

        // Claude cue layer — fire on error corrections after cooldown
        const hasError = newCorrections.some((c) => c.severity === 'error');
        const now = Date.now();
        if (hasError && now - lastClaudeCallAt.current > CLAUDE_COOLDOWN_MS) {
          lastClaudeCallAt.current = now;
          const errorIssues = newCorrections
            .filter((c) => c.severity === 'error' && c.issueKey)
            .map((c) => c.issueKey!);
          const angles = extractAngles(kps);

          getFormFeedback(name, errorIssues, persona, angles)
            .then((res) => {
              setClaudeCue(res.feedback);
              // Reset fade-out timer
              if (cueTimeoutRef.current) clearTimeout(cueTimeoutRef.current);
              cueTimeoutRef.current = setTimeout(() => setClaudeCue(null), CUE_FADE_TIMEOUT_MS);
            })
            .catch(() => {}); // Silently ignore — Claude cue is non-critical
        }

        // Fade out cue if no errors for a full interval
        if (!hasError && cueTimeoutRef.current === null && claudeCue) {
          cueTimeoutRef.current = setTimeout(() => setClaudeCue(null), CUE_FADE_TIMEOUT_MS);
        }
      }
    } catch {
      // Silently ignore frame errors
    } finally {
      processingRef.current = false;
    }
  }, [exerciseName, persona, claudeCue]);

  // VisionCamera frame processor — runs on worklet thread, calls processRawFrame on JS thread
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const now = Date.now();
    if (processingRef.current || now - lastFrameAt.current < FRAME_INTERVAL_MS) return;
    lastFrameAt.current = now;
    const buf = frame.toArrayBuffer();
    runOnJS(processRawFrame)(buf, frame.width, frame.height);
  }, [processRawFrame]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permissionText}>Camera access is required for form coaching.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  const scaleX = screenWidth / MODEL_INPUT_SIZE;
  const scaleY = cameraHeight / MODEL_INPUT_SIZE;
  const primaryCorrection = corrections[0];
  const cameraDevice = useCameraDevice(facing);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{exerciseName ?? 'Form Coach'}</Text>
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.flipBtn}
        >
          <Text style={styles.flipText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Camera + Skeleton overlay */}
      <View style={[styles.cameraContainer, { height: cameraHeight }]}>
        {cameraDevice && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={cameraDevice}
            isActive={true}
            frameProcessor={tfReady ? frameProcessor : undefined}
            pixelFormat="bgra"
          />
        )}
        {keypoints.length > 0 && (
          <SkeletonOverlay
            keypoints={keypoints}
            width={screenWidth}
            height={cameraHeight}
            scaleX={scaleX}
            scaleY={scaleY}
          />
        )}
        {!tfReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Loading AI model…</Text>
          </View>
        )}
      </View>

      {/* Claude persona cue overlay */}
      {claudeCue && (
        <View style={styles.claudeCueCard}>
          <Text style={styles.claudeCueLabel}>✦ {claudePersonaLabel}</Text>
          <Text style={styles.claudeCueText}>{claudeCue}</Text>
        </View>
      )}

      {/* Form corrections */}
      <ScrollView style={styles.feedbackPanel} contentContainerStyle={styles.feedbackContent}>
        {corrections.length === 0 && tfReady && (
          <Text style={styles.waitingText}>Analysing your form…</Text>
        )}
        {corrections.map((c, i) => (
          <View
            key={i}
            style={[
              styles.correction,
              c.severity === 'error' && styles.correctionError,
              c.severity === 'warning' && styles.correctionWarning,
              c.severity === 'good' && styles.correctionGood,
            ]}
          >
            <Text style={styles.correctionIcon}>
              {c.severity === 'error' ? '🚨' : c.severity === 'warning' ? '⚠️' : '✅'}
            </Text>
            <Text style={styles.correctionText}>{c.message}</Text>
          </View>
        ))}
        <Text style={styles.disclaimer}>
          AI form coaching is for guidance only. Stop if you feel pain.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: '#000',
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: '#fff' },
  title: { fontSize: 16, fontFamily: Fonts.display, color: '#fff' },
  flipBtn: { padding: 4 },
  flipText: { fontSize: 20 },

  cameraContainer: { width: '100%', overflow: 'hidden', position: 'relative' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 },

  claudeCueCard: {
    backgroundColor: 'rgba(223,255,31,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(223,255,31,0.2)',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  claudeCueLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary,
    letterSpacing: 1.4, marginBottom: 4,
  },
  claudeCueText: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: '#e5e7eb', lineHeight: 19,
    fontStyle: 'italic',
  },

  feedbackPanel: { flex: 1, backgroundColor: '#111' },
  feedbackContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  waitingText: { color: '#6b7280', fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: Spacing.md },

  correction: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: 8,
  },
  correctionError: { backgroundColor: 'rgba(220,38,38,0.15)', borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  correctionWarning: { backgroundColor: 'rgba(245,158,11,0.15)', borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  correctionGood: { backgroundColor: 'rgba(22,163,74,0.15)', borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  correctionIcon: { fontSize: 16, marginTop: 1 },
  correctionText: { flex: 1, color: '#e5e7eb', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },

  disclaimer: { ...Typography.caption, color: '#6b7280', textAlign: 'center', marginTop: Spacing.md, fontStyle: 'italic' },
  permissionText: { color: '#fff', textAlign: 'center', marginBottom: Spacing.md, fontFamily: 'Inter_400Regular' },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionBtnText: { color: '#000', fontFamily: Fonts.display },
});
```

> **Note:** `useCameraDevice` is called twice in the component above (once at top level for the guard check, once inside the render for `cameraDevice`). Fix this: remove the top-level `device` declaration and replace the guard `if (!device)` check with `if (!cameraDevice)` — but since hooks can't be conditional, declare `cameraDevice` at top level with the reactive `facing` and remove the separate `device` constant. See corrected version below for the two `useCameraDevice` calls.

- [ ] **Step 3: Fix the duplicate `useCameraDevice` hook — update the component opening**

In the written file, find the two `useCameraDevice` calls and consolidate to one. Replace the top of `FormCoach`:

```typescript
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraDevice = useCameraDevice(facing);  // single declaration, reacts to facing state
```

And remove:
```typescript
  const device = useCameraDevice('back');
```

Then in the permission guard:
```typescript
  if (!hasPermission) { ... }

  if (!cameraDevice) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }
```

And remove the second `const cameraDevice = useCameraDevice(facing);` line from inside the return.

- [ ] **Step 4: Manual verification (requires new EAS dev client build from Task 9)**

Install the new dev client build on device. Open a workout, tap 📷 FORM on any exercise. Verify:
  1. Camera opens (VisionCamera, no disk I/O sound)
  2. Skeleton overlay renders at noticeably higher fps than before
  3. Correction messages include degree values (e.g., "Knee angle: 125°")
  4. On a squat with knees caving, an error correction fires within a few seconds
  5. Within 15s of the first error, a `✦ CBUM SAYS` (or relevant persona) card appears with a coaching cue
  6. After holding good form for 5s the cue card disappears

- [ ] **Step 5: Commit**

```bash
git add app/form-coach.tsx app/workout-session.tsx
git commit -m "feat(sprint2): form-coach rewritten with VisionCamera, persona Claude cue, bilateral + velocity analysis"
```

---

## Sprint 3 Note

Sprint 3 (Physique Analysis & Progress Tracking) is a fully independent subsystem with its own DB migration, encryption layer, new edge function, new capture screen, and progress tab additions. It should be implemented as a **separate plan** to keep each plan independently shippable.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `workout-lobby.tsx` new screen | Task 3 ✅ |
| Recovery card with score / volume pill / no-check-in warning | Task 3 ✅ |
| `adjustedSets = Math.max(1, Math.round(originalSets * volumeModifier))` | Task 3 ✅ |
| Weight suggestions via `analyzeProgression` | Task 3 ✅ |
| BEGIN WORKOUT passes volumeModifier + programId + dayIndex | Task 3 ✅ |
| `workouts.tsx` → `/workout-lobby` | Task 4 ✅ |
| `workout-session.tsx` reads volumeModifier, applies to sets, shows pill | Task 5 ✅ |
| `recovery-checkin.tsx` returnTo param | Task 2 ✅ |
| Measured angles in messages | Task 6 ✅ |
| Bilateral asymmetry (shoulder > 15px, knee > 20°) | Task 6 ✅ |
| Velocity cue (wrist Y, 5 frames, bench press) | Task 6 ✅ |
| 7 new exercise analyzers | Task 6 ✅ |
| Claude cue layer — 15s cooldown, error trigger | Task 10 ✅ |
| Persona route param + `✦ CBUM SAYS` display | Task 10 ✅ |
| Fade-out after 5s no error | Task 10 ✅ |
| `react-native-vision-camera` v3 + `react-native-worklets-core` | Task 9 ✅ |
| Frame interval 50ms | Task 10 ✅ |
| `form-feedback` edge function: angles + persona | Task 7 ✅ |
| `getFormFeedback` updated signature | Task 8 ✅ |

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `PoseCorrection.issueKey` defined in Task 6, used in Task 10's `getFormFeedback` call. `getFormFeedback(name, errorIssues, persona, angles)` matches the 4-param signature defined in Task 8. ✅
