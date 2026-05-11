export interface Exercise {
  name: string;
  sets: number;
  reps: string; // e.g. "8-12" or "5"
  restSeconds: number;
  tips: string;
}

export interface WorkoutDay {
  name: string;
  muscleGroups: string[];
  estimatedMinutes: number;
  exercises: Exercise[];
}

export interface ExpertProgram {
  id: string;
  name: string;
  expert: string;
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
    name: "Arnold's Blueprint",
    expert: 'Arnold Schwarzenegger',
    emoji: '🏆',
    difficulty: 'Advanced',
    daysPerWeek: 6,
    focus: 'Hypertrophy',
    description: "The legendary double-split that built the greatest physique of all time. AM chest/back, PM shoulders/arms.",
    color: '#1a1a2e',
    schedule: [
      {
        name: 'Chest & Back',
        muscleGroups: ['Chest', 'Back'],
        estimatedMinutes: 75,
        exercises: [
          { name: 'Barbell Bench Press', sets: 5, reps: '8-10', restSeconds: 120, tips: 'Touch chest, full lockout. Arnold pressed to failure.' },
          { name: 'Wide-Grip Pull-Up', sets: 5, reps: '10-12', restSeconds: 90, tips: 'Full dead hang at bottom, chin over bar.' },
          { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: '30-45° angle, squeeze at top.' },
          { name: 'Barbell Row', sets: 4, reps: '8-10', restSeconds: 90, tips: 'Overhand grip, pull to lower chest, chest touches bar.' },
          { name: 'Cable Crossover', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Focus on the squeeze, slow negative.' },
          { name: 'Close-Grip Lat Pulldown', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Arch back slightly, pull to upper chest.' },
        ],
      },
      {
        name: 'Shoulders & Arms',
        muscleGroups: ['Shoulders', 'Biceps', 'Triceps'],
        estimatedMinutes: 70,
        exercises: [
          { name: 'Seated Dumbbell Press', sets: 4, reps: '8-10', restSeconds: 90, tips: 'Arnold Press — rotate wrists at top for full shoulder activation.' },
          { name: 'Barbell Curl', sets: 4, reps: '10-12', restSeconds: 75, tips: 'No swinging. Squeeze at top for 1 second.' },
          { name: 'Skull Crusher', sets: 4, reps: '10-12', restSeconds: 75, tips: 'Lower to forehead, full extension at top.' },
          { name: 'Lateral Raise', sets: 3, reps: '15-20', restSeconds: 60, tips: 'Slight forward lean, lead with elbows.' },
          { name: 'Concentration Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Full range, pause at top.' },
          { name: 'Tricep Pushdown', sets: 3, reps: '15', restSeconds: 60, tips: 'Lock elbows to sides, full extension.' },
        ],
      },
      {
        name: 'Legs',
        muscleGroups: ['Quads', 'Hamstrings', 'Calves'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Barbell Back Squat', sets: 5, reps: '8-10', restSeconds: 180, tips: 'Below parallel. Drive knees out. Big air before descent.' },
          { name: 'Leg Press', sets: 4, reps: '12-15', restSeconds: 120, tips: 'High foot placement for glutes/hams.' },
          { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: 'Full range, slow negative.' },
          { name: 'Leg Extension', sets: 3, reps: '15-20', restSeconds: 60, tips: 'Squeeze at top.' },
          { name: 'Standing Calf Raise', sets: 5, reps: '15-20', restSeconds: 60, tips: 'Full range — heel below platform at bottom.' },
        ],
      },
    ],
  },

  cbum_evolved: {
    id: 'cbum_evolved',
    name: 'CBum Evolved',
    expert: 'Chris Bumstead',
    emoji: '⭐',
    difficulty: 'Intermediate',
    daysPerWeek: 5,
    focus: 'Classic Physique',
    description: "5× Classic Physique Olympia champion's hypertrophy system. Mind-muscle connection over ego lifting.",
    color: '#7c3aed',
    schedule: [
      {
        name: 'Back',
        muscleGroups: ['Lats', 'Rhomboids', 'Traps'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Rack Pull', sets: 4, reps: '6-8', restSeconds: 150, tips: 'Just below knee, drive hips through.' },
          { name: 'Seated Cable Row', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Elbows tight to body, full stretch at front.' },
          { name: 'Lat Pulldown', sets: 4, reps: '12-15', restSeconds: 75, tips: 'Pull to upper chest, lean back slightly.' },
          { name: 'Single-Arm Dumbbell Row', sets: 3, reps: '10-12', restSeconds: 60, tips: 'Full range, think elbow not hand.' },
          { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 45, tips: 'Rope to forehead, externally rotate at end.' },
        ],
      },
      {
        name: 'Chest',
        muscleGroups: ['Pecs', 'Front Delts'],
        estimatedMinutes: 55,
        exercises: [
          { name: 'Incline Barbell Press', sets: 4, reps: '8-10', restSeconds: 120, tips: 'CBum focuses on incline for upper chest dominance.' },
          { name: 'Flat Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Deep stretch at bottom, explosive press.' },
          { name: 'Cable Fly', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Cross hands at the top, hold 1 second.' },
          { name: 'Pec Deck', sets: 3, reps: '15', restSeconds: 60, tips: 'Feel the squeeze at the middle.' },
        ],
      },
      {
        name: 'Arms',
        muscleGroups: ['Biceps', 'Triceps'],
        estimatedMinutes: 55,
        exercises: [
          { name: 'EZ Bar Curl', sets: 4, reps: '10-12', restSeconds: 75, tips: 'Controlled negative.' },
          { name: 'Incline Dumbbell Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Arms behind body for maximum stretch.' },
          { name: 'Cable Curl', sets: 3, reps: '15', restSeconds: 45, tips: 'Constant tension.' },
          { name: 'Close-Grip Bench Press', sets: 4, reps: '8-10', restSeconds: 90, tips: 'Elbows in, touch sternum.' },
          { name: 'Cable Overhead Extension', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Full extension overhead.' },
          { name: 'Cable Pushdown', sets: 3, reps: '15-20', restSeconds: 45, tips: 'Lock upper arms, squeeze at bottom.' },
        ],
      },
      {
        name: 'Shoulders',
        muscleGroups: ['Delts', 'Traps'],
        estimatedMinutes: 50,
        exercises: [
          { name: 'Seated Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Control the eccentric.' },
          { name: 'Lateral Raise', sets: 4, reps: '15-20', restSeconds: 60, tips: 'Slight internal rotation, lead with pinky.' },
          { name: 'Reverse Pec Deck', sets: 3, reps: '15-20', restSeconds: 45, tips: "Rear delts are CBum's secret weapon." },
          { name: 'Front Raise', sets: 3, reps: '12-15', restSeconds: 45, tips: "Alternate arms, don't swing." },
        ],
      },
      {
        name: 'Legs',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        estimatedMinutes: 70,
        exercises: [
          { name: 'Leg Extension (Warmup)', sets: 3, reps: '20', restSeconds: 45, tips: 'Activates quads before heavy work.' },
          { name: 'Barbell Back Squat', sets: 4, reps: '8-12', restSeconds: 150, tips: 'CBum focuses on controlled descent.' },
          { name: 'Hack Squat', sets: 3, reps: '10-12', restSeconds: 120, tips: 'Feet high on platform.' },
          { name: 'Romanian Deadlift', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Feel the hamstring stretch, bar close to legs.' },
          { name: 'Lying Leg Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Slow eccentric.' },
          { name: 'Seated Calf Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: 'Full range.' },
        ],
      },
    ],
  },

  nippard_fundamentals: {
    id: 'nippard_fundamentals',
    name: 'Science Fundamentals',
    expert: 'Jeff Nippard',
    emoji: '🔬',
    difficulty: 'Intermediate',
    daysPerWeek: 4,
    focus: 'Evidence-Based',
    description: "Research-backed Upper/Lower split. 4 days/week, maximises frequency and volume for natural lifters.",
    color: '#0369a1',
    schedule: [
      {
        name: 'Upper A (Strength)',
        muscleGroups: ['Chest', 'Back', 'Shoulders', 'Arms'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Barbell Bench Press', sets: 4, reps: '4-6', restSeconds: 180, tips: 'Strength focus — heavy compound.' },
          { name: 'Barbell Row', sets: 3, reps: '6-8', restSeconds: 120, tips: 'Overhand, pull to waist.' },
          { name: 'Overhead Press', sets: 3, reps: '6-8', restSeconds: 120, tips: 'Strict form, no leg drive.' },
          { name: 'Pull-Up', sets: 3, reps: '6-10', restSeconds: 90, tips: 'Add weight if needed.' },
          { name: 'Incline Dumbbell Curl', sets: 2, reps: '10-15', restSeconds: 60, tips: 'Peak contraction.' },
          { name: 'Overhead Tricep Extension', sets: 2, reps: '10-15', restSeconds: 60, tips: 'Long head emphasis.' },
        ],
      },
      {
        name: 'Lower A (Strength)',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, reps: '4-6', restSeconds: 180, tips: 'Below parallel, brace core.' },
          { name: 'Romanian Deadlift', sets: 3, reps: '6-8', restSeconds: 120, tips: 'Hip hinge pattern.' },
          { name: 'Leg Press', sets: 3, reps: '10-12', restSeconds: 90, tips: 'Quad emphasis.' },
          { name: 'Leg Curl', sets: 3, reps: '10-12', restSeconds: 60, tips: 'Slow eccentric.' },
          { name: 'Calf Raise', sets: 4, reps: '10-15', restSeconds: 60, tips: 'Full range.' },
        ],
      },
      {
        name: 'Upper B (Hypertrophy)',
        muscleGroups: ['Chest', 'Back', 'Shoulders', 'Arms'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Incline Dumbbell Press', sets: 4, reps: '8-12', restSeconds: 90, tips: 'Higher rep hypertrophy focus.' },
          { name: 'Seated Cable Row', sets: 3, reps: '10-15', restSeconds: 75, tips: 'Full stretch on each rep.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: 'Evidence: 4 sets of laterals is optimal frequency.' },
          { name: 'Chest-Supported Row', sets: 3, reps: '10-15', restSeconds: 75, tips: 'Eliminates lower back fatigue.' },
          { name: 'Cable Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Constant tension.' },
          { name: 'Tricep Pushdown', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Rope for supination.' },
        ],
      },
      {
        name: 'Lower B (Hypertrophy)',
        muscleGroups: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Hack Squat', sets: 4, reps: '8-12', restSeconds: 90, tips: 'Feet close for quad focus.' },
          { name: 'Sumo Deadlift', sets: 3, reps: '8-10', restSeconds: 120, tips: 'Hip hinge, chest up.' },
          { name: 'Walking Lunge', sets: 3, reps: '12 each', restSeconds: 75, tips: 'Full stride, knee touches floor.' },
          { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60, tips: 'Slow eccentric 3 seconds.' },
          { name: 'Tibialis Raise', sets: 3, reps: '20', restSeconds: 45, tips: 'Nippard special: prevents shin splints.' },
        ],
      },
    ],
  },

  ct_strength: {
    id: 'ct_strength',
    name: 'ISYMFS Strength',
    expert: 'CT Fletcher',
    emoji: '💥',
    difficulty: 'Advanced',
    daysPerWeek: 5,
    focus: 'Strength + Mass',
    description: "It's Still Your Motherf***ing Set. Brutal compulsory squatting, high volume, and unbreakable will.",
    color: '#991b1b',
    schedule: [
      {
        name: 'Chest — ISYMFS',
        muscleGroups: ['Chest', 'Triceps'],
        estimatedMinutes: 80,
        exercises: [
          { name: 'Flat Barbell Press', sets: 6, reps: '10,8,6,4,4,4', restSeconds: 180, tips: 'CT: "The bench press is the most important exercise ever created for the upper body."' },
          { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', restSeconds: 90, tips: 'No stopping. ISYMFS.' },
          { name: 'Dumbbell Fly', sets: 4, reps: '12-15', restSeconds: 60, tips: 'Deep stretch, controlled arc.' },
          { name: 'Cable Crossover', sets: 3, reps: '15-20', restSeconds: 60, tips: 'Burn the muscle out.' },
          { name: 'Tricep Dip', sets: 4, reps: 'Failure', restSeconds: 60, tips: "Go until you can't go anymore." },
        ],
      },
      {
        name: 'Back — ISYMFS',
        muscleGroups: ['Back', 'Biceps'],
        estimatedMinutes: 75,
        exercises: [
          { name: 'Deadlift', sets: 5, reps: '5,5,3,3,1', restSeconds: 240, tips: "CT's bread and butter. Treat it like a max every session." },
          { name: 'Pull-Up', sets: 5, reps: 'Max', restSeconds: 90, tips: 'All the way up, all the way down.' },
          { name: 'T-Bar Row', sets: 4, reps: '8-10', restSeconds: 120, tips: 'Heavy weight, full range.' },
          { name: 'Seated Cable Row', sets: 3, reps: '12', restSeconds: 75, tips: 'Squeeze the back at peak contraction.' },
          { name: 'Barbell Curl', sets: 5, reps: '10,8,6,6,20', restSeconds: 75, tips: 'Compulsory curls — every session.' },
        ],
      },
    ],
  },

  dr_mike_mav: {
    id: 'dr_mike_mav',
    name: 'MAV Hypertrophy',
    expert: 'Dr. Mike Israetel',
    emoji: '📊',
    difficulty: 'Intermediate',
    daysPerWeek: 5,
    focus: 'RP Method',
    description: "Renaissance Periodization — train at Maximum Adaptive Volume. Evidence-based mesocycle progression.",
    color: '#065f46',
    schedule: [
      {
        name: 'Push (Chest/Shoulders/Triceps)',
        muscleGroups: ['Chest', 'Shoulders', 'Triceps'],
        estimatedMinutes: 65,
        exercises: [
          { name: 'Incline Barbell Press', sets: 4, reps: '10-12', restSeconds: 120, tips: 'RP: incline is superior for pec minor + upper chest.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, reps: '15-20', restSeconds: 45, tips: 'MEV for medial delts is 8 sets/week; this is 4.' },
          { name: 'Pec Deck Fly', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Isolation for maximum hypertrophy stimulus.' },
          { name: 'Overhead Press', sets: 3, reps: '8-12', restSeconds: 90, tips: 'Strict form, full ROM.' },
          { name: 'Cable Pushdown', sets: 3, reps: '15-20', restSeconds: 45, tips: 'Triceps have a MEV of 4-8 sets.' },
        ],
      },
      {
        name: 'Pull (Back/Biceps)',
        muscleGroups: ['Back', 'Biceps'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Lat Pulldown', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Lats: MEV 8 sets/week. Full stretch.' },
          { name: 'Cable Row', sets: 4, reps: '10-12', restSeconds: 90, tips: 'Rhomboids and mid-back volume.' },
          { name: 'Face Pull', sets: 3, reps: '15-20', restSeconds: 45, tips: 'Rear delts and external rotators.' },
          { name: 'Incline Curl', sets: 3, reps: '12-15', restSeconds: 60, tips: 'Biceps MEV 6-8 sets/week.' },
          { name: 'Hammer Curl', sets: 2, reps: '12-15', restSeconds: 60, tips: 'Brachialis for arm thickness.' },
        ],
      },
      {
        name: 'Legs A (Quad Focus)',
        muscleGroups: ['Quads', 'Calves'],
        estimatedMinutes: 60,
        exercises: [
          { name: 'Barbell Squat', sets: 4, reps: '8-12', restSeconds: 150, tips: 'Quads MAV: 12-20 sets/week. Start here.' },
          { name: 'Leg Press', sets: 3, reps: '12-15', restSeconds: 90, tips: 'Feet low for quad bias.' },
          { name: 'Leg Extension', sets: 3, reps: '15-20', restSeconds: 60, tips: 'Isolation for peak hypertrophy.' },
          { name: 'Calf Raise', sets: 5, reps: '10-15', restSeconds: 60, tips: 'Calves need high frequency and volume.' },
        ],
      },
    ],
  },
};
