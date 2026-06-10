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

export interface CoachCue {
  coachId: 'cbum' | 'arnold' | 'nippard' | 'ct' | 'drmike';
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
  exerciseName: string;
  keywords: string[];             // matched against exerciseName.toLowerCase()
  category: 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'isolation';
  targetMuscles: string[];
  angleChecks: AngleRange[];
  checkpoints: FormCheckpoint[];
  coachCues: CoachCue[];
  commonMistakes: string[];
  breathingCue: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQUAT PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const barbell_squat: ExerciseForm = {
  exerciseName: 'Barbell Back Squat',
  keywords: ['squat', 'back squat', 'barbell squat'],
  category: 'squat',
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
    { coachId: 'ct',     cue: 'GO DEEP OR GO HOME. Half reps are for half humans. DRIVE that bar through the ceiling.' },
    { coachId: 'drmike', cue: 'Aim for hip crease just below knee. Past that, risk exceeds stimulus. Control the eccentric — 2 seconds down.' },
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
  exerciseName: 'Goblet Squat',
  keywords: ['goblet squat', 'goblet'],
  category: 'squat',
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
    { coachId: 'drmike', cue: 'The goblet position counterbalances naturally — use this to drill depth before loading a barbell.' },
    { coachId: 'arnold', cue: 'Feel the quads stretch at the bottom. That is where the growth begins.' },
    { coachId: 'ct',     cue: 'EVEN ON GOBLET SQUATS, I EXPECT FULL DEPTH. NO EXCEPTIONS.' },
  ],
  commonMistakes: ['Letting weight drift forward', 'Knees caving', 'Rising onto toes', 'Not reaching depth'],
  breathingCue: 'Inhale at top → hold and brace → exhale on the drive up',
};

const lunge: ExerciseForm = {
  exerciseName: 'Lunge',
  keywords: ['lunge', 'split squat', 'bulgarian', 'step up'],
  category: 'squat',
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
    { coachId: 'drmike', cue: 'Bulgarian split squat > standard lunge for stimulus. Elevate back foot 6–8 inches.' },
    { coachId: 'arnold', cue: 'Feel the stretch in your hip flexors. That tension = muscle growth.' },
    { coachId: 'ct',     cue: 'BALANCE AND POWER. BOTH LEGS MUST BE EQUAL. NO FAVOURITES.' },
  ],
  commonMistakes: ['Front knee tracking inward', 'Torso leaning too far forward', 'Back knee slamming floor', 'Uneven step width'],
  breathingCue: 'Inhale → brace → step and lower → exhale driving up',
};

// ─────────────────────────────────────────────────────────────────────────────
// HINGE PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const deadlift: ExerciseForm = {
  exerciseName: 'Deadlift',
  keywords: ['deadlift', 'conventional deadlift', 'sumo', 'trap bar'],
  category: 'hinge',
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
    { coachId: 'ct',     cue: 'THIS IS THE KING OF ALL LIFTS. TREAT IT WITH RESPECT. LOCK YOUR BACK. DRIVE.' },
    { coachId: 'drmike', cue: 'Lat engagement is critical — "protect your armpits" cue works well to maintain position throughout the pull.' },
  ],
  commonMistakes: ['Lower back rounding', 'Bar drifting forward', 'Hips shooting up first', 'Hyperextending at lockout', 'Jerking the bar'],
  breathingCue: 'Big breath before the pull → brace hard → hold through the rep → exhale at top or on the way down',
};

