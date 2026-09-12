/**
 * Exercise Form Library
 *
 * Ideal joint angle ranges and form cues sourced from:
 * - The Monument's "Encyclopedia of Modern Bodybuilding"
 * - The Analyst's evidence-based technique series
 * - The Sculptor's Classic Physique coaching content
 * - The Architect's RP Strength technique guides
 * - ACE & NSCA exercise science standards
 *
 * Joint angles measured at the joint named (e.g. knee = femur–tibia angle).
 * Ranges are for the bottom/working position of each movement.
 */

import type { PersonaId } from '@/lib/personaTheme';
import { getProfile } from '@/lib/vision/biomechanics';
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { EXPERT_PROGRAMS } from '@/constants/experts';

export interface CoachCue {
  // The canonical PersonaId, so a cue lookup can never drift from the ids the
  // rest of the app passes around. (This table once used its own 'ct'/'drmike'
  // spelling and CT / Dr Mike users silently got CBUM's line from every entry.)
  coachId: PersonaId;
  cue: string;
}

export interface AngleRange {
  joint: string;                  // e.g. "left_knee"
  label: string;                  // e.g. "Knee Bend"
  minDeg: number;
  maxDeg: number;
  tooLowMsg: string;              // shown when angle < minDeg
  tooHighMsg: string;             // shown when angle > maxDeg
  goodMsg: string;
}

export interface FormCheckpoint {
  phase: 'setup' | 'descent' | 'bottom' | 'ascent' | 'top';
  description: string;
}

export interface ExerciseForm {
  /** Stable slug, equal to the const the entry is declared as ('bench_press').
   *  Keys tutorial memory and clip filenames, so it must never change once shipped. */
  id: string;
  exerciseName: string;
  keywords: string[];             // matched against the normalised exercise name (see getExerciseForm)
  // Do NOT add values here: CATEGORY_TO_VISION is a Record over this union. Per-entry
  // engine routing that differs from the category default goes in `visionCategory`.
  category: 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'isolation';
  targetMuscles: string[];
  angleChecks: AngleRange[];
  checkpoints: FormCheckpoint[];
  coachCues: CoachCue[];
  commonMistakes: string[];
  breathingCue: string;

