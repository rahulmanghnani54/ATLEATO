export interface LibraryExercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  tips: string[];
}

export interface MuscleGroup {
  id: string;
  label: string;
  emoji: string;
  exercises: LibraryExercise[];
}

export const EXERCISE_LIBRARY: MuscleGroup[] = [
  {
    id: 'chest',
    label: 'Chest',
    emoji: '💪',
    exercises: [
      { name: 'Barbell Bench Press',      sets: 4, reps: '6-10',  restSeconds: 120, tips: ['Touch chest, full lockout.', 'Retract scapula before pressing.'] },
      { name: 'Incline Barbell Press',    sets: 4, reps: '8-10',  restSeconds: 90,  tips: ['30-45° incline.', 'Pause at chest for max stretch.'] },
      { name: 'Incline Dumbbell Press',   sets: 4, reps: '10-12', restSeconds: 90,  tips: ['Full stretch at bottom.', 'Drive elbows up, not just hands.'] },
      { name: 'Flat Dumbbell Press',      sets: 3, reps: '10-12', restSeconds: 90,  tips: ['Touch at bottom.', 'Squeeze hard at top.'] },
      { name: 'Cable Crossover',          sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Slow negative.', 'Squeeze at full contraction.'] },
      { name: 'Pec Deck / Machine Fly',   sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Control the return.', 'Lead with elbows, not hands.'] },
      { name: 'Dumbbell Fly',             sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Slight elbow bend throughout.', 'Feel the stretch at the bottom.'] },
      { name: 'Push-Up',                  sets: 4, reps: 'Failure', restSeconds: 60, tips: ['Elbows at 45°.', 'Full chest-to-floor range.'] },
      { name: 'Decline Bench Press',      sets: 3, reps: '8-12',  restSeconds: 90,  tips: ['Great for lower chest thickness.', 'Control the descent.'] },
    ],
  },
  {
    id: 'back',
    label: 'Back',
    emoji: '🔙',
    exercises: [
      { name: 'Deadlift',                 sets: 4, reps: '5-6',   restSeconds: 180, tips: ['Bar over mid-foot.', 'Hinge at hips, neutral spine.', 'Push the floor away.'] },
      { name: 'Barbell Row',              sets: 4, reps: '8-10',  restSeconds: 90,  tips: ['Overhand grip, pull to lower chest.', 'Keep back parallel to floor.'] },
      { name: 'Wide-Grip Pull-Up',        sets: 4, reps: '8-12',  restSeconds: 90,  tips: ['Full dead hang at bottom.', 'Chin clears bar at top.'] },
      { name: 'Lat Pulldown',             sets: 4, reps: '10-12', restSeconds: 75,  tips: ['Arch back slightly, pull to upper chest.', 'Drive elbows into pockets.'] },
      { name: 'Cable Row (Seated)',        sets: 3, reps: '10-12', restSeconds: 75,  tips: ['Full stretch at front.', 'Drive elbows back, squeeze.'] },
      { name: 'Single-Arm Dumbbell Row',  sets: 3, reps: '10-12', restSeconds: 60,  tips: ['Chest braced on bench.', 'Pull elbow to ceiling.'] },
      { name: 'T-Bar Row',                sets: 3, reps: '8-10',  restSeconds: 90,  tips: ['Use chest pad for stability.', 'Full range of motion.'] },
      { name: 'Rack Pull',                sets: 3, reps: '5-6',   restSeconds: 120, tips: ['Bar below knee level.', 'Great for upper back thickness.'] },
      { name: 'Chest-Supported Row',      sets: 3, reps: '12-15', restSeconds: 60,  tips: ['No body English.', 'Pause at peak contraction.'] },
    ],
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    emoji: '🏋️',
    exercises: [
      { name: 'Overhead Press (Barbell)', sets: 4, reps: '6-10',  restSeconds: 120, tips: ['Bar touches upper chest at bottom.', 'Full lockout at top.'] },
      { name: 'Seated Dumbbell Press',    sets: 4, reps: '10-12', restSeconds: 90,  tips: ['The Monument Press variation — rotate wrists at top.', 'Full range.'] },
      { name: 'Lateral Raise',            sets: 4, reps: '15-20', restSeconds: 60,  tips: ['Slight forward lean.', 'Lead with elbows, not hands.', 'No swinging.'] },
      { name: 'Cable Lateral Raise',      sets: 3, reps: '15-20', restSeconds: 60,  tips: ['Constant tension vs dumbbells.', 'Keep body upright.'] },
      { name: 'Rear Delt Fly',            sets: 3, reps: '15-20', restSeconds: 60,  tips: ['Bent over 90°.', 'Drive elbows back, not up.'] },
      { name: 'Face Pull',                sets: 3, reps: '15-20', restSeconds: 60,  tips: ['Pull to forehead level.', 'Elbows high throughout.'] },
      { name: 'Front Raise',              sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Alternate arms or both together.', 'Control the negative.'] },
      { name: 'Upright Row',              sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Wide grip for shoulder emphasis.', 'Elbows stay higher than wrists.'] },
      { name: 'Machine Shoulder Press',   sets: 3, reps: '12-15', restSeconds: 75,  tips: ['Great for volume work.', 'Pause at top for contraction.'] },
    ],
  },
  {
    id: 'biceps',
    label: 'Biceps',
    emoji: '💪',
    exercises: [
      { name: 'Barbell Curl',             sets: 4, reps: '8-12',  restSeconds: 75,  tips: ['No swinging.', 'Squeeze at top for 1 second.'] },
      { name: 'Incline Dumbbell Curl',    sets: 3, reps: '10-12', restSeconds: 75,  tips: ['Full stretch at bottom.', 'Best long-head activation.'] },
      { name: 'Concentration Curl',       sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Elbow braced on inner thigh.', 'Full range of motion.'] },
      { name: 'Cable Curl',               sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Constant tension throughout.', 'Elbows stay fixed.'] },
      { name: 'Hammer Curl',              sets: 3, reps: '10-12', restSeconds: 60,  tips: ['Neutral grip hits brachialis.', 'Keep elbows locked at sides.'] },
      { name: 'Preacher Curl',            sets: 3, reps: '10-12', restSeconds: 75,  tips: ['Full stretch at bottom.', 'Don\'t hyperextend at bottom.'] },
      { name: 'EZ-Bar Curl',              sets: 4, reps: '10-12', restSeconds: 75,  tips: ['Easier on wrists than straight bar.', 'Controlled tempo.'] },
      { name: 'Spider Curl',              sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Chest on incline bench.', 'Great peak contraction.'] },
    ],
  },
  {
    id: 'triceps',
    label: 'Triceps',
    emoji: '🦾',
    exercises: [
      { name: 'Close-Grip Bench Press',   sets: 4, reps: '8-10',  restSeconds: 90,  tips: ['Shoulder-width grip.', 'Elbows slightly tucked.', 'Full lockout at top.'] },
      { name: 'Skull Crusher',            sets: 4, reps: '10-12', restSeconds: 75,  tips: ['Lower to forehead or over head.', 'Full extension at top.'] },
      { name: 'Tricep Pushdown',          sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Lock elbows to sides.', 'Full extension at bottom.'] },
      { name: 'Overhead Tricep Extension', sets: 3, reps: '12-15', restSeconds: 60, tips: ['Full stretch at bottom.', 'Elbows close to head.'] },
      { name: 'Dips (Tricep)',            sets: 4, reps: '8-12',  restSeconds: 90,  tips: ['Upright torso — leans forward hits chest.', 'Full lockout at top.'] },
      { name: 'Cable Overhead Extension', sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Face away from cable.', 'Full stretch at bottom.'] },
      { name: 'Tricep Kickback',          sets: 3, reps: '15',    restSeconds: 60,  tips: ['Full extension, squeeze at top.', 'Slow negative.'] },
      { name: 'Diamond Push-Up',          sets: 3, reps: 'Failure', restSeconds: 60, tips: ['Hands form diamond shape.', 'Elbows stay close to body.'] },
    ],
  },
  {
    id: 'legs',
    label: 'Legs',
    emoji: '🦵',
    exercises: [
      { name: 'Barbell Back Squat',       sets: 4, reps: '6-10',  restSeconds: 180, tips: ['Knees track toes.', 'Break parallel.', 'Chest up throughout.'] },
      { name: 'Romanian Deadlift',        sets: 4, reps: '8-10',  restSeconds: 90,  tips: ['Hip hinge, soft knee bend.', 'Feel hamstring stretch.'] },
      { name: 'Leg Press',                sets: 4, reps: '10-15', restSeconds: 90,  tips: ['Full range.', 'Don\'t lock knees at top.', 'Foot position changes target.'] },
      { name: 'Bulgarian Split Squat',    sets: 3, reps: '10-12', restSeconds: 90,  tips: ['Rear foot on bench.', 'Front knee over toes.', 'Great glute/quad activation.'] },
      { name: 'Leg Curl (Lying)',         sets: 4, reps: '10-12', restSeconds: 75,  tips: ['Full stretch at bottom.', 'Pause at peak.', 'Hips flat on bench.'] },
      { name: 'Leg Extension',            sets: 3, reps: '12-15', restSeconds: 60,  tips: ['Full extension.', 'Pause at top for quad contraction.'] },
      { name: 'Hack Squat',               sets: 3, reps: '10-12', restSeconds: 90,  tips: ['Feet low for more quad.', 'Control the descent.'] },
      { name: 'Sumo Deadlift',            sets: 3, reps: '6-8',   restSeconds: 120, tips: ['Wide stance, toes flared.', 'Targets inner thighs and glutes.'] },
      { name: 'Walking Lunge',            sets: 3, reps: '12/leg', restSeconds: 75, tips: ['Big step forward.', 'Knee touches floor lightly.'] },
    ],
  },
  {
    id: 'glutes',
    label: 'Glutes',
    emoji: '🍑',
    exercises: [
      { name: 'Hip Thrust (Barbell)',     sets: 4, reps: '10-12', restSeconds: 90,  tips: ['Shoulders on bench.', 'Drive through heels.', 'Pause at top, squeeze hard.'] },
      { name: 'Glute Bridge',             sets: 3, reps: '15-20', restSeconds: 60,  tips: ['Single-leg variation for more intensity.', 'Hold at top.'] },
      { name: 'Cable Kickback',           sets: 3, reps: '15/leg', restSeconds: 60, tips: ['Slight forward lean.', 'Squeeze glute at top.'] },
      { name: 'Romanian Deadlift',        sets: 4, reps: '8-12',  restSeconds: 90,  tips: ['Hip hinge, neutral spine.', 'Feel glute and hamstring stretch.'] },
      { name: 'Step-Up',                  sets: 3, reps: '12/leg', restSeconds: 60, tips: ['Full extension at top.', 'Control the step down.'] },
      { name: 'Reverse Hyperextension',   sets: 3, reps: '15',    restSeconds: 60,  tips: ['Great for glute-ham tie-in.', 'Don\'t use momentum.'] },
    ],
  },
  {
    id: 'calves',
    label: 'Calves',
    emoji: '🦶',
    exercises: [
      { name: 'Standing Calf Raise',      sets: 5, reps: '15-20', restSeconds: 60,  tips: ['Full stretch at bottom.', 'Pause at peak.', 'Both straight and bent-knee sets.'] },
      { name: 'Seated Calf Raise',        sets: 4, reps: '15-20', restSeconds: 60,  tips: ['Targets soleus (under gastrocnemius).', 'Slow tempo.'] },
      { name: 'Leg Press Calf Raise',     sets: 3, reps: '20',    restSeconds: 60,  tips: ['Good for high reps.', 'Full range of motion.'] },
      { name: 'Donkey Calf Raise',        sets: 4, reps: '15-20', restSeconds: 60,  tips: ['Bend at 90°.', 'Great stretch at bottom.'] },
    ],
  },
  {
    id: 'core',
    label: 'Core',
    emoji: '🔥',
    exercises: [
      { name: 'Cable Crunch',             sets: 4, reps: '15-20', restSeconds: 60,  tips: ['Round spine, don\'t hip flex.', 'Full stretch at top.'] },
      { name: 'Plank',                    sets: 3, reps: '60s',   restSeconds: 60,  tips: ['Neutral spine.', 'Squeeze glutes and abs throughout.'] },
      { name: 'Hanging Leg Raise',        sets: 3, reps: '12-15', restSeconds: 60,  tips: ['No swinging.', 'Posterior pelvic tilt at top.'] },
      { name: 'Ab Wheel Rollout',         sets: 3, reps: '10-15', restSeconds: 75,  tips: ['Knees or feet.', 'Pull back with abs, not arms.'] },
      { name: 'Russian Twist',            sets: 3, reps: '20',    restSeconds: 60,  tips: ['Feet off floor for harder version.', 'Rotate with obliques.'] },
      { name: 'Decline Sit-Up',           sets: 3, reps: '15-20', restSeconds: 60,  tips: ['Slow negative.', 'No neck strain.'] },
      { name: 'Side Plank',               sets: 3, reps: '45s/side', restSeconds: 60, tips: ['Hip stacked.', 'Don\'t let hip drop.'] },
    ],
  },
];