const romanian_deadlift: ExerciseForm = {
  exerciseName: 'Romanian Deadlift',
  keywords: ['romanian', 'rdl', 'stiff leg', 'hip hinge'],
  category: 'hinge',
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
    { coachId: 'drmike', cue: 'This is one of the best hamstring mass builders. 3 seconds eccentric minimum to maximize tension.' },
    { coachId: 'arnold', cue: 'Push the glutes back as if you are reaching for a wall behind you. Let the bar follow your legs down.' },
    { coachId: 'ct',     cue: 'SLOW DOWN. THE NEGATIVE IS WHERE THE MUSCLE IS BUILT. DO NOT RUSH.' },
  ],
  commonMistakes: ['Rounding the lower back', 'Bar drifting forward', 'Bending knees too much', 'Going past range of motion'],
  breathingCue: 'Exhale at top → inhale and brace → slow descent → exhale driving up',
};

// ─────────────────────────────────────────────────────────────────────────────
// PUSH PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const bench_press: ExerciseForm = {
  exerciseName: 'Bench Press',
  keywords: ['bench press', 'bench', 'barbell press', 'chest press'],
  category: 'push',
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
    { coachId: 'ct',     cue: 'THE CHEST MUST TOUCH THE BAR. HALF REPS DON\'T COUNT.' },
    { coachId: 'drmike', cue: 'Leg drive through the floor + full body tension = more pounds on the bar. This is not cheating — it is technique.' },
  ],
  commonMistakes: ['Bar bouncing off chest', 'Elbows flared at 90°', 'Losing scapular retraction', 'Arching too extreme', 'Uneven bar path'],
  breathingCue: 'Inhale at top → hold and brace → lower → exhale forcefully driving up',
};

const incline_db_press: ExerciseForm = {
  exerciseName: 'Incline Dumbbell Press',
  keywords: ['incline db press', 'incline dumbbell', 'incline press', 'incline'],
  category: 'push',
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
    { coachId: 'ct',     cue: 'I WANT FULL RANGE. TOUCH THOSE DBs AT THE TOP. PROVE THE MUSCLE IS WORKING.' },
    { coachId: 'drmike', cue: 'Use a tempo — 2 seconds down, pause, explosive up. Time under tension drives upper chest growth.' },
  ],
  commonMistakes: ['Too steep an incline (45°+)', 'Not reaching full stretch at bottom', 'DBs not touching at top', 'Losing shoulder retraction', 'Rushing eccentric'],
  breathingCue: 'Inhale at top or during descent → exhale pressing up',
};

const overhead_press: ExerciseForm = {
  exerciseName: 'Overhead Press',
  keywords: ['overhead press', 'shoulder press', 'military press', 'ohp', 'seated press'],
  category: 'push',
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
    { coachId: 'ct',     cue: 'PRESS TO THE SKY. LOCK OUT. SHRUG. SHOW THOSE DELTS YOU MEAN BUSINESS.' },
    { coachId: 'drmike', cue: 'Seated OHP removes the leg drive variable — pure shoulder stimulus. Use it for isolation when barbell goes overhead.' },
  ],
  commonMistakes: ['Lower back hyperextension', 'Pressing in front of head not above', 'Not locking out', 'Elbows too wide', 'Bar drifting forward'],
  breathingCue: 'Inhale and brace before press → exhale as bar passes forehead',
};

const lateral_raise: ExerciseForm = {
  exerciseName: 'Lateral Raise',
  keywords: ['lateral raise', 'side raise', 'side lateral'],
  category: 'isolation',
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
    { coachId: 'ct',     cue: 'SQUEEZE THOSE DELTS AT THE TOP. HOLD IT. FEEL THE BURN. THAT\'S THE MUSCLE WORKING.' },
    { coachId: 'drmike', cue: 'Lateral raise machines and cables are far superior to DBs for tension curve. But if DB — slow the eccentric to 4 seconds.' },
  ],
  commonMistakes: ['Using momentum/swinging', 'Too heavy — reduces ROM', 'Not holding at top', 'Rushing eccentric', 'Shrugging traps at top'],
  breathingCue: 'Exhale raising → inhale slowly lowering',
};

