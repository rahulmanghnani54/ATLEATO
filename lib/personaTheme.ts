/**
 * Persona Theme System
 *
 * Each coach is a complete identity, not just a workout schedule.
 * Picking a coach changes how the entire app reads:
 *   - Accent color and tone
 *   - Greeting and headline copy
 *   - Nutrition philosophy and macro targets
 *   - Voice rules (CT yells, Arnold inspires, Dr Mike calculates)
 *   - A daily quote in their voice
 *
 * The five personas map 1:1 to the EXPERT_PROGRAMS in `constants/experts.ts`.
 * Use `getPersonaTheme(programId)` anywhere the UI should reflect the user's chosen coach.
 */

export type PersonaId = 'cbum' | 'arnold' | 'nippard' | 'ct_fletcher' | 'dr_mike';

export interface PersonaTheme {
  id: PersonaId;
  // ── Identity ─────────────────────────────────────────────────────────────
  shortName: string;       // "CBUM"
  fullName: string;        // "Chris Bumstead"
  era: string;             // "Modern Classic Physique · 5× Mr Olympia"
  initials: string;        // "CB"

  // ── Visual ───────────────────────────────────────────────────────────────
  accent: string;          // primary accent color
  accentSoft: string;      // 12% tint for backgrounds
  ink: string;             // text color on the accent (light/dark text)
  textCase: 'normal' | 'upper';   // CT's UI is ALL CAPS, others normal
  vibe: string;            // single-word: "GOLDEN" / "CLINICAL" / "INTENSE" / "EVIDENCE" / "PRECISION"

  // ── Voice ────────────────────────────────────────────────────────────────
  greeting: (name: string) => string;         // home screen hero
  motivation: string;                          // tagline below greeting
  quoteOfDay: string[];                        // rotating quotes (sampled by day-of-year)
  workoutCTA: string;                          // button text e.g. "LET'S GROW" / "ATTACK IT"

  // ── Nutrition philosophy ─────────────────────────────────────────────────
  nutrition: {
    headline: string;                          // top-of-nutrition-tab tagline
    style: string;                             // one-line philosophy
    mealsPerDay: number;                       // signature meal count
    proteinPerKg: number;                      // g protein per kg bodyweight
    macroSplit: { protein: number; carbs: number; fat: number };  // % of cals
    signatureFoods: string[];                  // 4-6 staple foods
    cuttingApproach: string;                   // their approach to fat loss
    advice: string[];                          // 2-3 daily-rotation nutrition tips
  };

