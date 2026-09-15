/**
 * Technique Cards
 *
 * Own technique content for every exercise in the workout library and the
 * expert programs that does NOT already own an `ExerciseForm` entry. A card is
 * the lighter sibling of an ExerciseForm: it carries the clip identity, the
 * setup figure's posture, the camera note and 3–5 key points — but no joint
 * angle table of its own. The engine profile that grades the lift (if any) is
 * named explicitly in `visionCategory`, and `detectedFaults` may only list
 * check ids that profile actually declares (tested against biomechanics.ts).
 *
 * Ids are final: each doubles as the clip filename stem (`<id>_v1.mp4`) and the
 * tutorial-memory key, so renaming one orphans a shipped clip.
 *
 * Key points reuse the exercise's own `tips` text from the workout library and
 * expert programs where it exists (the app's voice), completed with a setup, a
 * range and a control line. Nothing here is presented as a detection unless it
 * appears in `detectedFaults`.
 */

import type { VisionCategory } from '@/constants/exerciseFormLibrary';

export type CardPosture = 'standing' | 'seated' | 'lying' | 'prone' | 'hanging' | 'kneeling' | 'hinged';

export interface TechniqueCard {
  /** Catalog id — clip stem and tutorial-memory key. Never rename. */
  id: string;
  exerciseName: string;
  /** Display names this card IS (compared normalised). Spelling variants only, never another exercise. */
  aliases: string[];
  /** Drives the setup figure. */
  posture: CardPosture;
  /** The clip camera and the phone placement the setup step asks for. */
  cameraAngle: 'side' | 'front' | 'front_45';
  cameraNote: string;
  /** 3–5 imperative lines shown as KEY POINTS. */
  keyPoints: string[];
  /** Engine profile that grades this lift, or null when no honest profile exists. */
  visionCategory: VisionCategory | null;
  /** Only when visionCategory != null; ids must come from that profile's checks. */
  detectedFaults?: Array<{ checkId: string; label: string }>;
  /** Clips are found by convention as `<id>_v1.mp4`; set only when re-shooting. */
  tutorial?: { version: number; durationSec: number | null } | null;
}

// Shared fault lists — one per engine profile, labels fault-shaped.
const PRESS_FAULTS: TechniqueCard['detectedFaults'] = [
  { checkId: 'press.elbow_flare', label: 'Elbow flare' },
  { checkId: 'press.wrist_stack', label: 'Wrist stack' },
  { checkId: 'press.lockout',     label: 'Missed lockout' },
  { checkId: 'press.torso_stack', label: 'Torso lean' },
];

const PULL_FAULTS: TechniqueCard['detectedFaults'] = [
  { checkId: 'pull.elbow_drive',   label: 'Elbow drive' },
  { checkId: 'pull.shoulder_pack', label: 'Shrugged shoulders' },
  { checkId: 'pull.torso_swing',   label: 'Body swing' },
  { checkId: 'pull.full_stretch',  label: 'Full stretch' },
];

const CURL_FAULTS: TechniqueCard['detectedFaults'] = [
  { checkId: 'curl.elbow_drift',    label: 'Elbow drift' },
  { checkId: 'curl.body_swing',     label: 'Body swing' },
  { checkId: 'curl.full_extension', label: 'Full extension' },
];

const LUNGE_FAULTS: TechniqueCard['detectedFaults'] = [
  { checkId: 'lunge.shin_angle',     label: 'Shin angle' },
  { checkId: 'lunge.depth',          label: 'Depth' },
  { checkId: 'lunge.shoulder_level', label: 'Shoulder level' },
  { checkId: 'lunge.torso_lean',     label: 'Torso lean' },
];

const DEADLIFT_FAULTS: TechniqueCard['detectedFaults'] = [
  { checkId: 'deadlift.hip_height', label: 'Hip height' },
  { checkId: 'deadlift.bar_path',   label: 'Bar path' },
  { checkId: 'deadlift.hip_level',  label: 'Uneven hips' },
  { checkId: 'deadlift.lockout',    label: 'Missed lockout' },
];