// ─────────────────────────────────────────────────────────────────────────────
// PULL PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const pullup: ExerciseForm = {
  exerciseName: 'Pull-Up',
  keywords: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'lat pulldown'],
  category: 'pull',
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
    { coachId: 'ct',     cue: 'CHEST TO THE BAR. IF YOUR CHIN BARELY CLEARS, THAT\'S NOT A PULL-UP, THAT\'S A SUGGESTION.' },
    { coachId: 'drmike', cue: 'Weighted pull-ups are the best lat builder for advanced lifters. Use a belt. Progressive overload here is limitless.' },
  ],
  commonMistakes: ['Kipping / using momentum', 'Not reaching full hang at bottom', 'Chin barely over bar', 'Shrugging instead of lat engagement', 'Too wide a grip'],
  breathingCue: 'Exhale driving up → inhale lowering down',
};

const barbell_row: ExerciseForm = {
  exerciseName: 'Barbell Row',
  keywords: ['barbell row', 'bent over row', 'bb row', 'pendlay row'],
  category: 'pull',
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
    { coachId: 'ct',     cue: 'ROW HARD. EVERY REP. MAKE THAT BAR TOUCH YOUR BODY. HALF ROWS BUILD HALF BACKS.' },
    { coachId: 'drmike', cue: 'Pendlay rows (dead stop) are fantastic for power development. Strict rows for hypertrophy — your choice based on goal.' },
  ],
  commonMistakes: ['Jerking with lower back', 'Torso rising on each rep', 'Bar not touching body', 'Too wide a grip for lats', 'Not squeezing at top'],
  breathingCue: 'Inhale and brace → exhale pulling up → inhale lowering',
};

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const bicep_curl: ExerciseForm = {
  exerciseName: 'Bicep Curl',
  keywords: ['curl', 'bicep curl', 'barbell curl', 'dumbbell curl', 'hammer curl', 'preacher', 'spider curl'],
  category: 'isolation',
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
    { coachId: 'ct',     cue: 'I COMMAND YOU — NO SWINGING. IF YOU SWING, LOWER THE WEIGHT. EARN THE CURL.' },
    { coachId: 'drmike', cue: 'Incline DBs for curls give a longer length partition — superior stimulus. Stretch-mediated hypertrophy is real.' },
  ],
  commonMistakes: ['Swinging the body', 'Elbows drifting forward', 'Not reaching full extension', 'Dropping the weight on the negative', 'Wrists bending back'],
  breathingCue: 'Exhale curling up → inhale slowly lowering',
};

const tricep_pushdown: ExerciseForm = {
  exerciseName: 'Tricep Pushdown',
  keywords: ['tricep pushdown', 'pushdown', 'tricep extension', 'rope pushdown', 'cable pushdown'],
  category: 'isolation',
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
    { coachId: 'ct',     cue: 'LOCK IT OUT. SQUEEZE. HOLD. IF YOU CANNOT FEEL IT — YOU ARE NOT DOING IT RIGHT.' },
    { coachId: 'drmike', cue: 'Rope pushdowns allow wrist rotation at the bottom for a harder tricep squeeze. Worth using over straight bar.' },
  ],
  commonMistakes: ['Elbows drifting forward', 'Not locking out at bottom', 'Using body momentum', 'Wrists bending', 'Going too heavy and losing form'],
  breathingCue: 'Exhale pushing down → inhale returning up',
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER LIBRARY + LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

export const EXERCISE_FORM_LIBRARY: ExerciseForm[] = [
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

export function getExerciseForm(exerciseName: string): ExerciseForm | null {
  const name = (exerciseName ?? '').toLowerCase();
  return (
    EXERCISE_FORM_LIBRARY.find((ef) =>
      ef.keywords.some((kw) => name.includes(kw))
    ) ?? null
  );
}

export function getCoachCue(form: ExerciseForm, coachId: string): string {
  const cue = form.coachCues.find((c) => c.coachId === coachId);
  return cue?.cue ?? form.coachCues[0]?.cue ?? 'Focus on controlled form and mind-muscle connection.';
}
