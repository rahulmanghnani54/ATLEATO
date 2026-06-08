export interface Exercise {
  name: string;
  sets: number;
  reps: string; // e.g. "8-12" or "5" or "Failure"
  restSeconds: number;
  tips: string[];
}

export interface WorkoutDay {
  day: number; // 0=Mon, 1=Tue, ...
  name: string;
  focus: string;
  muscleGroups: string[];
  estimatedMinutes: number;
  exercises: Exercise[];
}

export interface ExpertProgram {
  id: string;
  name: string;
  expert: string;
  quote: string;
  emoji: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  daysPerWeek: number;
  focus: string;
  description: string;
  color: string;
  schedule: WorkoutDay[]; // indexed by day 0=Mon
}

export const EXPERT_PROGRAMS: Record<string, ExpertProgram> = {
  arnold_blueprint: {
    id: 'arnold_blueprint',
    name: "The Governor's Blueprint",
    expert: 'The Governor',
    quote: "The last three or four reps is what makes the muscle grow. This area of pain divides the champion from someone else.",
    emoji: '🏆',
    difficulty: 'Advanced',
    daysPerWeek: 6,
    focus: 'Hypertrophy',
    description: "The legendary double-split that built the greatest physique of all time. AM chest/back, PM shoulders/arms.",
    color: '#1a1a2e',
    schedule: [
      {
        day: 0,
        name: 'Chest & Back',
        focus: 'Mass Building',
        muscleGroups: ['Chest', 'Back'],
        estimatedMinutes: 75,
        exercises: [
          { name: 'Barbell Bench Press', sets: 5, reps: '8-10', restSeconds: 120, tips: ['Touch chest, full lockout.', 'The Governor pressed to failure on the last set.'] },
          { name: 'Wide-Grip Pull-Up', sets: 5, reps: '10-12', restSeconds: 90, tips: ['Full dead hang at bottom.', 'Chin clears the bar at top.'] },
          { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['30-45° angle.', 'Squeeze at top, stretch at bottom.'] },
          { name: 'Barbell Row', sets: 4, reps: '8-10', restSeconds: 90, tips: ['Overhand grip, pull to lower chest.', 'Keep chest against bar.'] },
          { name: 'Cable Crossover', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Focus on the squeeze.', 'Slow negative.'] },
          { name: 'Close-Grip Lat Pulldown', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Arch back slightly.', 'Pull to upper chest.'] },
        ],
      },
      {
        day: 1,
        name: 'Shoulders & Arms',
        focus: 'Hypertrophy',
        muscleGroups: ['Shoulders', 'Biceps', 'Triceps'],
        estimatedMinutes: 70,
        exercises: [
          { name: 'Seated Dumbbell Press', sets: 4, reps: '8-10', restSeconds: 90, tips: ['Rotating press — turn wrists at top for full shoulder activation.'] },
          { name: 'Barbell Curl', sets: 4, reps: '10-12', restSeconds: 75, tips: ['No swinging.', 'Squeeze at top for 1 second.'] },
          { name: 'Skull Crusher', sets: 4, reps: '10-12', restSeconds: 75, tips: ['Lower to forehead.', 'Full extension at top.'] },
          { name: 'Lateral Raise', sets: 3, reps: '15-20', restSeconds: 60, tips: ['Slight forward lean.', 'Lead with elbows.'] },
          { name: 'Concentration Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Full range.', 'Pause at top for peak contraction.'] },
          { name: 'Tricep Pushdown', sets: 3, reps: '15', restSeconds: 60, tips: ['Lock elbows to sides.', 'Full extension at bottom.'] },
        ],
      },
      {
        day: 2,
        name: 'Legs',
        focus: 'Strength & Mass',
        muscleGroups: ['Quads', 'Hamstrings', 'Calves'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Barbell Back Squat', sets: 5, reps: '8-10', restSeconds: 180, tips: ['Below parallel.', 'Drive knees out.', 'Big air before descent.'] },
          { name: 'Leg Press', sets: 4, reps: '12-15', restSeconds: 120, tips: ['High foot placement for glutes and hams.'] },
          { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Full range.', 'Slow negative.'] },
          { name: 'Leg Extension', sets: 3, reps: '15-20', restSeconds: 60, tips: ['Squeeze at top.'] },
          { name: 'Standing Calf Raise', sets: 5, reps: '15-20', restSeconds: 60, tips: ['Full range — heel below platform at bottom.'] },
        ],
      },
    ],
  },

  cbum_evolved: {
    id: 'cbum_evolved',
    name: 'The Sculptor Method',
    expert: 'The Sculptor',
    quote: "Train insane or remain the same. Mind-muscle connection is everything — weight means nothing if you don't feel it.",
    emoji: '⭐',
    difficulty: 'Intermediate',
    daysPerWeek: 5,
    focus: 'Classic Physique',
    description: "A modern aesthetics hypertrophy system. Mind-muscle connection over ego lifting.",
    color: '#7c3aed',
    schedule: [
      {
        day: 0,
        name: 'Back',
        focus: 'Width & Thickness',
        muscleGroups: ['Lats', 'Rhomboids', 'Traps'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Rack Pull', sets: 4, reps: '6-8', restSeconds: 150, tips: ['Just below knee.', 'Drive hips through at lockout.'] },
          { name: 'Seated Cable Row', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Elbows tight to body.', 'Full stretch at front.'] },
          { name: 'Lat Pulldown', sets: 4, reps: '12-15', restSeconds: 75, tips: ['Pull to upper chest.', 'Lean back slightly.'] },
          { name: 'Single-Arm Dumbbell Row', sets: 3, reps: '10-12', restSeconds: 60, tips: ['Full range.', 'Think elbow, not hand.'] },
          { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Rope to forehead.', 'Externally rotate at end position.'] },
        ],
      },
      {
        day: 1,
        name: 'Chest',
        focus: 'Upper Chest Emphasis',
        muscleGroups: ['Pecs', 'Front Delts'],
        estimatedMinutes: 55,
        exercises: [
          { name: 'Incline Barbell Press', sets: 4, reps: '8-10', restSeconds: 120, tips: ['The Sculptor focuses on incline for upper chest dominance.'] },
          { name: 'Flat Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Deep stretch at bottom.', 'Explosive press.'] },
          { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Cross hands at the top.', 'Hold 1 second squeeze.'] },
          { name: 'Pec Deck', sets: 3, reps: '15', restSeconds: 60, tips: ['Feel the squeeze in the middle.'] },
        ],
      },
      {
        day: 2,
        name: 'Arms',
        focus: 'Biceps & Triceps',
        muscleGroups: ['Biceps', 'Triceps'],
        estimatedMinutes: 55,
        exercises: [
          { name: 'EZ Bar Curl', sets: 4, reps: '10-12', restSeconds: 75, tips: ['Controlled negative.'] },
          { name: 'Incline Dumbbell Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Arms behind body for maximum stretch.'] },
          { name: 'Cable Curl', sets: 3, reps: '15', restSeconds: 45, tips: ['Constant tension throughout.'] },
          { name: 'Close-Grip Bench Press', sets: 4, reps: '8-10', restSeconds: 90, tips: ['Elbows in.', 'Touch sternum.'] },
          { name: 'Cable Overhead Extension', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Full extension overhead.'] },
          { name: 'Cable Pushdown', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Lock upper arms.', 'Squeeze at bottom.'] },
        ],
      },
      {
        day: 3,
        name: 'Shoulders',
        focus: 'Delt Development',
        muscleGroups: ['Delts', 'Traps'],
        estimatedMinutes: 50,
        exercises: [
          { name: 'Seated Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Control the eccentric.'] },
          { name: 'Lateral Raise', sets: 4, reps: '15-20', restSeconds: 60, tips: ['Slight internal rotation.', 'Lead with pinky.'] },
          { name: 'Reverse Pec Deck', sets: 3, reps: '15-20', restSeconds: 45, tips: ["Rear delts are The Sculptor's secret weapon."] },
          { name: 'Front Raise', sets: 3, reps: '12-15', restSeconds: 45, tips: ['Alternate arms.', "Don't swing."] },
        ],
      },
      {
        day: 4,
        name: 'Legs',
        focus: 'Complete Leg Development',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        estimatedMinutes: 70,
        exercises: [
          { name: 'Leg Extension (Warmup)', sets: 3, reps: '20', restSeconds: 45, tips: ['Activates quads before heavy work.'] },
          { name: 'Barbell Back Squat', sets: 4, reps: '8-12', restSeconds: 150, tips: ['The Sculptor focuses on controlled descent.'] },
          { name: 'Hack Squat', sets: 3, reps: '10-12', restSeconds: 120, tips: ['Feet high on platform.'] },
          { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Feel the hamstring stretch.', 'Bar close to legs.'] },
          { name: 'Lying Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Slow eccentric.'] },
          { name: 'Seated Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: ['Full range.'] },
        ],
      },
    ],
  },

  nippard_fundamentals: {
    id: 'nippard_fundamentals',
    name: 'Science Fundamentals',
    expert: 'The Scientist',
    quote: "The best program is one based on evidence, not broscience. Frequency, volume, and progressive overload — that's the formula.",
    emoji: '🔬',
    difficulty: 'Intermediate',
    daysPerWeek: 4,
    focus: 'Evidence-Based',
    description: "Research-backed Upper/Lower split. 4 days/week, maximises frequency and volume for natural lifters.",
    color: '#0369a1',
    schedule: [
      {
        day: 0,
        name: 'Upper A (Strength)',
        focus: 'Strength',
        muscleGroups: ['Chest', 'Back', 'Shoulders', 'Arms'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Barbell Bench Press', sets: 4, reps: '4-6', restSeconds: 180, tips: ['Strength focus — heavy compound.'] },
          { name: 'Barbell Row', sets: 3, reps: '6-8', restSeconds: 120, tips: ['Overhand.', 'Pull to waist.'] },
          { name: 'Overhead Press', sets: 3, reps: '6-8', restSeconds: 120, tips: ['Strict form.', 'No leg drive.'] },
          { name: 'Pull-Up', sets: 3, reps: '6-10', restSeconds: 90, tips: ['Add weight if needed.'] },
          { name: 'Incline Dumbbell Curl', sets: 2, reps: '10-15', restSeconds: 60, tips: ['Peak contraction.'] },
          { name: 'Overhead Tricep Extension', sets: 2, reps: '10-15', restSeconds: 60, tips: ['Long head emphasis.'] },
        ],
      },
      {
        day: 1,
        name: 'Lower A (Strength)',
        focus: 'Strength',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, reps: '4-6', restSeconds: 180, tips: ['Below parallel.', 'Brace core.'] },
          { name: 'Romanian Deadlift', sets: 3, reps: '6-8', restSeconds: 120, tips: ['Hip hinge pattern.'] },
          { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90, tips: ['Quad emphasis.'] },
          { name: 'Leg Curl', sets: 3, reps: '10-12', restSeconds: 60, tips: ['Slow eccentric.'] },
          { name: 'Calf Raise', sets: 4, reps: '10-15', restSeconds: 60, tips: ['Full range.'] },
        ],
      },
      {
        day: 3,
        name: 'Upper B (Hypertrophy)',
        focus: 'Hypertrophy',
        muscleGroups: ['Chest', 'Back', 'Shoulders', 'Arms'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Incline Dumbbell Press', sets: 4, reps: '8-12', restSeconds: 90, tips: ['Higher rep hypertrophy focus.'] },
          { name: 'Seated Cable Row', sets: 3, reps: '10-15', restSeconds: 75, tips: ['Full stretch on each rep.'] },
          { name: 'Dumbbell Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: ['Evidence: 4 sets of laterals is optimal frequency.'] },
          { name: 'Chest-Supported Row', sets: 3, reps: '10-15', restSeconds: 75, tips: ['Eliminates lower back fatigue.'] },
          { name: 'Cable Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Constant tension.'] },
          { name: 'Tricep Pushdown', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Rope for supination.'] },
        ],
      },
      {
        day: 4,
        name: 'Lower B (Hypertrophy)',
        focus: 'Hypertrophy',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Hack Squat', sets: 4, reps: '8-12', restSeconds: 90, tips: ['Feet close for quad focus.'] },
          { name: 'Sumo Deadlift', sets: 3, reps: '8-10', restSeconds: 120, tips: ['Hip hinge.', 'Chest up.'] },
          { name: 'Walking Lunge', sets: 3, reps: '12 each', restSeconds: 75, tips: ['Full stride.', 'Knee touches floor.'] },
          { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Slow eccentric 3 seconds.'] },
          { name: 'Tibialis Raise', sets: 3, reps: '20', restSeconds: 45, tips: ['Scientist special: prevents shin splints.'] },
        ],
      },
    ],
  },

  ct_strength: {
    id: 'ct_strength',
    name: 'Commander Strength',
    expert: 'The Commander',
    quote: "It's Still Your Motherf***ing Set. Nobody is going to do this for you. You are the only one responsible for your results.",
    emoji: '💥',
    difficulty: 'Advanced',
    daysPerWeek: 5,
    focus: 'Strength + Mass',
    description: "It's Still Your Motherf***ing Set. Brutal compulsory curls, high volume, and unbreakable will.",
    color: '#991b1b',
    schedule: [
      {
        day: 0,
        name: 'Chest — ISYMFS',
        focus: 'Chest & Triceps',
        muscleGroups: ['Chest', 'Triceps'],
        estimatedMinutes: 80,
        exercises: [
          { name: 'Flat Barbell Press', sets: 6, reps: '10,8,6,4,4,4', restSeconds: 180, tips: ['The Commander:"The bench press is the most important exercise for the upper body."', 'Go heavier each set.'] },
          { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['No stopping. ISYMFS.'] },
          { name: 'Dumbbell Fly', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Deep stretch.', 'Controlled arc.'] },
          { name: 'Cable Crossover', sets: 3, reps: '15-20', restSeconds: 60, tips: ['Burn the muscle out.'] },
          { name: 'Tricep Dip', sets: 4, reps: 'Failure', restSeconds: 60, tips: ["Go until you can't go anymore."] },
        ],
      },
      {
        day: 1,
        name: 'Back — ISYMFS',
        focus: 'Back & Biceps',
        muscleGroups: ['Back', 'Biceps'],
        estimatedMinutes: 75,
        exercises: [
          { name: 'Deadlift', sets: 5, reps: '5,5,3,3,1', restSeconds: 240, tips: ["The Commander's bread and butter.", 'Treat every session like a max attempt.'] },
          { name: 'Pull-Up', sets: 5, reps: 'Max', restSeconds: 90, tips: ['All the way up, all the way down.'] },
          { name: 'T-Bar Row', sets: 4, reps: '8-10', restSeconds: 120, tips: ['Heavy weight.', 'Full range.'] },
          { name: 'Seated Cable Row', sets: 3, reps: '12', restSeconds: 75, tips: ['Squeeze the back at peak contraction.'] },
          { name: 'Barbell Curl', sets: 5, reps: '10,8,6,6,20', restSeconds: 75, tips: ['Compulsory curls — every session.'] },
        ],
      },
      {
        day: 2,
        name: 'Legs — ISYMFS',
        focus: 'Legs',
        muscleGroups: ['Quads', 'Hamstrings', 'Calves'],
        estimatedMinutes: 85,
        exercises: [
          { name: 'Barbell Back Squat', sets: 6, reps: '10,8,6,4,4,4', restSeconds: 240, tips: ["The Commander:squat like your life depends on it.", 'Below parallel every rep.'] },
          { name: 'Leg Press', sets: 4, reps: '12-15', restSeconds: 120, tips: ['Do not stop the set. ISYMFS.'] },
          { name: 'Walking Lunge', sets: 3, reps: '20 each', restSeconds: 90, tips: ['Full stride, stay upright.'] },
          { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Slow negative.'] },
          { name: 'Standing Calf Raise', sets: 5, reps: '20', restSeconds: 45, tips: ['Full range.', 'CT trains calves heavy and often.'] },
        ],
      },
      {
        day: 3,
        name: 'Shoulders — ISYMFS',
        focus: 'Shoulders',
        muscleGroups: ['Shoulders', 'Traps'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Seated Barbell Press', sets: 5, reps: '8,6,6,4,4', restSeconds: 150, tips: ['Strict form.', 'Full overhead lockout.'] },
          { name: 'Dumbbell Lateral Raise', sets: 5, reps: '15-20', restSeconds: 60, tips: ['The Commander does high volume laterals.', 'No swinging.'] },
          { name: 'Rotating DB Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Full rotation at top.'] },
          { name: 'Barbell Shrug', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Full upward squeeze.', 'Hold 1 second at top.'] },
          { name: 'Rear Delt Fly', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Bent over.', 'Lead with elbows.'] },
        ],
      },
      {
        day: 4,
        name: 'Arms — ISYMFS',
        focus: 'Arms',
        muscleGroups: ['Biceps', 'Triceps', 'Forearms'],
        estimatedMinutes: 70,
        exercises: [
          { name: 'Barbell Curl', sets: 6, reps: '10,8,6,6,20,20', restSeconds: 75, tips: ["Compulsory curls are The Commander's religion.", 'Every set to failure.'] },
          { name: 'Skull Crusher', sets: 5, reps: '10-12', restSeconds: 75, tips: ['Lower bar to forehead.', 'Full extension.'] },
          { name: 'Dumbbell Hammer Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: ['Brachialis for arm thickness.'] },
          { name: 'Tricep Pushdown', sets: 4, reps: '15-20', restSeconds: 60, tips: ['Lock elbows.', 'Full extension.'] },
          { name: 'Cable Curl', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Constant tension, no rest at bottom.'] },
          { name: 'Close-Grip Bench Press', sets: 3, reps: '10-12', restSeconds: 90, tips: ['Heavy weight for tricep mass.'] },
        ],
      },
    ],
  },

  dr_mike_mav: {
    id: 'dr_mike_mav',
    name: 'MAV Hypertrophy',
    expert: 'Dr. Growth',
    quote: "Train at your Maximum Adaptive Volume. More volume is better — but only up to the point your recovery can handle.",
    emoji: '📊',
    difficulty: 'Intermediate',
    daysPerWeek: 5,
    focus: 'RP Method',
    description: "Renaissance Periodization — train at Maximum Adaptive Volume. Evidence-based mesocycle progression.",
    color: '#065f46',
    schedule: [
      {
        day: 0,
        name: 'Push A (Chest/Shoulders/Triceps)',
        focus: 'Chest & Shoulders',
        muscleGroups: ['Chest', 'Shoulders', 'Triceps'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Incline Barbell Press', sets: 4, reps: '10-12', restSeconds: 120, tips: ['RP: incline is superior for pec minor + upper chest.'] },
          { name: 'Dumbbell Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: ['MEV for medial delts is 8 sets/week; this is 4.'] },
          { name: 'Pec Deck Fly', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Isolation for maximum hypertrophy stimulus.'] },
          { name: 'Overhead Press', sets: 3, reps: '8-12', restSeconds: 90, tips: ['Strict form.', 'Full ROM.'] },
          { name: 'Cable Pushdown', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Triceps MEV 4-8 sets/week.'] },
        ],
      },
      {
        day: 1,
        name: 'Pull A (Back/Biceps)',
        focus: 'Back & Biceps',
        muscleGroups: ['Back', 'Biceps'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Lat Pulldown', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Lats: MEV 8 sets/week.', 'Full stretch.'] },
          { name: 'Cable Row', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Rhomboids and mid-back volume.'] },
          { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Rear delts and external rotators.'] },
          { name: 'Incline Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Biceps MEV 6-8 sets/week.'] },
          { name: 'Hammer Curl', sets: 2, reps: '12-15', restSeconds: 60, tips: ['Brachialis for arm thickness.'] },
        ],
      },
      {
        day: 2,
        name: 'Legs A (Quad Focus)',
        focus: 'Quads & Calves',
        muscleGroups: ['Quads', 'Calves'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Barbell Squat', sets: 4, reps: '8-12', restSeconds: 150, tips: ['Quads MAV: 12-20 sets/week.', 'Start with moderate weight.'] },
          { name: 'Leg Press', sets: 3, reps: '12-15', restSeconds: 90, tips: ['Feet low for quad bias.'] },
          { name: 'Leg Extension', sets: 3, reps: '15-20', restSeconds: 60, tips: ['Isolation for peak hypertrophy.'] },
          { name: 'Calf Raise', sets: 5, reps: '10-15', restSeconds: 60, tips: ['Calves need high frequency and volume.'] },
        ],
      },
      {
        day: 3,
        name: 'Push B (Shoulders/Chest/Triceps)',
        focus: 'Shoulders & Triceps',
        muscleGroups: ['Shoulders', 'Chest', 'Triceps'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Seated Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: ['Second shoulder press day for frequency.'] },
          { name: 'Cable Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: ['Constant tension vs. dumbbells.'] },
          { name: 'Flat Dumbbell Press', sets: 3, reps: '10-15', restSeconds: 75, tips: ['Second chest day — hypertrophy rep range.'] },
          { name: 'Overhead Tricep Extension', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Long head emphasis.', 'Full stretch.'] },
          { name: 'Rear Delt Cable Fly', sets: 3, reps: '15-20', restSeconds: 45, tips: ['Rear delts: MEV 6 sets/week, this completes it.'] },
        ],
      },
      {
        day: 4,
        name: 'Legs B (Ham/Glute Focus)',
        focus: 'Hamstrings & Glutes',
        muscleGroups: ['Hamstrings', 'Glutes', 'Calves'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 120, tips: ['Hip hinge pattern.', 'Feel hamstring stretch at bottom.'] },
          { name: 'Lying Leg Curl', sets: 4, reps: '12-15', restSeconds: 75, tips: ['Hams MAV: 10-15 sets/week.', 'Slow eccentric.'] },
          { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12 each', restSeconds: 90, tips: ['Great glute + ham activation.', 'Keep torso upright.'] },
          { name: 'Seated Leg Curl', sets: 3, reps: '15-20', restSeconds: 60, tips: ['Different angle for complete hamstring development.'] },
          { name: 'Seated Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: ['Soleus focus at seated position.'] },
        ],
      },
    ],
  },
};