  // ── Technique card (all optional so older entries keep compiling) ────────
  /** 3–5 imperative lines shown as KEY POINTS. Drawn from checkpoint/cue text
   *  only — no biomechanics claims the engine does not make. */
  keyPoints?: string[];
  /** Where the phone goes so the engine's checks can actually see what they
   *  measure (side-plane checks need 'side', x-offset checks need 'front'). */
  cameraAngle?: 'side' | 'front' | 'front_45';
  cameraNote?: string;
  /** Optional clip metadata. The app looks for `<id>_v<version>.mp4` in the
   *  tutorial bucket BY CONVENTION — version 1 when this is null/absent — so a
   *  clip goes live by upload alone. Bump `version` only when re-shooting:
   *  public objects are CDN-cached and an in-place overwrite serves stale bytes. */
  tutorial?: { version: number; durationSec: number | null } | null;
  /** What the camera can genuinely flag. `checkId` must be a check id declared
   *  in lib/vision/biomechanics.ts PROFILES (tested). Anything in commonMistakes
   *  that is NOT listed here is a coaching note, never labelled "detected". */
  detectedFaults?: Array<{ checkId: string; label: string }>;
  /** Per-entry override of the category → engine-profile default. `null` means
   *  no honest profile exists (the camera must not be offered); omit to inherit. */
  visionCategory?: VisionCategory | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQUAT PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const barbell_squat: ExerciseForm = {
  id: 'barbell_squat',
  exerciseName: 'Barbell Back Squat',
  keywords: ['squat', 'back squat', 'barbell squat'],
  category: 'squat',
  keyPoints: [
    'Bar on traps, feet shoulder-width, toes 15–30° out',
    'Break at hips and knees simultaneously, chest proud',
    'Hip crease below knee, knees tracking over toes',
    'Drive through full foot, push floor away',
    'Full hip and knee extension, squeeze glutes',
  ],
  // depth/torso_pitch read the side plane, knee_valgus/hip_shift the front — a
  // 45° offset is the one position that gives both something to measure.
  cameraAngle: 'front_45',
  cameraNote: 'Phone 30–45° off your front, at hip height, whole body in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'squat.depth',       label: 'Depth' },
    { checkId: 'squat.knee_valgus', label: 'Knee cave' },
    { checkId: 'squat.hip_shift',   label: 'Hip shift' },
    { checkId: 'squat.torso_pitch', label: 'Forward lean' },
  ],
  targetMuscles: ['Quads', 'Glutes', 'Hamstrings', 'Core'],
  angleChecks: [
    {
      joint: 'left_knee', label: 'L. Knee Bend',
      minDeg: 70, maxDeg: 105,
      tooLowMsg: 'Knee too compressed — butt-wink risk, stop at parallel',
      tooHighMsg: 'DEPTH TOO HIGH — drive hips below parallel',
      goodMsg: 'Knee depth on point',
    },
    {
      joint: 'right_knee', label: 'R. Knee Bend',
      minDeg: 70, maxDeg: 105,
      tooLowMsg: 'Knee too compressed — butt-wink risk, stop at parallel',
      tooHighMsg: 'DEPTH TOO HIGH — drive hips below parallel',
      goodMsg: 'Knee depth on point',
    },
    {
      joint: 'left_hip', label: 'Hip Angle',
      minDeg: 55, maxDeg: 100,
      tooLowMsg: 'CHEST FALLING — brace and keep torso upright',
      tooHighMsg: 'Good torso position',
      goodMsg: 'Torso angle solid',
    },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Bar on traps, feet shoulder-width, toes 15–30° out' },
    { phase: 'descent', description: 'Break at hips and knees simultaneously, chest proud' },
    { phase: 'bottom',  description: 'Hip crease below knee, knees tracking over toes' },
    { phase: 'ascent',  description: 'Drive through full foot, push floor away' },
    { phase: 'top',     description: 'Full hip and knee extension, squeeze glutes' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Sit INTO the squat — hips back and down, chest stays proud. No collapsing forward.' },
    { coachId: 'arnold', cue: 'Imagine spreading the floor with your feet. Push out. The power comes from the hips, not the knees.' },
    { coachId: 'nippard', cue: 'Track knees over 2nd–3rd toe throughout. Hip crease below top of knee = parallel. Data confirms this activates quads optimally.' },
    { coachId: 'ct_fletcher', cue: 'GO DEEP OR GO HOME. Half reps are for half humans. DRIVE that bar through the ceiling.' },
    { coachId: 'dr_mike', cue: 'Aim for hip crease just below knee. Past that, risk exceeds stimulus. Control the eccentric — 2 seconds down.' },
  ],
  commonMistakes: [
    'Knees caving inward (valgus collapse)',
    'Heels rising off floor',
    'Forward torso lean (butt wink at depth)',
    'Not reaching parallel',
    'Bar too high on neck',
  ],
  breathingCue: 'Deep breath and brace at top → hold through descent and ascent → exhale past sticking point',
};

const goblet_squat: ExerciseForm = {
  id: 'goblet_squat',
  exerciseName: 'Goblet Squat',
  keywords: ['goblet squat', 'goblet'],
  category: 'squat',
  keyPoints: [
    'Hold weight at chest, elbows point down, feet shoulder-width',
    'Sit between your heels, elbows drive inside knees',
    'Full depth, torso upright, elbows push knees out',
    'Drive through heels, squeeze glutes at top',
  ],
  cameraAngle: 'front_45',
  cameraNote: 'Phone 30–45° off your front, at hip height, whole body in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'squat.depth',       label: 'Depth' },
    { checkId: 'squat.knee_valgus', label: 'Knee cave' },
    { checkId: 'squat.hip_shift',   label: 'Hip shift' },
    { checkId: 'squat.torso_pitch', label: 'Forward lean' },
  ],
  targetMuscles: ['Quads', 'Glutes', 'Core'],
  angleChecks: [
    { joint: 'left_knee', label: 'L. Knee', minDeg: 65, maxDeg: 100, tooLowMsg: 'Too deep — stay at parallel', tooHighMsg: 'Drive deeper — sit between your heels', goodMsg: 'Depth perfect' },
    { joint: 'right_knee', label: 'R. Knee', minDeg: 65, maxDeg: 100, tooLowMsg: 'Too deep', tooHighMsg: 'Deeper — sit between your heels', goodMsg: 'Depth perfect' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Hold weight at chest, elbows point down, feet shoulder-width' },
    { phase: 'descent', description: 'Sit between your heels, elbows drive inside knees' },
    { phase: 'bottom',  description: 'Full depth, torso upright, elbows push knees out' },
    { phase: 'ascent',  description: 'Drive through heels, squeeze glutes at top' },
    { phase: 'top',     description: 'Full extension, weight stays at chest' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Weight at chest keeps you upright. Use your elbows to push your knees out at the bottom.' },
    { coachId: 'nippard', cue: 'Great teaching tool for squat mechanics. Focus on keeping the torso as vertical as possible.' },
    { coachId: 'dr_mike', cue: 'The goblet position counterbalances naturally — use this to drill depth before loading a barbell.' },
    { coachId: 'arnold', cue: 'Feel the quads stretch at the bottom. That is where the growth begins.' },
    { coachId: 'ct_fletcher', cue: 'EVEN ON GOBLET SQUATS, I EXPECT FULL DEPTH. NO EXCEPTIONS.' },
  ],
  commonMistakes: ['Letting weight drift forward', 'Knees caving', 'Rising onto toes', 'Not reaching depth'],
  breathingCue: 'Inhale at top → hold and brace → exhale on the drive up',
};

const lunge: ExerciseForm = {
  id: 'lunge',
  exerciseName: 'Lunge',
  keywords: ['lunge', 'split squat', 'bulgarian', 'step up'],
  category: 'squat',
  // The squat profile's depth check compares both hips to both knees, which
  // means nothing with one knee near the floor. The engine has a dedicated
  // lunge profile; without this override it was unreachable.
  visionCategory: 'lunge',
  keyPoints: [
    'Upright torso, core braced, feet hip-width',
    'Lower back knee straight down — do not kick it forward',
    'Both knees at ~90°, front knee over mid-foot',
    'Push through front heel, extend hip and knee',
  ],
  // lunge.shin_angle reads ~0 from the front; it needs the profile view.
  cameraAngle: 'side',
  cameraNote: 'Phone directly to your side, at hip height, both legs in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'lunge.shin_angle',     label: 'Shin angle' },
    { checkId: 'lunge.depth',          label: 'Depth' },
    { checkId: 'lunge.shoulder_level', label: 'Shoulder level' },
    { checkId: 'lunge.torso_lean',     label: 'Torso lean' },
  ],
  targetMuscles: ['Quads', 'Glutes', 'Hamstrings'],
  angleChecks: [
    { joint: 'left_knee', label: 'Front Knee', minDeg: 80, maxDeg: 110, tooLowMsg: 'Knee past toes excessively — step longer', tooHighMsg: 'Depth too shallow — lower back knee toward floor', goodMsg: 'Front knee angle solid' },
    { joint: 'right_knee', label: 'Back Knee', minDeg: 80, maxDeg: 110, tooLowMsg: 'Back knee hovering — lower it toward floor', tooHighMsg: 'Back knee touching floor — raise slightly', goodMsg: 'Back knee position good' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Upright torso, core braced, feet hip-width' },
    { phase: 'descent', description: 'Lower back knee straight down — do not kick it forward' },
    { phase: 'bottom',  description: 'Both knees at ~90°, front knee over mid-foot' },
    { phase: 'ascent',  description: 'Push through front heel, extend hip and knee' },
    { phase: 'top',     description: 'Full extension, squeeze front glute' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Think of the back leg as a balance point only. All the power comes from the front leg. Drive that heel into the floor.' },
    { coachId: 'nippard', cue: 'Front shin angle is key — aim for slight forward lean. Step length determines this.' },
    { coachId: 'dr_mike', cue: 'Bulgarian split squat > standard lunge for stimulus. Elevate back foot 6–8 inches.' },
    { coachId: 'arnold', cue: 'Feel the stretch in your hip flexors. That tension = muscle growth.' },
    { coachId: 'ct_fletcher', cue: 'BALANCE AND POWER. BOTH LEGS MUST BE EQUAL. NO FAVOURITES.' },
  ],
  commonMistakes: ['Front knee tracking inward', 'Torso leaning too far forward', 'Back knee slamming floor', 'Uneven step width'],
  breathingCue: 'Inhale → brace → step and lower → exhale driving up',
};

// ─────────────────────────────────────────────────────────────────────────────
// HINGE PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const deadlift: ExerciseForm = {
  id: 'deadlift',
  exerciseName: 'Deadlift',
  keywords: ['deadlift', 'conventional deadlift', 'sumo', 'trap bar'],
  category: 'hinge',
  keyPoints: [
    'Bar over mid-foot, hip-width stance, arms just outside legs',
    'Hinge hips back, chest tall, lat tightness before bar leaves floor',
    'Neutral spine, bar close to shins, shoulders slightly past bar',
    'Push floor away, drive hips forward, keep bar close to body',
    'Full hip extension, squeeze glutes, do not hyperextend lumbar',
  ],
  // hip_height, bar_path and lockout are all side-plane; only hip_level is frontal.
  cameraAngle: 'side',
  cameraNote: 'Phone directly to your side, at knee height, bar and whole body in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'deadlift.hip_height', label: 'Hip height' },
    { checkId: 'deadlift.bar_path',   label: 'Bar path' },
    { checkId: 'deadlift.hip_level',  label: 'Uneven hips' },
    { checkId: 'deadlift.lockout',    label: 'Lockout' },
  ],
  targetMuscles: ['Hamstrings', 'Glutes', 'Erectors', 'Lats', 'Traps'],
  angleChecks: [
    { joint: 'left_hip', label: 'Hip Hinge', minDeg: 70, maxDeg: 130, tooLowMsg: 'LOWER BACK ROUNDING — brace core, neutral spine', tooHighMsg: 'HIPS TOO HIGH — you are squatting, not hinging', goodMsg: 'Hip hinge looks good' },
    { joint: 'left_knee', label: 'Knee Angle', minDeg: 130, maxDeg: 170, tooLowMsg: 'Knees too bent — this is a hinge, not a squat', tooHighMsg: 'Legs too straight — slight knee bend at setup', goodMsg: 'Knee angle solid' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Bar over mid-foot, hip-width stance, arms just outside legs' },
    { phase: 'descent', description: 'Hinge hips back, chest tall, lat tightness before bar leaves floor' },
    { phase: 'bottom',  description: 'Neutral spine, bar close to shins, shoulders slightly past bar' },
    { phase: 'ascent',  description: 'Push floor away, drive hips forward, keep bar close to body' },
    { phase: 'top',     description: 'Full hip extension, squeeze glutes, do not hyperextend lumbar' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Think "leg press the floor away" to initiate the pull. Bar stays touching your legs the whole way up.' },
    { coachId: 'arnold', cue: 'The back must be an iron rod. No rounding. The power is in the hips — snap them through at the top.' },
    { coachId: 'nippard', cue: 'Brace 360° — imagine someone is about to punch your stomach. That tension protects your spine.' },
    { coachId: 'ct_fletcher', cue: 'THIS IS THE KING OF ALL LIFTS. TREAT IT WITH RESPECT. LOCK YOUR BACK. DRIVE.' },
    { coachId: 'dr_mike', cue: 'Lat engagement is critical — "protect your armpits" cue works well to maintain position throughout the pull.' },
  ],
  commonMistakes: ['Lower back rounding', 'Bar drifting forward', 'Hips shooting up first', 'Hyperextending at lockout', 'Jerking the bar'],
  breathingCue: 'Big breath before the pull → brace hard → hold through the rep → exhale at top or on the way down',
};

const romanian_deadlift: ExerciseForm = {
  id: 'romanian_deadlift',
  exerciseName: 'Romanian Deadlift',
  // 'romanian deadlift' outranks deadlift's bare 'deadlift' on length; on the
  // old 'romanian' (same length as 'deadlift') the tie went to array order and
  // every RDL was coached as a conventional pull.
  keywords: ['romanian deadlift', 'romanian', 'rdl', 'stiff leg', 'hip hinge'],
  category: 'hinge',
  keyPoints: [
    'Standing tall, bar at hip, soft knee bend',
    'Push hips BACK, not down. Bar stays close to legs',
    'Feel hamstring stretch — stop there, not at the floor',
    'Drive hips forward, squeeze glutes to come up',
  ],
  cameraAngle: 'side',
  cameraNote: 'Phone directly to your side, at hip height, whole body in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'deadlift.hip_height', label: 'Hip height' },
    { checkId: 'deadlift.bar_path',   label: 'Bar path' },
    { checkId: 'deadlift.hip_level',  label: 'Uneven hips' },
    { checkId: 'deadlift.lockout',    label: 'Lockout' },
  ],
  targetMuscles: ['Hamstrings', 'Glutes', 'Erectors'],
  angleChecks: [
    { joint: 'left_hip', label: 'Hip Angle', minDeg: 60, maxDeg: 110, tooLowMsg: 'Going too low — stop when you feel hamstring tension', tooHighMsg: 'Not enough hip hinge — push hips back more', goodMsg: 'Hip hinge good' },
    { joint: 'left_knee', label: 'Knee Bend', minDeg: 145, maxDeg: 175, tooLowMsg: 'Knees bending too much — this becomes a deadlift', tooHighMsg: 'Knees too locked — slight soft bend', goodMsg: 'Knee angle correct' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Standing tall, bar at hip, soft knee bend' },
    { phase: 'descent', description: 'Push hips BACK, not down. Bar stays close to legs' },
    { phase: 'bottom',  description: 'Feel hamstring stretch — stop there, not at the floor' },
    { phase: 'ascent',  description: 'Drive hips forward, squeeze glutes to come up' },
    { phase: 'top',     description: 'Full hip extension, brief pause, neutral spine throughout' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'You should FEEL your hamstrings stretching, not see the bar touching the floor. Stop where you feel it.' },
    { coachId: 'nippard', cue: 'RDL works the hamstrings through a long range. If your back rounds before you feel your hamstrings — your hamstring mobility is the limiter.' },
    { coachId: 'dr_mike', cue: 'This is one of the best hamstring mass builders. 3 seconds eccentric minimum to maximize tension.' },
    { coachId: 'arnold', cue: 'Push the glutes back as if you are reaching for a wall behind you. Let the bar follow your legs down.' },
    { coachId: 'ct_fletcher', cue: 'SLOW DOWN. THE NEGATIVE IS WHERE THE MUSCLE IS BUILT. DO NOT RUSH.' },
  ],
  commonMistakes: ['Rounding the lower back', 'Bar drifting forward', 'Bending knees too much', 'Going past range of motion'],
  breathingCue: 'Exhale at top → inhale and brace → slow descent → exhale driving up',
};

// ─────────────────────────────────────────────────────────────────────────────
// PUSH PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const bench_press: ExerciseForm = {
  id: 'bench_press',
  exerciseName: 'Bench Press',
  // 'flat dumbbell press' must outrank overhead_press's 'dumbbell press'.
  keywords: ['bench press', 'bench', 'barbell press', 'chest press', 'flat dumbbell press'],
  category: 'push',
  keyPoints: [
    'Retract and depress scapulae, arch naturally, feet flat',
    'Bar travels to lower chest, elbows at ~75° to torso',
    'Bar touches chest, maintain arch, elbows just below 90°',
    'Drive bar up and slightly back toward rack',
    'Full extension, slight elbow lock, do not flare at top',
  ],
  // elbow_flare/wrist_stack are x-offsets (foot-of-bench view); lockout wants
  // some side component — hence the offset rather than straight-on.
  cameraAngle: 'front_45',
  cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
  // v2: v1 was a colour test pattern used to prove the pipeline, and devices
  // that fetched it hold it in cache under that name forever (the cache path
  // is the hit test). Never overwrite a version; bump it.
  tutorial: { version: 2, durationSec: 10 },
  detectedFaults: [
    { checkId: 'press.elbow_flare', label: 'Elbow flare' },
    { checkId: 'press.wrist_stack', label: 'Wrist stack' },
    { checkId: 'press.lockout',     label: 'Lockout' },
    { checkId: 'press.torso_stack', label: 'Torso lean' },
  ],
  targetMuscles: ['Chest', 'Front Delts', 'Triceps'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 60, maxDeg: 90, tooLowMsg: 'ELBOWS TOO NARROW — flare out to 45–75°', tooHighMsg: 'ELBOWS TOO WIDE — tuck to ~75° to protect shoulder', goodMsg: 'Elbow angle solid' },
    { joint: 'right_elbow', label: 'R. Elbow', minDeg: 60, maxDeg: 90, tooLowMsg: 'ELBOWS TOO NARROW', tooHighMsg: 'ELBOWS TOO WIDE — tuck to 75°', goodMsg: 'Elbow angle solid' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Retract and depress scapulae, arch naturally, feet flat' },
    { phase: 'descent', description: 'Bar travels to lower chest, elbows at ~75° to torso' },
    { phase: 'bottom',  description: 'Bar touches chest, maintain arch, elbows just below 90°' },
    { phase: 'ascent',  description: 'Drive bar up and slightly back toward rack' },
    { phase: 'top',     description: 'Full extension, slight elbow lock, do not flare at top' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Think about PUSHING the bench away from the bar, not the bar away from your chest. It changes everything.' },
    { coachId: 'arnold', cue: 'I always flared slightly at the top to get that full chest stretch at the bottom. Touch the chest — feel the pec.' },
    { coachId: 'nippard', cue: 'Elbow angle of ~75° (not 90°) reduces shoulder impingement risk significantly. Evidence is clear on this.' },
    { coachId: 'ct_fletcher', cue: 'THE CHEST MUST TOUCH THE BAR. HALF REPS DON\'T COUNT.' },
    { coachId: 'dr_mike', cue: 'Leg drive through the floor + full body tension = more pounds on the bar. This is not cheating — it is technique.' },
  ],
  commonMistakes: ['Bar bouncing off chest', 'Elbows flared at 90°', 'Losing scapular retraction', 'Arching too extreme', 'Uneven bar path'],
  breathingCue: 'Inhale at top → hold and brace → lower → exhale forcefully driving up',
};

const incline_db_press: ExerciseForm = {
  id: 'incline_db_press',
  exerciseName: 'Incline Dumbbell Press',
  // 'incline barbell press' must outrank bench_press's 'barbell press'. The bare
  // 'incline' stays as a last resort, which is why bicep_curl carries explicit
  // 'incline curl' keywords — otherwise an incline curl lands here.
  keywords: ['incline db press', 'incline dumbbell', 'incline barbell press', 'incline press', 'incline'],
  category: 'push',
  keyPoints: [
    '30–45° incline, dumbbells at shoulder, neutral or pronated grip',
    'Lower DBs controlled to upper chest, elbows just below shoulder line',
    'DBs at upper chest, feel the stretch, maintain scapular retraction',
    'Press up and slightly inward, maintain arch throughout',
    'DBs together at top, squeeze chest, full extension without lockout',
  ],
  cameraAngle: 'front_45',
  cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'press.elbow_flare', label: 'Elbow flare' },
    { checkId: 'press.wrist_stack', label: 'Wrist stack' },
    { checkId: 'press.lockout',     label: 'Lockout' },
    { checkId: 'press.torso_stack', label: 'Torso lean' },
  ],
  targetMuscles: ['Upper Chest', 'Front Delts', 'Triceps'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 65, maxDeg: 95, tooLowMsg: 'ELBOWS TOO NARROW — let them flare naturally', tooHighMsg: 'ELBOWS TOO WIDE — tuck to protect shoulder joint', goodMsg: 'Elbow position good' },
    { joint: 'right_elbow', label: 'R. Elbow', minDeg: 65, maxDeg: 95, tooLowMsg: 'ELBOWS TOO NARROW', tooHighMsg: 'ELBOWS TOO WIDE', goodMsg: 'Elbow position good' },
  ],
  checkpoints: [
    { phase: 'setup',   description: '30–45° incline, dumbbells at shoulder, neutral or pronated grip' },
    { phase: 'descent', description: 'Lower DBs controlled to upper chest, elbows just below shoulder line' },
    { phase: 'bottom',  description: 'DBs at upper chest, feel the stretch, maintain scapular retraction' },
    { phase: 'ascent',  description: 'Press up and slightly inward, maintain arch throughout' },
    { phase: 'top',     description: 'DBs together at top, squeeze chest, full extension without lockout' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Incline DB is my number one upper chest builder. Controlled tempo — 3 seconds down, explosive up. Stay humble on the weight.' },
    { coachId: 'arnold', cue: 'The dumbbells allow you to get a deeper stretch than the bar. Use that range. Squeeze hard at the top.' },
    { coachId: 'nippard', cue: '30–45° is the sweet spot for upper chest emphasis. Higher than that shifts to front delts.' },
    { coachId: 'ct_fletcher', cue: 'I WANT FULL RANGE. TOUCH THOSE DBs AT THE TOP. PROVE THE MUSCLE IS WORKING.' },
    { coachId: 'dr_mike', cue: 'Use a tempo — 2 seconds down, pause, explosive up. Time under tension drives upper chest growth.' },
  ],
  commonMistakes: ['Too steep an incline (45°+)', 'Not reaching full stretch at bottom', 'DBs not touching at top', 'Losing shoulder retraction', 'Rushing eccentric'],
  breathingCue: 'Inhale at top or during descent → exhale pressing up',
};

const overhead_press: ExerciseForm = {
  id: 'overhead_press',
  exerciseName: 'Overhead Press',
  // Seated pressing is overhead pressing: 'seated barbell press' used to fall to
  // bench via 'barbell press', and the dumbbell variants matched nothing at all,
  // which is why the default program's day-openers had no Form Check.
  keywords: [
    'overhead press', 'shoulder press', 'military press', 'ohp', 'seated press',
    'seated barbell press', 'seated dumbbell press', 'dumbbell press',
  ],
  category: 'push',
  keyPoints: [
    'Bar on front delts, elbows slightly in front of bar, core tight',
    'Press straight up — head moves back slightly then forward',
    'Lockout overhead, shrug at top, biceps by ears',
    'Bar returns to front delts, elbows forward of bar',
  ],
  // elbow_flare and wrist_stack are frontal offsets; torso_stack still reads a
  // lean from front-ish, so straight-on is the honest choice here.
  cameraAngle: 'front',
  cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'press.elbow_flare', label: 'Elbow flare' },
    { checkId: 'press.wrist_stack', label: 'Wrist stack' },
    { checkId: 'press.lockout',     label: 'Lockout' },
    { checkId: 'press.torso_stack', label: 'Torso lean' },
  ],
  targetMuscles: ['Front Delts', 'Side Delts', 'Triceps', 'Upper Traps'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 70, maxDeg: 100, tooLowMsg: 'ELBOWS TOO NARROW — push them forward', tooHighMsg: 'ELBOWS TOO WIDE — move slightly forward of bar', goodMsg: 'Elbow position correct' },
    { joint: 'right_elbow', label: 'R. Elbow', minDeg: 70, maxDeg: 100, tooLowMsg: 'ELBOWS TOO NARROW', tooHighMsg: 'ELBOWS TOO WIDE', goodMsg: 'Elbow position correct' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Bar on front delts, elbows slightly in front of bar, core tight' },
    { phase: 'ascent',  description: 'Press straight up — head moves back slightly then forward' },
    { phase: 'top',     description: 'Lockout overhead, shrug at top, biceps by ears' },
    { phase: 'descent', description: 'Bar returns to front delts, elbows forward of bar' },
    { phase: 'bottom',  description: 'Brief pause, brace again, repeat' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Squeeze your glutes and brace your core so hard you cannot move your lower back. All the power goes to the press.' },
    { coachId: 'arnold', cue: 'Behind the neck press built my shoulders. But for safety — press in front, shrug at the top, feel the traps.' },
    { coachId: 'nippard', cue: 'Head moves OUT of the way as bar passes — then back IN underneath. This keeps the bar path vertical.' },
    { coachId: 'ct_fletcher', cue: 'PRESS TO THE SKY. LOCK OUT. SHRUG. SHOW THOSE DELTS YOU MEAN BUSINESS.' },
    { coachId: 'dr_mike', cue: 'Seated OHP removes the leg drive variable — pure shoulder stimulus. Use it for isolation when barbell goes overhead.' },
  ],
  commonMistakes: ['Lower back hyperextension', 'Pressing in front of head not above', 'Not locking out', 'Elbows too wide', 'Bar drifting forward'],
  breathingCue: 'Inhale and brace before press → exhale as bar passes forehead',
};