export const TECHNIQUE_CARDS: TechniqueCard[] = [
  // ── Back / pulls ───────────────────────────────────────────────────────────
  {
    id: 'lat_pulldown',
    exerciseName: 'Lat Pulldown',
    aliases: ['Close-Grip Lat Pulldown', 'Wide-Grip Lat Pulldown', 'Lat Pull-Down'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at chest height, head to hips in frame',
    keyPoints: [
      'Lock the thighs under the pad and grip just wider than your shoulders.',
      'Arch back slightly, pull to upper chest.',
      'Drive elbows into pockets.',
      'Return to a full stretch overhead under control — no bouncing at the top.',
    ],
    visionCategory: 'pull',
    detectedFaults: PULL_FAULTS,
  },
  {
    id: 'seated_cable_row',
    exerciseName: 'Seated Cable Row',
    aliases: ['Cable Row', 'Cable Row (Seated)', 'Seated Row'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at chest height, hips to hands in frame',
    keyPoints: [
      'Sit tall with feet on the platform and a soft bend in the knees.',
      'Drive elbows back, squeeze.',
      'Elbows tight to body.',
      'Full stretch at front — reach with the shoulders, keep the torso upright.',
    ],
    // No honest profile yet — horizontal pull: elbow_drive reads a level elbow as a fault on every rep. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },
  {
    id: 'chest_supported_row',
    exerciseName: 'Chest-Supported Row',
    aliases: ['Incline Dumbbell Row', 'Chest-Supported Dumbbell Row'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at bench height, head to hips in frame',
    keyPoints: [
      'Set the bench to 30–45° and keep your chest glued to the pad.',
      'Row until the elbows pass the torso, squeezing the shoulder blades.',
      'Pause at peak contraction.',
      'No body English — lower to a full hang every rep.',
    ],
    // No honest profile yet — hinged pull: hands hang below the elbows at extension, so no rep is ever credited. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },
  {
    id: 't_bar_row',
    exerciseName: 'T-Bar Row',
    aliases: ['Landmine Row'],
    posture: 'hinged',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, bar and torso in frame',
    keyPoints: [
      'Hinge to about 45° with a flat back and the bar between your feet.',
      'Pull the handle to the lower chest, elbows driving back.',
      'Full range of motion — lower to straight arms without losing the hinge.',
      'Use chest pad for stability if your machine has one.',
    ],
    // No honest profile yet — hinged pull: hands hang below the elbows at extension, so no rep is ever credited. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },
  {
    id: 'single_arm_db_row',
    exerciseName: 'Single-Arm Dumbbell Row',
    aliases: ['One-Arm Dumbbell Row', 'One Arm Row', 'Single Arm Dumbbell Row'],
    posture: 'hinged',
    cameraAngle: 'side',
    cameraNote: 'Phone to the working side, at hip height, bench and torso in frame',
    keyPoints: [
      'One knee and one hand on the bench, torso parallel to the floor.',
      'Pull elbow to ceiling — think elbow, not hand.',
      'Row the dumbbell to the hip, not the shoulder.',
      'Full range: lower to a complete stretch without twisting the torso.',
    ],
    // No honest profile yet — hinged pull: hands hang below the elbows at extension, so no rep is ever credited. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },

  // ── Chest / presses ────────────────────────────────────────────────────────
  {
    id: 'incline_barbell_press',
    exerciseName: 'Incline Barbell Press',
    aliases: ['Incline Bench Press', 'Incline Barbell Bench Press'],
    posture: 'lying',
    cameraAngle: 'front_45',
    cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
    keyPoints: [
      'Set a 30–45° incline and pull your shoulder blades back and down.',
      'Lower the bar to the upper chest with the elbows about 45° from the torso.',
      'Pause at chest for max stretch.',
      'Press to a full lockout without lifting the hips off the bench.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'decline_bench_press',
    exerciseName: 'Decline Bench Press',
    aliases: ['Decline Barbell Press'],
    posture: 'lying',
    cameraAngle: 'front_45',
    cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
    keyPoints: [
      'Hook your feet under the rollers and set your shoulder blades on the bench.',
      'Lower the bar to the lower chest with the elbows tucked around 45°.',
      'Control the descent.',
      'Press to a full lockout with the wrists stacked over the elbows.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'close_grip_bench_press',
    exerciseName: 'Close-Grip Bench Press',
    aliases: ['Close Grip Bench', 'Close-Grip Bench'],
    posture: 'lying',
    cameraAngle: 'front_45',
    cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
    keyPoints: [
      'Shoulder-width grip.',
      'Elbows slightly tucked, tracking close to the torso.',
      'Touch sternum.',
      'Keep the wrists straight over the forearms.',
      'Full lockout at top.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'flat_dumbbell_press',
    exerciseName: 'Flat Dumbbell Press',
    aliases: ['Dumbbell Bench Press', 'Flat DB Press'],
    posture: 'lying',
    cameraAngle: 'front_45',
    cameraNote: 'Phone 30–45° from the foot of the bench, at bench height, both arms in frame',
    keyPoints: [
      'Lie flat with the feet planted and the shoulder blades pulled back.',
      'Lower the dumbbells beside the shoulders — deep stretch at bottom.',
      'Press up and slightly inward, squeeze hard at top.',
      'Keep the wrists stacked over the elbows for the whole rep.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },

  // ── Shoulders / overhead presses ───────────────────────────────────────────
  {
    id: 'seated_dumbbell_press',
    exerciseName: 'Seated Dumbbell Press',
    aliases: ['Seated DB Press', 'Dumbbell Shoulder Press', 'Seated Dumbbell Shoulder Press'],
    posture: 'seated',
    // Frontal: elbow_flare and wrist_stack are x-offsets across the shoulder
    // line, invisible from the side (see the overhead_press entry).
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Sit with your back on the upright pad, dumbbells at ear height.',
      'Press overhead to a full lockout without arching the lower back.',
      'Full range — lower back to ear height.',
      'Control the eccentric.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'machine_shoulder_press',
    exerciseName: 'Machine Shoulder Press',
    aliases: ['Seated Machine Press', 'Shoulder Press Machine'],
    posture: 'seated',
    // Frontal: elbow_flare and wrist_stack are x-offsets across the shoulder
    // line, invisible from the side (see the overhead_press entry).
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Set the seat so the handles start at shoulder height.',
      'Keep your back on the pad and press to lockout.',
      'Pause at top for contraction.',
      'Lower under control to shoulder height, elbows under the wrists.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'seated_barbell_press',
    exerciseName: 'Seated Barbell Press',
    aliases: ['Seated Overhead Press', 'Seated Military Press'],
    posture: 'seated',
    // Frontal: elbow_flare and wrist_stack are x-offsets across the shoulder
    // line, invisible from the side (see the overhead_press entry).
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Sit tall with the bar at the upper chest and the wrists stacked over the elbows.',
      'Strict form — no bounce from the legs or the lower back.',
      'Full overhead lockout, head passing through at the top.',
      'Lower to the chest under control.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },
  {
    id: 'rotating_db_press',
    exerciseName: 'Rotating DB Press',
    aliases: ['Arnold Press', 'Rotating Dumbbell Press'],
    posture: 'seated',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Start with the dumbbells in front of the shoulders, palms facing you.',
      'Turn the palms forward as you press — full rotation at top.',
      'Lock out overhead with the wrists stacked over the elbows.',
      'Reverse the rotation on the way down and keep the torso upright.',
    ],
    visionCategory: 'press',
    detectedFaults: PRESS_FAULTS,
  },

  // ── Bodyweight presses ─────────────────────────────────────────────────────
  {
    id: 'push_up',
    exerciseName: 'Push-Up',
    aliases: ['Pushup', 'Push Up', 'Standard Push-Up', 'Push-Ups', 'Pushups'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at floor level, whole body in frame',
    keyPoints: [
      'Hands under the shoulders, body in one straight line from head to heels.',
      'Elbows at 45°.',
      'Full chest-to-floor range.',
      'Press back to straight arms without letting the hips sag.',
    ],
    // No honest profile yet — hands on the floor: the press gate wants the wrist above the elbow at lockout. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },
  {
    id: 'diamond_push_up',
    exerciseName: 'Diamond Push-Up',
    aliases: ['Close-Grip Push-Up', 'Triangle Push-Up', 'Diamond Pushup'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at floor level, whole body in frame',
    keyPoints: [
      'Hands form diamond shape under the chest.',
      'Elbows stay close to body.',
      'Lower the chest to your hands with the body straight from head to heels.',
      'Press to a full lockout on every rep.',
    ],
    // No honest profile yet — hands on the floor: the press gate wants the wrist above the elbow at lockout. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },
  {
    id: 'tricep_dip',
    exerciseName: 'Tricep Dip',
    aliases: ['Dips (Tricep)', 'Dips', 'Parallel Bar Dip', 'Dip', 'Triceps Dip'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at chest height, head to knees in frame',
    keyPoints: [
      'Support yourself on the bars with straight arms and the knees bent behind you.',
      'Upright torso — leaning forward shifts the work to the chest.',
      'Lower until the upper arms are parallel with the floor.',
      'Full lockout at top.',
    ],
    // No honest profile yet — hands on the bars below the elbows at lockout: the press gate rejects every rep. The pull profile is a vertical-pull
    // profile and the press profile a bench/overhead one (lib/vision/index.ts
    // defaultShapeGate, biomechanics.ts pull.elbow_drive).
    visionCategory: null,
  },

  // ── Triceps isolation ──────────────────────────────────────────────────────
  {
    id: 'skull_crusher',
    exerciseName: 'Skull Crusher',
    aliases: ['Lying Tricep Extension', 'EZ-Bar Skull Crusher', 'Skull Crushers', 'Skullcrusher'],
    posture: 'lying',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at bench height, both arms in frame',
    keyPoints: [
      'Lie flat with the bar held over the face, arms vertical.',
      'Lower to forehead or just behind the head — upper arms stay still.',
      'Full extension at top.',
      'Keep the elbows pointing at the ceiling, not flaring out.',
    ],
    visionCategory: null,
  },
  {
    id: 'overhead_tricep_extension',
    exerciseName: 'Overhead Tricep Extension',
    aliases: ['Cable Overhead Extension', 'Overhead Cable Extension', 'Dumbbell Overhead Extension', 'Overhead Extension', 'Overhead Triceps Extension'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at chest height, head to hips in frame',
    keyPoints: [
      'Hold the weight overhead with both hands, upper arms vertical.',
      'Elbows close to head.',
      'Full stretch at bottom — lower behind the head under control.',
      'Extend to a straight arm without arching the lower back.',
    ],
    visionCategory: null,
  },
  {
    id: 'tricep_kickback',
    exerciseName: 'Tricep Kickback',
    aliases: ['Dumbbell Kickback', 'Triceps Kickback'],
    posture: 'hinged',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at hip height, torso and arm in frame',
    keyPoints: [
      'Hinge forward and pin the upper arm parallel to your torso.',
      'Full extension, squeeze at top.',
      'Slow negative back to a bent elbow.',
      'Only the forearm moves — the elbow stays where it started.',
    ],
    visionCategory: null,
  },
  {
    id: 'glute_cable_kickback',
    exerciseName: 'Cable Kickback',
    aliases: ['Glute Cable Kickback', 'Cable Glute Kickback', 'Glute Kickback'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, whole body in frame',
    keyPoints: [
      'Ankle cuff on the low pulley, hands on the frame, standing leg soft.',
      'Slight forward lean.',
      'Drive the heel straight back until the hip is fully extended — no arching the lower back.',
      'Squeeze glute at top.',
      'Return under control without letting the stack touch down.',
    ],
    visionCategory: null,
  },

  // ── Biceps ─────────────────────────────────────────────────────────────────
  {
    id: 'hammer_curl',
    exerciseName: 'Hammer Curl',
    aliases: ['Dumbbell Hammer Curl', 'Neutral-Grip Curl', 'Hammer Curls'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at elbow height, shoulders to hands in frame',
    keyPoints: [
      'Stand tall with the dumbbells at your sides, palms facing in.',
      'Keep elbows locked at sides.',
      'Curl to shoulder height without swinging the torso.',
      'Lower to a full extension before the next rep.',
    ],
    visionCategory: 'curl',
    detectedFaults: CURL_FAULTS,
  },
  {
    id: 'cable_curl',
    exerciseName: 'Cable Curl',
    aliases: ['Standing Cable Curl', 'Cable Bicep Curl'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at elbow height, shoulders to hands in frame',
    keyPoints: [
      'Face the low pulley with the bar at the thighs and the elbows tucked at your sides.',
      'Elbows stay fixed.',
      'Curl to shoulder height with no swing from the hips.',
      'Constant tension throughout — lower to full extension without resting.',
    ],
    visionCategory: 'curl',
    detectedFaults: CURL_FAULTS,
  },
  {
    id: 'preacher_curl',
    exerciseName: 'Preacher Curl',
    aliases: ['EZ-Bar Preacher Curl', 'Machine Preacher Curl'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at elbow height, pad and arms in frame',
    keyPoints: [
      'Sit with the upper arms flat on the pad and the armpits over its top edge.',
      'Curl from near-full extension to a full squeeze at the top.',
      'Full stretch at bottom.',
      "Lower slowly — don't hyperextend at bottom.",
    ],
    visionCategory: null,
  },
  {
    id: 'concentration_curl',
    exerciseName: 'Concentration Curl',
    aliases: ['Seated Concentration Curl'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, arm and torso in frame',
    keyPoints: [
      'Elbow braced on inner thigh.',
      'Curl the dumbbell to the shoulder without moving the upper arm.',
      'Pause at top for peak contraction.',
      'Full range of motion — lower to a straight arm.',
    ],
    visionCategory: null,
  },
  {
    id: 'spider_curl',
    exerciseName: 'Spider Curl',
    aliases: ['Incline Spider Curl'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at bench height, arms in frame',
    keyPoints: [
      'Chest on incline bench, arms hanging straight down.',
      'Curl with the elbows fixed in place — only the forearms move.',
      'Squeeze at the top for a peak contraction.',
      'Lower to a full extension under control.',
    ],
    visionCategory: null,
  },
  {
    id: 'incline_curl',
    exerciseName: 'Incline Dumbbell Curl',
    aliases: ['Incline Curl', 'Incline DB Curl'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at elbow height, arms in frame',
    keyPoints: [
      'Set the bench to about 45° and let the arms hang behind the body.',
      'Full stretch at bottom.',
      'Curl to shoulder height without letting the elbows drift forward.',
      'Lower slowly to a full stretch every rep.',
    ],
    visionCategory: null,
  },

  // ── Legs ───────────────────────────────────────────────────────────────────
  {
    id: 'hack_squat',
    exerciseName: 'Hack Squat',
    aliases: ['Machine Hack Squat'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, whole body in frame',
    keyPoints: [
      'Back flat against the pad, shoulders under the yokes.',
      'Feet low for more quad, higher for more glute.',
      'Control the descent — knees tracking over the toes.',
      'Drive back up without slamming the knees straight at the top.',
    ],
    visionCategory: null,
  },
  {
    id: 'leg_press',
    exerciseName: 'Leg Press',
    aliases: ['45° Leg Press', 'Machine Leg Press'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, whole body in frame',
    keyPoints: [
      'Sit back into the seat with the feet shoulder-width on the platform.',
      'Foot position changes target — low for quads, high for glutes and hams.',
      'Full range — lower until the knees are bent to about 90°.',
      "Don't lock knees at top.",
    ],
    visionCategory: null,
  },
  {
    id: 'leg_extension',
    exerciseName: 'Leg Extension',
    aliases: ['Leg Extension (Warmup)', 'Machine Leg Extension', 'Leg Extensions'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, hips to feet in frame',
    keyPoints: [
      'Line the knee up with the machine pivot, pad resting on the lower shins.',
      'Full extension.',
      'Pause at top for quad contraction.',
      'Lower under control — never let the stack drop.',
    ],
    visionCategory: null,
  },
  {
    id: 'seated_leg_curl',
    exerciseName: 'Seated Leg Curl',
    aliases: ['Machine Seated Leg Curl'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, hips to feet in frame',
    keyPoints: [
      'Set the roller just above the ankles and the thigh pad snug.',
      'Curl the heels down and under toward the seat.',
      'Squeeze at the bottom, then return under control.',
      'Keep the hips pinned — no lifting off the seat.',
    ],
    visionCategory: null,
  },
  {
    id: 'bulgarian_split_squat',
    exerciseName: 'Bulgarian Split Squat',
    aliases: ['Rear-Foot Elevated Split Squat', 'RFESS', 'Rear Foot Elevated Split Squat'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, both legs and the bench in frame',
    keyPoints: [
      'Rear foot on bench, front foot far enough forward to stay balanced.',
      'Front knee over toes.',
      'Lower until the front thigh is parallel and the back knee is near the floor.',
      'Keep torso upright and drive up through the front heel.',
    ],
    visionCategory: 'lunge',
    detectedFaults: LUNGE_FAULTS,
  },
  {
    id: 'step_up',
    exerciseName: 'Step-Up',
    aliases: ['Step Up', 'Dumbbell Step-Up', 'Box Step-Up', 'Step-Ups'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, box and whole body in frame',
    keyPoints: [
      'Place the whole foot on the box with the knee over the toes.',
      'Drive through the heel — full extension at top.',
      'Control the step down.',
      'Keep the shoulders level and the torso tall throughout.',
    ],
    visionCategory: 'lunge',
    detectedFaults: LUNGE_FAULTS,
  },
  {
    id: 'sumo_deadlift',
    exerciseName: 'Sumo Deadlift',
    aliases: ['Sumo Barbell Deadlift'],
    posture: 'standing',
    cameraAngle: 'front_45',
    cameraNote: 'Phone 30–45° off your front, at hip height, whole body in frame',
    keyPoints: [
      'Wide stance, toes flared, hands inside the knees.',
      'Chest up, hips low, bar against the shins.',
      'Drive the knees out and the hips through to lockout.',
      'Keep the bar close and lower it under control to the floor.',
    ],
    visionCategory: 'deadlift',
    detectedFaults: DEADLIFT_FAULTS,
  },
  {
    id: 'rack_pull',
    exerciseName: 'Rack Pull',
    aliases: ['Block Pull', 'Rack Pulls'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, bar and whole body in frame',
    keyPoints: [
      'Set the pins so the bar sits just below knee level.',
      'Hinge with a flat back and brace before you pull.',
      'Drive hips through at lockout.',
      'Lower the bar back to the pins under control.',
    ],
    visionCategory: null,
  },

  // ── Glutes ─────────────────────────────────────────────────────────────────
  {
    id: 'hip_thrust',
    exerciseName: 'Hip Thrust (Barbell)',
    aliases: ['Barbell Hip Thrust', 'Hip Thrust'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at bench height, bench and whole body in frame',
    keyPoints: [
      'Shoulders on bench, bar padded across the hips, feet flat.',
      'Drive through heels until the torso is parallel with the floor.',
      'Pause at top, squeeze hard — chin tucked, ribs down.',
      'Lower under control without resting on the floor.',
    ],
    visionCategory: null,
  },
  {
    id: 'glute_bridge',
    exerciseName: 'Glute Bridge',
    aliases: ['Bodyweight Glute Bridge'],
    posture: 'lying',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at floor level, whole body in frame',
    keyPoints: [
      'Lie on your back with the knees bent and the feet flat, hip-width apart.',
      'Drive through the heels until the shoulders, hips and knees form a line.',
      'Hold at top and squeeze the glutes.',
      'Lower to just above the floor; try the single-leg variation for more intensity.',
    ],
    visionCategory: null,
  },
  {
    id: 'reverse_hyperextension',
    exerciseName: 'Reverse Hyperextension',
    aliases: ['Reverse Hyper', 'Reverse Hypers'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at bench height, whole body in frame',
    keyPoints: [
      'Lie face down with the hips at the edge of the bench and the legs hanging.',
      'Raise the legs together to the horizontal using the glutes.',
      "Don't use momentum — pause at the top.",
      'Lower under control without arching the lower back.',
    ],
    visionCategory: null,
  },

  // ── Chest isolation ────────────────────────────────────────────────────────
  {
    id: 'cable_fly',
    exerciseName: 'Cable Fly',
    aliases: ['Cable Crossover', 'Standing Cable Fly', 'Cable Flye'],
    posture: 'standing',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, both arms in frame',
    keyPoints: [
      'Stand between the pulleys with a slight forward lean and a soft elbow.',
      'Sweep the hands together in an arc in front of the chest.',
      'Squeeze at full contraction.',
      'Slow negative back to the stretch, elbows staying soft.',
    ],
    visionCategory: null,
  },
  {
    id: 'dumbbell_fly',
    exerciseName: 'Dumbbell Fly',
    aliases: ['Flat Dumbbell Fly', 'Dumbbell Flye'],
    posture: 'lying',
    cameraAngle: 'front',
    cameraNote: 'Phone at the foot of the bench, straight on, both arms in frame',
    keyPoints: [
      'Lie flat with the dumbbells above the chest, palms facing each other.',
      'Slight elbow bend throughout.',
      'Lower in a controlled arc — feel the stretch at the bottom.',
      'Bring the dumbbells back together over the chest without turning it into a press.',
    ],
    visionCategory: null,
  },
  {
    id: 'pec_deck',
    exerciseName: 'Pec Deck',
    aliases: ['Pec Deck / Machine Fly', 'Pec Deck Fly', 'Machine Fly'],
    posture: 'seated',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, both arms in frame',
    keyPoints: [
      'Set the seat so the handles sit at shoulder height.',
      'Lead with elbows, not hands.',
      'Feel the squeeze in the middle.',
      'Control the return to the stretch.',
    ],
    visionCategory: null,
  },

  // ── Rear delts / shoulders isolation ───────────────────────────────────────
  {
    id: 'reverse_pec_deck',
    exerciseName: 'Reverse Pec Deck',
    aliases: ['Rear Delt Machine Fly', 'Reverse Fly Machine'],
    posture: 'seated',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, both arms in frame',
    keyPoints: [
      'Face the pad with the handles in front of you at shoulder height.',
      'Sweep the arms back in an arc until they line up with the shoulders.',
      'Keep a soft elbow and lead with the rear delts, not the hands.',
      'Return under control — never let the stack pull you forward.',
    ],
    visionCategory: null,
  },
  {
    id: 'rear_delt_fly',
    exerciseName: 'Rear Delt Fly',
    aliases: ['Rear Delt Cable Fly', 'Bent-Over Rear Delt Fly', 'Reverse Fly', 'Bent-Over Reverse Fly'],
    posture: 'hinged',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at hip height, torso and both arms in frame',
    keyPoints: [
      'Bent over with a flat back, dumbbells hanging with a soft elbow.',
      'Drive elbows back, not up.',
      'Raise to shoulder height and squeeze the rear delts.',
      'Lower under control — no swinging.',
    ],
    visionCategory: null,
  },
  {
    id: 'face_pull',
    exerciseName: 'Face Pull',
    aliases: ['Cable Face Pull', 'Rope Face Pull', 'Face Pulls'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at chest height, head to hips in frame',
    keyPoints: [
      'Set the pulley high and hold the rope with the thumbs pointing back.',
      'Pull to forehead level.',
      'Elbows high throughout.',
      'Externally rotate at end position, then return under control.',
    ],
    visionCategory: null,
  },
  {
    id: 'front_raise',
    exerciseName: 'Front Raise',
    aliases: ['Dumbbell Front Raise', 'Plate Front Raise', 'Front Raises'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at chest height, head to hips in frame',
    keyPoints: [
      'Stand tall with the dumbbells resting on the thighs.',
      'Raise straight in front to shoulder height — alternate arms or both together.',
      "Don't swing.",
      'Control the negative.',
    ],
    visionCategory: null,
  },
  {
    id: 'cable_lateral_raise',
    exerciseName: 'Cable Lateral Raise',
    aliases: ['Single-Arm Cable Lateral Raise'],
    posture: 'standing',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, both arms in frame',
    keyPoints: [
      'Stand side-on to a low pulley with the handle in the far hand, across the body.',
      'Raise out to the side to shoulder height, leading with the elbow.',
      'Keep body upright.',
      'Constant tension — lower slowly without resting the stack.',
    ],
    visionCategory: null,
  },
  {
    id: 'upright_row',
    exerciseName: 'Upright Row',
    aliases: ['Barbell Upright Row', 'Dumbbell Upright Row', 'Upright Rows'],
    posture: 'standing',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Wide grip for shoulder emphasis.',
      'Pull the bar up along the body, leading with the elbows.',
      'Elbows stay higher than wrists, and no higher than the shoulders.',
      'Lower under control.',
    ],
    visionCategory: null,
  },
  {
    id: 'barbell_shrug',
    exerciseName: 'Barbell Shrug',
    aliases: ['Shrug', 'Dumbbell Shrug', 'Shrugs', 'Barbell Shrugs'],
    posture: 'standing',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, head to hips in frame',
    keyPoints: [
      'Stand tall with the bar at the thighs and the arms straight.',
      'Full upward squeeze — straight up toward the ears, no rolling.',
      'Hold 1 second at top.',
      'Lower fully before the next rep.',
    ],
    visionCategory: null,
  },

  // ── Calves / lower leg ─────────────────────────────────────────────────────
  {
    id: 'standing_calf_raise',
    exerciseName: 'Standing Calf Raise',
    aliases: ['Calf Raise', 'Machine Calf Raise', 'Standing Machine Calf Raise', 'Calf Raises'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, knees to feet in frame',
    keyPoints: [
      'Balls of the feet on the step, heels hanging free.',
      'Rise as high as you can — pause at peak.',
      'Full stretch at bottom, heel below the platform.',
      'Keep the knees steady; the movement comes from the ankles.',
    ],
    visionCategory: null,
  },
  {
    id: 'seated_calf_raise',
    exerciseName: 'Seated Calf Raise',
    aliases: ['Machine Seated Calf Raise', 'Seated Calf Raises'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, knees to feet in frame',
    keyPoints: [
      'Pad on the lower thighs, balls of the feet on the block.',
      'Slow tempo.',
      'Rise high and pause at the top.',
      'Full range — lower into a stretch every rep.',
    ],
    visionCategory: null,
  },
  {
    id: 'donkey_calf_raise',
    exerciseName: 'Donkey Calf Raise',
    aliases: ['Donkey Calf Press', 'Donkey Calf Raises'],
    posture: 'hinged',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at hip height, whole body in frame',
    keyPoints: [
      'Bend at 90° with the forearms on the support.',
      'Balls of the feet on the block, knees nearly straight.',
      'Rise as high as you can and pause.',
      'Great stretch at bottom — lower slowly.',
    ],
    visionCategory: null,
  },
  {
    id: 'leg_press_calf_raise',
    exerciseName: 'Leg Press Calf Raise',
    aliases: ['Calf Press', 'Calf Press on Leg Press'],
    posture: 'seated',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at hip height, whole body in frame',
    keyPoints: [
      'Balls of the feet on the bottom edge of the platform, legs nearly straight.',
      'Push the platform away by extending the ankles only.',
      'Full range of motion — pause at the top, stretch at the bottom.',
      'Keep the knees soft, never locked.',
    ],
    visionCategory: null,
  },
  {
    id: 'tibialis_raise',
    exerciseName: 'Tibialis Raise',
    aliases: ['Tib Raise', 'Wall Tibialis Raise', 'Tibialis Raises'],
    posture: 'standing',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at knee height, knees to feet in frame',
    keyPoints: [
      'Back against a wall, feet about a step in front.',
      'Lift the toes toward the shins as high as you can.',
      'Lower under control — no bouncing.',
      'Keep the heels planted and the knees straight.',
    ],
    visionCategory: null,
  },

  // ── Core ───────────────────────────────────────────────────────────────────
  {
    id: 'ab_wheel_rollout',
    exerciseName: 'Ab Wheel Rollout',
    aliases: ['Ab Rollout', 'Wheel Rollout', 'Ab Wheel Rollouts'],
    posture: 'kneeling',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at floor level, whole body in frame',
    keyPoints: [
      'Kneel with the wheel under the shoulders and the hips tucked.',
      'Roll out only as far as you can keep the lower back flat.',
      'Pull back with abs, not arms.',
      'Knees or feet — progress to feet only once the kneeling version is clean.',
    ],
    visionCategory: null,
  },
  {
    id: 'cable_crunch',
    exerciseName: 'Cable Crunch',
    aliases: ['Kneeling Cable Crunch', 'Rope Crunch', 'Cable Crunches'],
    posture: 'kneeling',
    cameraAngle: 'side',
    cameraNote: 'Phone to your side, at hip height, head to knees in frame',
    keyPoints: [
      'Kneel facing the high pulley with the rope held beside the head.',
      "Round spine, don't hip flex.",
      'Bring the elbows toward the thighs and squeeze the abs.',
      'Full stretch at top.',
    ],
    visionCategory: null,
  },
  {
    id: 'hanging_leg_raise',
    exerciseName: 'Hanging Leg Raise',
    aliases: ['Hanging Knee Raise', 'Toes to Bar', 'Hanging Leg Raises'],
    posture: 'hanging',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at chest height, whole body in frame',
    keyPoints: [
      'Hang from the bar with straight arms and the shoulders packed.',
      'Raise the legs by curling the pelvis — posterior pelvic tilt at top.',
      'No swinging.',
      'Lower slowly to a dead hang between reps.',
    ],
    visionCategory: null,
  },
  {
    id: 'decline_sit_up',
    exerciseName: 'Decline Sit-Up',
    aliases: ['Decline Situp', 'Decline Crunch', 'Decline Sit-Ups'],
    posture: 'lying',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at bench height, whole body in frame',
    keyPoints: [
      'Hook the feet under the rollers and cross the arms over the chest.',
      'Curl the torso up toward the knees one segment at a time.',
      'No neck strain — look forward, not up at the ceiling.',
      'Slow negative.',
    ],
    visionCategory: null,
  },
  {
    id: 'plank',
    exerciseName: 'Plank',
    aliases: ['Forearm Plank', 'Front Plank', 'Plank Hold'],
    posture: 'prone',
    cameraAngle: 'side',
    cameraNote: 'Phone directly to your side, at floor level, whole body in frame',
    keyPoints: [
      'Forearms under the shoulders, feet together or hip-width apart.',
      'Neutral spine — one straight line from head to heels.',
      'Squeeze glutes and abs throughout.',
      'Breathe steadily and end the set when the hips start to sag.',
    ],
    visionCategory: null,
  },
  {
    id: 'side_plank',
    exerciseName: 'Side Plank',
    aliases: ['Side Plank Hold'],
    posture: 'lying',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at floor level, whole body in frame',
    keyPoints: [
      'Elbow under the shoulder, feet stacked or staggered.',
      'Hip stacked.',
      "Don't let hip drop.",
      'Hold a straight line from head to feet and breathe steadily.',
    ],
    visionCategory: null,
  },
  {
    id: 'russian_twist',
    exerciseName: 'Russian Twist',
    aliases: ['Weighted Russian Twist', 'Russian Twists'],
    posture: 'seated',
    cameraAngle: 'front',
    cameraNote: 'Phone straight in front, at chest height, whole body in frame',
    keyPoints: [
      'Sit tall, lean back to about 45° and brace the core.',
      'Rotate with obliques — the chest turns, not just the arms.',
      'Touch the weight or hands down to each side under control.',
      'Feet off floor for harder version.',
    ],
    visionCategory: null,
  },
];

/**
 * Same normalisation as exerciseFormLibrary's matcher (kept local so this
 * module stays a type-only dependant of it): lower-case, hyphens/underscores →
 * space, whitespace collapsed, trimmed.
 */
function normaliseName(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Built once; every normalised title and alias → its card.
const CARD_INDEX: Map<string, TechniqueCard> = (() => {
  const index = new Map<string, TechniqueCard>();
  for (const card of TECHNIQUE_CARDS) {
    for (const name of [card.exerciseName, ...card.aliases]) {
      const key = normaliseName(name);
      if (key && !index.has(key)) index.set(key, card);
    }
  }
  return index;
})();

/**
 * The card that IS this exercise — exact title or alias only, after
 * normalising. No keyword or family matching: a card's clip and key points
 * are shown only for the exercise they were written for.
 */
export function getTechniqueCard(exerciseName: string): TechniqueCard | null {
  const key = normaliseName(exerciseName);
  if (!key) return null;
  return CARD_INDEX.get(key) ?? null;
}