  // ── Training philosophy ──────────────────────────────────────────────────
  training: {
    signature: string;                         // their training tag
    focusOn: string[];                         // 2-3 things they emphasize
    avoid: string[];                           // 1-2 things they push back on
    signatureLifts: string[];                  // 3-5 pet exercises that define their training
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The five personas
// ─────────────────────────────────────────────────────────────────────────────

const ARNOLD: PersonaTheme = {
  id: 'arnold',
  shortName: 'ARNOLD',
  fullName: 'Arnold Schwarzenegger',
  era: 'Golden Era · 7× Mr Olympia',
  initials: 'AR',

  accent: '#f5b942',
  accentSoft: 'rgba(245,185,66,0.14)',
  ink: '#1a1208',
  textCase: 'normal',
  vibe: 'GOLDEN',

  greeting: (name) => `Welcome back, ${name || 'champion'}.`,
  motivation: 'The mind is the muscle. Train both.',
  quoteOfDay: [
    'The last three or four reps is what makes the muscle grow. This area of pain divides the champion from someone else.',
    'Strength does not come from winning. Your struggles develop your strengths.',
    'For me, life is continuously being hungry. The meaning of life is not simply to exist.',
    'I will not be a spectator in my own life.',
    'You can have results or excuses. Not both.',
    'The worst thing I can be is the same as everybody else. I hate that.',
  ],
  workoutCTA: "LET'S GROW",

  nutrition: {
    headline: 'Eat to build. Six meals. Every day.',
    style: 'Old-school mass building — high protein, high calories, never miss a meal.',
    mealsPerDay: 6,
    proteinPerKg: 2.2,
    macroSplit: { protein: 30, carbs: 45, fat: 25 },
    signatureFoods: ['Steak', 'Whole eggs', 'Brown rice', 'Whole milk', 'Tuna', 'Sweet potato'],
    cuttingApproach: 'Drop cardio in pre-contest weeks, hold protein high, cut carbs gradually.',
    advice: [
      'Six meals a day. Three hours apart. No exceptions.',
      'Real food first. Powders second.',
      'Steak and eggs is breakfast. Always was.',
    ],
  },

  training: {
    signature: 'High-volume double-split — AM chest/back, PM shoulders/arms.',
    focusOn: ['Mind-muscle connection', 'Full range of motion', 'The painful last 3-4 reps'],
    avoid: ['Skipping the warm-up', 'Going light on the basics'],
    signatureLifts: ['Arnold Press', 'Concentration Curl', 'Cable Crossover', 'Behind-the-Neck Pulldown'],
  },
};

const CBUM: PersonaTheme = {
  id: 'cbum',
  shortName: 'CBUM',
  fullName: 'Chris Bumstead',
  era: 'Modern Classic Physique · 5× Mr Olympia',
  initials: 'CB',

  accent: '#dfff1f',
  accentSoft: 'rgba(223,255,31,0.12)',
  ink: '#0a0b0d',
  textCase: 'normal',
  vibe: 'PRECISION',

  greeting: (name) => `Ready to work, ${name || 'friend'}?`,
  motivation: 'Quality reps. Controlled tempo. Stay humble.',
  quoteOfDay: [
    'Stay humble on the weight, the muscle will grow.',
    'It\'s not about the weight on the bar. It\'s about the tension on the muscle.',
    'Show up. Do the work. Don\'t make it more complicated than that.',
    'Discipline is doing it when you don\'t feel like it.',
    'The journey is the reward. Trophies just remind you of the path.',
    'Three seconds down, controlled, every rep.',
  ],
  workoutCTA: "LET'S GET TO WORK",

  nutrition: {
    headline: 'Periodized macros. Modern, flexible, sustainable.',
    style: 'Hit your numbers, prioritize whole foods, stay consistent.',
    mealsPerDay: 5,
    proteinPerKg: 2.0,
    macroSplit: { protein: 30, carbs: 50, fat: 20 },
    signatureFoods: ['Chicken breast', 'White rice', 'Egg whites', 'Lean steak', 'Greek yogurt', 'Berries'],
    cuttingApproach: 'Slow cut, drop calories 200/week, keep protein up, add cardio gradually.',
    advice: [
      'Hit protein first. The rest follows.',
      'Track for a week, then trust your habits.',
      'No food is off-limits — fit it in or skip it.',
    ],
  },

  training: {
    signature: 'Push-Pull-Legs, classic physique focus, controlled tempo.',
    focusOn: ['Slow eccentrics', 'Mind-muscle connection', 'Recovery between sessions'],
    avoid: ['Ego lifting', 'Cheat reps that bypass the target muscle'],
    signatureLifts: ['Incline DB Press', 'Heavy Stiff-Leg Deadlift', 'Hack Squat', 'Posing Practice'],
  },
};

const NIPPARD: PersonaTheme = {
  id: 'nippard',
  shortName: 'NIPPARD',
  fullName: 'Jeff Nippard',
  era: 'Evidence-based · MSc · Drug-free',
  initials: 'JN',

  accent: '#5b8cff',
  accentSoft: 'rgba(91,140,255,0.14)',
  ink: '#fafafa',
  textCase: 'normal',
  vibe: 'EVIDENCE',

  greeting: (name) => `Let\'s look at the data, ${name || 'lifter'}.`,
  motivation: 'Optimal ROM, progressive overload, controlled fatigue.',
  quoteOfDay: [
    'The best workout is the one you\'ll actually do — consistently — for years.',
    'Lengthened-position training drives more hypertrophy than shortened. The data is clear.',
    'Volume drives hypertrophy. But only the volume you can recover from.',
    'RIR 1-3 is the productive zone. Going to failure on everything is overrated.',
    'Train each muscle 2× per week. The literature agrees.',
    'Sleep > supplements. By a wide margin.',
  ],
  workoutCTA: 'START SESSION',

  nutrition: {
    headline: 'Track macros. Train hard. Trust the data.',
    style: 'Evidence-based: protein for muscle, carbs for performance, fat for hormones.',
    mealsPerDay: 4,
    proteinPerKg: 1.8,
    macroSplit: { protein: 30, carbs: 45, fat: 25 },
    signatureFoods: ['Chicken thigh', 'Rice', 'Oats', 'Whey protein', 'Avocado', 'Vegetables'],
    cuttingApproach: 'Reverse-diet first, then -300 to -500 cal deficit, weekly weigh-ins, adjust.',
    advice: [
      '1.6-2.2g protein per kg bodyweight covers >95% of lifters.',
      'Weigh yourself every morning. Use the weekly average.',
      'Fiber 25-35g/day. Most people are way under.',
    ],
  },

  training: {
    signature: 'Hypertrophy-focused PPL, 2× per week per muscle, RIR-based intensity.',
    focusOn: ['Stretched-position work', 'RIR 1-3 working sets', 'Exercise selection by EMG data'],
    avoid: ['Junk volume', 'Training to failure on compounds every set'],
    signatureLifts: ['Smith Bulgarian Split Squat', 'Cable Lateral Raise', 'Pec Deck', 'RDL'],
  },
};

const CT_FLETCHER: PersonaTheme = {
  id: 'ct_fletcher',
  shortName: 'CT',
  fullName: 'CT Fletcher',
  era: 'Iron Addict · "I COMMAND YOU TO GROW"',
  initials: 'CT',

  accent: '#ff4d2e',
  accentSoft: 'rgba(255,77,46,0.14)',
  ink: '#fafafa',
  textCase: 'upper',
  vibe: 'INTENSE',

  greeting: (name) => `${(name || 'WARRIOR').toUpperCase()}. GET READY TO WORK.`,
  motivation: 'I COMMAND YOU TO GROW.',
  quoteOfDay: [
    'I COMMAND YOU TO GROW!',
    'NO EXCUSES. NO COMPLAINTS. JUST WORK.',
    'YOUR MIND WILL QUIT A THOUSAND TIMES BEFORE YOUR BODY EVER DOES.',
    'PAIN IS WEAKNESS LEAVING THE BUILDING.',
    'IT\'S STILL YO MOTHA\' FUCKIN\' SET.',
    'YOU\'RE NOT TIRED, YOU\'RE WEAK. WORK HARDER.',
  ],
  workoutCTA: 'ATTACK IT',

  nutrition: {
    headline: 'EAT BIG. LIFT BIG. NO APOLOGIES.',
    style: 'Old-school: real food, lots of it, fuel the work.',
    mealsPerDay: 5,
    proteinPerKg: 2.2,
    macroSplit: { protein: 35, carbs: 45, fat: 20 },
    signatureFoods: ['Steak', 'Chicken', 'Rice', 'Eggs', 'Sweet potato', 'Salmon'],
    cuttingApproach: 'NO CUTTING UNTIL YOU EARN THE SIZE. EAT TO GROW FIRST.',
    advice: [
      'EAT BIG. SMALL FOOD = SMALL MUSCLE.',
      'PROTEIN EVERY MEAL. NO EXCEPTIONS.',
      'STOP COUNTING ALMONDS. START EATING.',
    ],
  },

  training: {
    signature: 'Heavy, brutal, raw — strict form on max effort sets.',
    focusOn: ['Strict form even with heavy weight', 'Going past your perceived limit', 'Squeezing every rep'],
    avoid: ['Sloppy cheat reps', 'Quitting before the set is done'],
    signatureLifts: ['Behind-the-Neck Press', 'Strict Barbell Curl', 'Heavy Deadlift', 'T-Bar Row'],
  },
};

const DR_MIKE: PersonaTheme = {
  id: 'dr_mike',
  shortName: 'DR MIKE',
  fullName: 'Dr Mike Israetel',
  era: 'RP Strength · PhD Sport Physiology',
  initials: 'DM',

  accent: '#00e0a4',
  accentSoft: 'rgba(0,224,164,0.12)',
  ink: '#0a0b0d',
  textCase: 'normal',
  vibe: 'CLINICAL',

  greeting: (name) => `Welcome to mesocycle progress, ${name || 'lifter'}.`,
  motivation: 'MEV → MAV → MRV → deload. Repeat.',
  quoteOfDay: [
    'Progressive overload over time + good technique + adequate recovery = consistent gains.',
    'If you\'re not making progress, you\'re either undertrained, overtrained, or undereating.',
    'Stimulus-to-fatigue ratio is the only metric that matters long-term.',
    'Volume drives growth, intensity protects strength, frequency drives skill.',
    'A great program executed mediocre beats a perfect program never finished.',
    'Recovery is when the muscle grows. Don\'t skip the deload.',
  ],
  workoutCTA: 'BEGIN SESSION',

  nutrition: {
    headline: 'Periodized phases. Hard numbers. Real results.',
    style: 'Cut → maintain → bulk in deliberate phases. Track everything.',
    mealsPerDay: 5,
    proteinPerKg: 2.0,
    macroSplit: { protein: 30, carbs: 50, fat: 20 },
    signatureFoods: ['Lean ground beef', 'Rice', 'Oats', 'Whey', 'Almonds', 'Cottage cheese'],
    cuttingApproach: 'Mini-cut: 4-6 weeks at -500 cal/day, then maintain 8-12 weeks, then bulk.',
    advice: [
      'Cut for 4-6 weeks max, then maintain. Long cuts kill muscle.',
      'Protein: 2.2g per kg bodyweight. Spread across 4-5 meals.',
      'Bulk slowly: +200 cal/week. Fast bulks = fast fat gain.',
    ],
  },

  training: {
    signature: 'Mesocycle periodization — MEV start, push to MRV, deload, repeat.',
    focusOn: ['Volume progression week-to-week', 'Stimulus-to-fatigue ratio', 'Mandatory deloads'],
    avoid: ['Never deloading', 'Random workouts with no progression plan'],
    signatureLifts: ['Pendulum Squat', 'Hack Squat', 'Plate-Loaded Lateral Raise', 'Smith Press'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + lookup
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAS: Record<PersonaId, PersonaTheme> = {
  arnold:      ARNOLD,
  cbum:        CBUM,
  nippard:     NIPPARD,
  ct_fletcher: CT_FLETCHER,
  dr_mike:     DR_MIKE,
};

export function getPersona(id: PersonaId): PersonaTheme {
  return PERSONAS[id] ?? CBUM;
}

/** Resolve any program-id (e.g. "arnold_blueprint", "dr_mike_mav") to its persona. */
export function personaFromProgramId(programId: string | null | undefined): PersonaTheme {
  const pid = (programId ?? '').toLowerCase();
  if (pid.startsWith('arnold'))      return ARNOLD;
  if (pid.startsWith('cbum'))        return CBUM;
  if (pid.startsWith('nippard'))     return NIPPARD;
  if (pid.startsWith('ct_fletcher') || pid.startsWith('ct_')) return CT_FLETCHER;
  if (pid.startsWith('dr_mike'))     return DR_MIKE;
  return CBUM;
}

/** Pick today's quote deterministically — same coach + same day = same quote. */
export function quoteOfTheDay(persona: PersonaTheme): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return persona.quoteOfDay[day % persona.quoteOfDay.length];
}

/** Pick today's nutrition advice the same way. */
export function nutritionTipOfTheDay(persona: PersonaTheme): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return persona.nutrition.advice[day % persona.nutrition.advice.length];
}

/** Apply the persona's text-case rule. CT shouts; the others speak normally. */
export function styleText(persona: PersonaTheme, text: string): string {
  return persona.textCase === 'upper' ? text.toUpperCase() : text;
}