const lateral_raise: ExerciseForm = {
  id: 'lateral_raise',
  exerciseName: 'Lateral Raise',
  keywords: ['lateral raise', 'side raise', 'side lateral'],
  category: 'isolation',
  // The elbow stays at ~130–170° for the whole rep (see angleChecks), which is
  // below the curl profile's minimum sweep — the camera would open and never
  // count a rep. No honest profile exists yet, so no live analysis is offered.
  visionCategory: null,
  keyPoints: [
    'Slight forward lean, DBs at hips, slight elbow bend',
    'Raise to shoulder height — pinky slightly higher than thumb (pour)',
    'Hold 1 second at top, delts fully contracted',
    '3 seconds down — the eccentric builds the muscle',
    'DBs just off hips, maintain tension, do not rest',
  ],
  cameraAngle: 'front',
  cameraNote: 'Phone straight in front, at chest height, both arms in frame',
  tutorial: null,
  targetMuscles: ['Side Delts', 'Supraspinatus'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 130, maxDeg: 170, tooLowMsg: 'Elbow bending too much — keep slight bend only', tooHighMsg: 'Arms too straight — risk of bicep tendon stress', goodMsg: 'Arm angle good' },
    { joint: 'right_elbow', label: 'R. Elbow', minDeg: 130, maxDeg: 170, tooLowMsg: 'Elbow bending too much', tooHighMsg: 'Arms fully locked', goodMsg: 'Arm angle good' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Slight forward lean, DBs at hips, slight elbow bend' },
    { phase: 'ascent',  description: 'Raise to shoulder height — pinky slightly higher than thumb (pour)' },
    { phase: 'top',     description: 'Hold 1 second at top, delts fully contracted' },
    { phase: 'descent', description: '3 seconds down — the eccentric builds the muscle' },
    { phase: 'bottom',  description: 'DBs just off hips, maintain tension, do not rest' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'SLOW down the eccentric. 3 seconds down. You\'ll feel them next set, I promise. Light weight, perfect form.' },
    { coachId: 'arnold', cue: 'Think of pouring water from a jug at the top — this hits the medial delt perfectly. The pump is everything.' },
    { coachId: 'nippard', cue: 'Lean forward ~30° — this puts the side delt in a mechanically advantaged position. Cable laterals > DBs for consistent tension.' },
    { coachId: 'ct_fletcher', cue: 'SQUEEZE THOSE DELTS AT THE TOP. HOLD IT. FEEL THE BURN. THAT\'S THE MUSCLE WORKING.' },
    { coachId: 'dr_mike', cue: 'Lateral raise machines and cables are far superior to DBs for tension curve. But if DB — slow the eccentric to 4 seconds.' },
  ],
  commonMistakes: ['Using momentum/swinging', 'Too heavy — reduces ROM', 'Not holding at top', 'Rushing eccentric', 'Shrugging traps at top'],
  breathingCue: 'Exhale raising → inhale slowly lowering',
};

// ─────────────────────────────────────────────────────────────────────────────
// PULL PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const pullup: ExerciseForm = {
  id: 'pullup',
  exerciseName: 'Pull-Up',
  keywords: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'lat pulldown'],
  category: 'pull',
  keyPoints: [
    'Dead hang, shoulder-width grip, depress and retract scapulae',
    'Lead with elbows, drive them toward hips, chest forward',
    'Chin over bar, chest to bar ideally, squeeze lats hard',
    'Controlled — 2–3 seconds down to full dead hang',
  ],
  // torso_swing, full_stretch and elbow_drive all read best in profile.
  cameraAngle: 'side',
  cameraNote: 'Phone to your side, at chest height, full hang to chin-over-bar in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'pull.elbow_drive',   label: 'Elbow drive' },
    { checkId: 'pull.shoulder_pack', label: 'Shrugged shoulders' },
    { checkId: 'pull.torso_swing',   label: 'Body swing' },
    { checkId: 'pull.full_stretch',  label: 'Full hang' },
  ],
  targetMuscles: ['Lats', 'Biceps', 'Rear Delts', 'Rhomboids'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 20, maxDeg: 80, tooLowMsg: 'INCOMPLETE PULL — drive elbows to hips, squeeze lats', tooHighMsg: 'Arms not bent enough — you are at the bottom position', goodMsg: 'At the top — great pull' },
    { joint: 'right_elbow', label: 'R. Elbow', minDeg: 20, maxDeg: 80, tooLowMsg: 'INCOMPLETE PULL — drive elbows to hips', tooHighMsg: 'At bottom position', goodMsg: 'Great pull' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Dead hang, shoulder-width grip, depress and retract scapulae' },
    { phase: 'ascent',  description: 'Lead with elbows, drive them toward hips, chest forward' },
    { phase: 'top',     description: 'Chin over bar, chest to bar ideally, squeeze lats hard' },
    { phase: 'descent', description: 'Controlled — 2–3 seconds down to full dead hang' },
    { phase: 'bottom',  description: 'Full hang — allow scapulae to elevate briefly, then reset' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Think "elbows to back pockets" — not pulling your chin up, but driving your elbows DOWN.' },
    { coachId: 'arnold', cue: 'The pull-up built my back width more than anything else. Full stretch at the bottom — full contraction at the top.' },
    { coachId: 'nippard', cue: 'Scapular depression and retraction before initiating the pull reduces shoulder impingement risk by 40% per EMG data.' },
    { coachId: 'ct_fletcher', cue: 'CHEST TO THE BAR. IF YOUR CHIN BARELY CLEARS, THAT\'S NOT A PULL-UP, THAT\'S A SUGGESTION.' },
    { coachId: 'dr_mike', cue: 'Weighted pull-ups are the best lat builder for advanced lifters. Use a belt. Progressive overload here is limitless.' },
  ],
  commonMistakes: ['Kipping / using momentum', 'Not reaching full hang at bottom', 'Chin barely over bar', 'Shrugging instead of lat engagement', 'Too wide a grip'],
  breathingCue: 'Exhale driving up → inhale lowering down',
};

const barbell_row: ExerciseForm = {
  id: 'barbell_row',
  exerciseName: 'Barbell Row',
  keywords: ['barbell row', 'bent over row', 'bb row', 'pendlay row'],
  category: 'pull',
  keyPoints: [
    'Hinge to ~45°, overhand grip just outside hips, neutral spine',
    'Drive elbows back and up, bar travels to lower chest / navel',
    'Bar touches body, squeeze scapulae together hard',
    'Lower with control — 2 seconds — maintain hinge position',
  ],
  // torso_swing self-silences once hinged; full_stretch is an elbow angle that
  // only the side view resolves.
  cameraAngle: 'side',
  cameraNote: 'Phone directly to your side, at hip height, bar and torso in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'pull.elbow_drive',   label: 'Elbow drive' },
    { checkId: 'pull.shoulder_pack', label: 'Shrugged shoulders' },
    { checkId: 'pull.torso_swing',   label: 'Body swing' },
    { checkId: 'pull.full_stretch',  label: 'Full stretch' },
  ],
  targetMuscles: ['Lats', 'Rhomboids', 'Rear Delts', 'Biceps', 'Erectors'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Elbow', minDeg: 30, maxDeg: 80, tooLowMsg: 'INCOMPLETE ROW — pull bar all the way to lower chest', tooHighMsg: 'Arms barely bent — row is incomplete', goodMsg: 'Full row — good range' },
    { joint: 'left_hip', label: 'Torso Angle', minDeg: 35, maxDeg: 70, tooLowMsg: 'Torso too upright — lean to ~45° for lat emphasis', tooHighMsg: 'Torso too parallel — risk of lower back strain', goodMsg: 'Torso angle correct' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Hinge to ~45°, overhand grip just outside hips, neutral spine' },
    { phase: 'ascent',  description: 'Drive elbows back and up, bar travels to lower chest / navel' },
    { phase: 'top',     description: 'Bar touches body, squeeze scapulae together hard' },
    { phase: 'descent', description: 'Lower with control — 2 seconds — maintain hinge position' },
    { phase: 'bottom',  description: 'Full extension, lats stretched, maintain hinge' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Think "row the bar into your belly button" — not up toward your chin. That hits the lats, not the traps.' },
    { coachId: 'arnold', cue: 'The bent-over row was the foundation of my back. Wide grip for lats. Squeeze hard at the top — make the back work.' },
    { coachId: 'nippard', cue: 'Torso angle determines which muscle is emphasized. 45° hits lats. More upright = more upper back and traps.' },
    { coachId: 'ct_fletcher', cue: 'ROW HARD. EVERY REP. MAKE THAT BAR TOUCH YOUR BODY. HALF ROWS BUILD HALF BACKS.' },
    { coachId: 'dr_mike', cue: 'Pendlay rows (dead stop) are fantastic for power development. Strict rows for hypertrophy — your choice based on goal.' },
  ],
  commonMistakes: ['Jerking with lower back', 'Torso rising on each rep', 'Bar not touching body', 'Too wide a grip for lats', 'Not squeezing at top'],
  breathingCue: 'Inhale and brace → exhale pulling up → inhale lowering',
};

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const bicep_curl: ExerciseForm = {
  id: 'bicep_curl',
  exerciseName: 'Bicep Curl',
  // The two 'incline …' keywords exist to beat incline_db_press's 'incline' /
  // 'incline dumbbell' on length; without them an incline curl was graded as a
  // press.
  keywords: [
    'curl', 'bicep curl', 'barbell curl', 'dumbbell curl', 'hammer curl', 'preacher', 'spider curl',
    'incline curl', 'incline dumbbell curl',
  ],
  category: 'isolation',
  keyPoints: [
    'Standing tall, elbows pinned to sides, supinated grip',
    'Curl without moving upper arm — elbow stays at side',
    'Squeeze bicep hard for 1 second at top',
    '3 seconds down — do NOT drop the weight',
    'Full extension — let the bicep stretch completely',
  ],
  // body_swing is a shoulder-over-hip lean, full_extension an elbow angle: side.
  cameraAngle: 'side',
  cameraNote: 'Phone to your side, at elbow height, shoulders to hips in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'curl.elbow_drift',    label: 'Elbow drift' },
    { checkId: 'curl.body_swing',     label: 'Body swing' },
    { checkId: 'curl.full_extension', label: 'Full extension' },
  ],
  targetMuscles: ['Biceps', 'Brachialis', 'Brachioradialis'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Curl', minDeg: 20, maxDeg: 60, tooLowMsg: 'PAST PEAK — do not curl past 45°, control the negative', tooHighMsg: 'INCOMPLETE CURL — bring all the way up, squeeze at top', goodMsg: 'Full curl — great range' },
    { joint: 'right_elbow', label: 'R. Curl', minDeg: 20, maxDeg: 60, tooLowMsg: 'Past peak — control the negative', tooHighMsg: 'INCOMPLETE CURL — curl all the way up', goodMsg: 'Full curl — great range' },
    { joint: 'left_hip', label: 'Body Swing', minDeg: 155, maxDeg: 180, tooLowMsg: 'BODY SWINGING — isolate the elbow, no momentum', tooHighMsg: 'Perfect isolation', goodMsg: 'No body swing — clean rep' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Standing tall, elbows pinned to sides, supinated grip' },
    { phase: 'ascent',  description: 'Curl without moving upper arm — elbow stays at side' },
    { phase: 'top',     description: 'Squeeze bicep hard for 1 second at top' },
    { phase: 'descent', description: '3 seconds down — do NOT drop the weight' },
    { phase: 'bottom',  description: 'Full extension — let the bicep stretch completely' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Pin your elbows to your sides — they should not move an inch. That swinging is ego, not gains.' },
    { coachId: 'arnold', cue: 'I always used a slight supination at the top — twist the wrist outward. This peaks the bicep perfectly.' },
    { coachId: 'nippard', cue: 'The full stretch at the bottom is where most growth stimulus comes from. Do not cut the ROM short.' },
    { coachId: 'ct_fletcher', cue: 'I COMMAND YOU — NO SWINGING. IF YOU SWING, LOWER THE WEIGHT. EARN THE CURL.' },
    { coachId: 'dr_mike', cue: 'Incline DBs for curls give a longer length partition — superior stimulus. Stretch-mediated hypertrophy is real.' },
  ],
  commonMistakes: ['Swinging the body', 'Elbows drifting forward', 'Not reaching full extension', 'Dropping the weight on the negative', 'Wrists bending back'],
  breathingCue: 'Exhale curling up → inhale slowly lowering',
};

const tricep_pushdown: ExerciseForm = {
  id: 'tricep_pushdown',
  exerciseName: 'Tricep Pushdown',
  // No 'tricep extension' keyword: it dragged the OVERHEAD extension in here,
  // where the curl profile's elbow_drift reads an elbow above the shoulder as a
  // critical fault on every rep. Better no match than a wrong one.
  keywords: ['tricep pushdown', 'pushdown', 'rope pushdown', 'cable pushdown'],
  category: 'isolation',
  keyPoints: [
    'Elbows at sides, slight forward lean, upper arms vertical',
    'Drive hands down keeping elbows pinned to sides',
    'Full lockout — pause 1 second, squeeze triceps',
    'Controlled return to 90° — do not go past perpendicular',
  ],
  cameraAngle: 'side',
  cameraNote: 'Phone to your side, at elbow height, shoulders to hands in frame',
  tutorial: null,
  detectedFaults: [
    { checkId: 'curl.elbow_drift',    label: 'Elbow drift' },
    { checkId: 'curl.body_swing',     label: 'Body swing' },
    { checkId: 'curl.full_extension', label: 'Lockout' },
  ],
  targetMuscles: ['Triceps (all 3 heads)'],
  angleChecks: [
    { joint: 'left_elbow', label: 'L. Extension', minDeg: 165, maxDeg: 180, tooLowMsg: 'INCOMPLETE EXTENSION — lock out fully at bottom', tooHighMsg: 'Full lockout — hold 1 second and squeeze', goodMsg: 'Full tricep extension' },
    { joint: 'right_elbow', label: 'R. Extension', minDeg: 165, maxDeg: 180, tooLowMsg: 'INCOMPLETE EXTENSION — push all the way down', tooHighMsg: 'Full lockout', goodMsg: 'Full extension' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Elbows at sides, slight forward lean, upper arms vertical' },
    { phase: 'descent', description: 'Drive hands down keeping elbows pinned to sides' },
    { phase: 'bottom',  description: 'Full lockout — pause 1 second, squeeze triceps' },
    { phase: 'ascent',  description: 'Controlled return to 90° — do not go past perpendicular' },
    { phase: 'top',     description: 'Elbows at ~90°, feel tricep stretch, repeat' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Elbows LOCKED at the bottom. That squeeze tells the tricep it has done its job. Do not skip it.' },
    { coachId: 'arnold', cue: 'The tricep is 2/3 of the arm. It must be trained hard and heavy. Full extension every single rep.' },
    { coachId: 'nippard', cue: 'Overhead tricep extension > pushdown for long head. Combine both for complete development.' },
    { coachId: 'ct_fletcher', cue: 'LOCK IT OUT. SQUEEZE. HOLD. IF YOU CANNOT FEEL IT — YOU ARE NOT DOING IT RIGHT.' },
    { coachId: 'dr_mike', cue: 'Rope pushdowns allow wrist rotation at the bottom for a harder tricep squeeze. Worth using over straight bar.' },
  ],
  commonMistakes: ['Elbows drifting forward', 'Not locking out at bottom', 'Using body momentum', 'Wrists bending', 'Going too heavy and losing form'],
  breathingCue: 'Exhale pushing down → inhale returning up',
};

const leg_curl: ExerciseForm = {
  id: 'leg_curl',
  exerciseName: 'Leg Curl',
  // Specific 'leg curl' / 'hamstring curl' keywords so this wins over the
  // bicep_curl bare 'curl' keyword (the matcher prefers the longest match).
  keywords: ['leg curl', 'lying leg curl', 'seated leg curl', 'standing leg curl', 'hamstring curl'],
  category: 'isolation',
  // The 'curl' profile is elbow-driven and requires the arm joints; a lying
  // hamstring curl has no elbow cycle, so it could never count a rep. Until a
  // knee-flexion profile exists this stays text-only.
  visionCategory: null,
  keyPoints: [
    'Pad on lower calf, hips pressed into the bench, toes neutral',
    'Curl heels toward your glutes — no hip lift',
    'Squeeze the hamstrings hard at full flexion',
    '3 seconds lowering — control the negative',
    'Stop just short of lockout — keep tension on the muscle',
  ],
  cameraAngle: 'side',
  cameraNote: 'Phone to your side, at bench height, hips to heels in frame',
  tutorial: null,
  targetMuscles: ['Hamstrings', 'Calves (gastrocnemius)'],
  angleChecks: [
    { joint: 'left_knee', label: 'L. Curl', minDeg: 30, maxDeg: 95, tooLowMsg: 'Curl deeper — bring your heel toward your glute', tooHighMsg: 'Full knee flexion — squeeze the hamstring', goodMsg: 'Full hamstring contraction' },
    { joint: 'right_knee', label: 'R. Curl', minDeg: 30, maxDeg: 95, tooLowMsg: 'Curl deeper — heel to glute', tooHighMsg: 'Full flexion — squeeze', goodMsg: 'Full contraction' },
  ],
  checkpoints: [
    { phase: 'setup',   description: 'Pad on lower calf, hips pressed into the bench, toes neutral' },
    { phase: 'ascent',  description: 'Curl heels toward your glutes — no hip lift' },
    { phase: 'top',     description: 'Squeeze the hamstrings hard at full flexion' },
    { phase: 'descent', description: '3 seconds lowering — control the negative' },
    { phase: 'bottom',  description: 'Stop just short of lockout — keep tension on the muscle' },
  ],
  coachCues: [
    { coachId: 'cbum',   cue: 'Keep your hips glued to the pad — if they lift, you are cheating the hamstring out of the work.' },
    { coachId: 'arnold', cue: 'Point your toes to bias the hamstring belly, full squeeze at the top every rep.' },
    { coachId: 'nippard', cue: 'Seated leg curls train the hamstrings at longer muscle lengths — slightly better for growth than lying.' },
    { coachId: 'ct_fletcher', cue: 'HIPS DOWN. CURL HARD. SQUEEZE THE HAM. NO BOUNCING THE STACK.' },
    { coachId: 'dr_mike', cue: 'Control the eccentric — hamstrings respond to lengthened tension. Do not let the stack slam.' },
  ],
  commonMistakes: ['Hips lifting off the pad', 'Bouncing / using momentum', 'Partial range of motion', 'Slamming the weight down'],
  breathingCue: 'Exhale curling up → inhale lowering',
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER LIBRARY + LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_FORM_LIBRARY: ExerciseForm[] = [
  leg_curl,
  barbell_squat,
  goblet_squat,
  lunge,
  deadlift,
  romanian_deadlift,
  bench_press,
  incline_db_press,
  overhead_press,
  lateral_raise,
  pullup,
  barbell_row,
  bicep_curl,
  tricep_pushdown,
];

/**
 * Lower-case, hyphens/underscores → space, whitespace collapsed. Applied to the
 * incoming name AND to every keyword, so 'Step-Up' meets 'step up' and the
 * keyword lists do not have to enumerate punctuation variants.
 */
function normaliseName(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getExerciseForm(exerciseName: string): ExerciseForm | null {
  const name = normaliseName(exerciseName);
  if (!name) return null;

  // An exact title always wins. Without this pass 'Romanian Deadlift' is decided
  // by keyword length against deadlift's 'deadlift', i.e. by accident.
  const exact = EXERCISE_FORM_LIBRARY.find((ef) => normaliseName(ef.exerciseName) === name);
  if (exact) return exact;

  // Most-specific match wins: pick the form whose LONGEST matching keyword is
  // longest overall. This stops generic keywords (e.g. bicep_curl's bare
  // 'curl') from hijacking specific exercises like "seated leg curl". Equal
  // lengths keep the first entry in library order.
  let best: ExerciseForm | null = null;
  let bestLen = 0;
  for (const ef of EXERCISE_FORM_LIBRARY) {
    for (const raw of ef.keywords) {
      const kw = normaliseName(raw);
      if (kw && name.includes(kw) && kw.length > bestLen) {
        best = ef;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

/**
 * The stable key an exercise's tutorial memory and clips live under: the form
 * id when we have an entry, else a slug of the name so uncovered exercises
 * (Rack Pull, Leg Press…) still remember "seen it".
 */
export function getExerciseFormKey(exerciseName: string): string {
  const form = getExerciseForm(exerciseName);
  if (form) return form.id;
  return (exerciseName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Callers hand us whatever they have — a PersonaId ('ct_fletcher'), a program
 * id ('ct_strength', 'dr_mike_mav') or the legacy spellings this table used to
 * carry ('ct', 'drmike'). Same prefix rules as personaFromProgramId, so every
 * vocabulary lands on one PersonaId; anything unrecognised is returned as-is
 * and simply fails the lookup below.
 */
function coachIdToPersona(coachId: string): string {
  const id = (coachId ?? '').toLowerCase();
  if (id.startsWith('cbum'))                               return 'cbum';
  if (id.startsWith('arnold'))                             return 'arnold';
  if (id.startsWith('nippard'))                            return 'nippard';
  if (id === 'ct' || id.startsWith('ct_'))                 return 'ct_fletcher';
  if (id.startsWith('drmike') || id.startsWith('dr_mike')) return 'dr_mike';
  return id;
}

export function getCoachCue(form: ExerciseForm, coachId: string): string {
  const persona = coachIdToPersona(coachId);
  const cue = form.coachCues.find((c) => c.coachId === persona);
  return cue?.cue ?? form.coachCues[0]?.cue ?? 'Focus on controlled form and mind-muscle connection.';
}

/**
 * Tips as the workout screens already show them: the exercise library first,
 * then the expert programs (first match wins, as form-coach's lookup did), else
 * nothing — callers decide what an empty list looks like.
 */
export function tipsForExercise(exerciseName: string): string[] {
  const name = normaliseName(exerciseName);
  if (!name) return [];
  for (const group of EXERCISE_LIBRARY) {
    const ex = group.exercises.find((e) => normaliseName(e.name) === name);
    if (ex) return ex.tips;
  }
  for (const program of Object.values(EXPERT_PROGRAMS)) {
    for (const day of program.schedule) {
      const ex = day.exercises.find((e) => normaliseName(e.name) === name);
      if (ex) return ex.tips;
    }
  }
  return [];
}

/**
 * KEY POINTS for the technique card. Authored key points → checkpoint text →
 * the exercise's own tips, so every exercise the user can tap has something to
 * read even when we have no form entry for it.
 */
export function keyPointsFor(exerciseName: string): string[] {
  const form = getExerciseForm(exerciseName);
  if (form?.keyPoints?.length) return form.keyPoints;
  if (form?.checkpoints?.length) return form.checkpoints.map((c) => c.description);
  return tipsForExercise(exerciseName);
}

// ─────────────────────────────────────────────────────────────────────────────
// VISION COVERAGE
//
// This library and lib/vision/biomechanics.ts grew separate vocabularies, and
// nothing bridged them: 'push' never matched the engine's 'press', 'isolation'
// never matched 'curl', 'hinge' never matched 'deadlift'. getProfile() falls back
// to the 'general' profile, whose checks array is EMPTY — so those exercises
// silently produced no form analysis at all while still advertising a FORM CHECK
// button. Only 'squat' and 'pull' happened to line up.
//
// Mapping them here keeps one source of truth for "can we actually judge this?".
// ─────────────────────────────────────────────────────────────────────────────

/** Engine profile keys that declare real checks (biomechanics.ts PROFILES). */
export type VisionCategory = 'squat' | 'deadlift' | 'lunge' | 'press' | 'pull' | 'curl';

const CATEGORY_TO_VISION: Record<ExerciseForm['category'], VisionCategory | null> = {
  squat:     'squat',
  hinge:     'deadlift',
  push:      'press',
  pull:      'pull',
  isolation: 'curl',
  // A loaded carry has no rep cycle to measure — there is no honest profile for
  // it, so it must not claim live form analysis.
  carry:     null,
};

/**
 * The engine category for an exercise, or null when we cannot judge it.
 *
 * A per-entry `visionCategory` wins over the category default — including an
 * explicit `null`, which is how an isolation entry opts OUT of the blanket
 * 'isolation' → 'curl' mapping when the curl profile cannot count its reps.
 */
export function visionCategoryFor(form: ExerciseForm | null): VisionCategory | null {
  if (!form) return null;
  return form.visionCategory !== undefined ? form.visionCategory : CATEGORY_TO_VISION[form.category];
}

/**
 * The landmarks the engine needs visible before it will grade this exercise,
 * straight from the profile so the setup checklist and the engine can never
 * disagree. Empty when there is no profile.
 */
export function requiredLandmarksFor(form: ExerciseForm | null): number[] {
  const category = visionCategoryFor(form);
  return category ? [...getProfile(category).requiredJoints] : [];
}

/**
 * Can the Form Coach genuinely analyse this exercise?
 *
 * The honest gate for showing a FORM CHECK affordance. False means the app has
 * no biomechanical profile for the movement — better to offer nothing than to
 * open a camera that watches and says nothing useful.
 */
export function hasVisionCoverage(exerciseName: string): boolean {
  return visionCategoryFor(getExerciseForm(exerciseName)) !== null;
}
