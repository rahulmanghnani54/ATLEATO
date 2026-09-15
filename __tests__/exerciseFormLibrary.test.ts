/**
 * The form library decides three things the user can see: which technique
 * card opens for an exercise, whether FORM CHECK is offered at all, and which
 * biomechanical profile grades the set. A wrong match is not cosmetic — an
 * incline curl graded as a press, or a leg curl opening a camera that can never
 * count a rep, is the failure the vision-coverage gate exists to prevent. So
 * the matcher is pinned name-by-name, and every claim the content makes about
 * the engine (detected faults, required landmarks) is checked against the
 * engine itself rather than a copied list.
 */
import {
  EXERCISE_FORM_LIBRARY,
  detectedFaultsFor,
  getExerciseForm,
  getExerciseFormKey,
  getOwnExerciseForm,
  getOwnTechnique,
  hasOwnTechniqueContent,
  getCoachCue,
  hasVisionCoverage,
  keyPointsFor,
  requiredLandmarksFor,
  tipsForExercise,
  visionCategoryFor,
  visionCategoryForName,
  type ExerciseForm,
  type VisionCategory,
} from '@/constants/exerciseFormLibrary';
import { getTechniqueCard } from '@/constants/techniqueCards';
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { getProfile } from '@/lib/vision/biomechanics';

// Library order. The id doubles as the tutorial-memory and clip-file key, so
// it must equal the const name the entry is declared under and never repeat.
const EXPECTED_IDS = [
  'leg_curl',
  'barbell_squat',
  'goblet_squat',
  'lunge',
  'deadlift',
  'romanian_deadlift',
  'bench_press',
  'incline_db_press',
  'overhead_press',
  'lateral_raise',
  'pullup',
  'barbell_row',
  'bicep_curl',
  'tricep_pushdown',
];

function formOrFail(name: string): ExerciseForm {
  const form = getExerciseForm(name);
  if (!form) throw new Error(`expected a form for "${name}"`);
  return form;
}

describe('getExerciseForm — matcher table', () => {
  // name → [form id, engine category]. null id = no form at all.
  const TABLE: Array<[string, string | null, VisionCategory | null]> = [
    ['Barbell Bench Press',       'bench_press',       'press'],
    ['Incline Barbell Press',     'incline_db_press',  'press'],
    ['Incline Dumbbell Curl',     'bicep_curl',        'curl'],
    ['Incline Curl',              'bicep_curl',        'curl'],
    ['Romanian Deadlift',         'romanian_deadlift', 'deadlift'],
    ['Seated Barbell Press',      'overhead_press',    'press'],
    ['Seated Dumbbell Press',     'overhead_press',    'press'],
    ['Flat Dumbbell Press',       'bench_press',       'press'],
    ['Step-Up',                   'lunge',             'lunge'],
    ['Walking Lunge',             'lunge',             'lunge'],
    ['Bulgarian Split Squat',     'lunge',             'lunge'],
    ['Lateral Raise',             'lateral_raise',     null],
    ['Seated Leg Curl',           'leg_curl',          null],
    ['Overhead Tricep Extension', null,                null],
    ['Hack Squat',                'barbell_squat',     'squat'],
    ['Pull-Up',                   'pullup',            'pull'],
  ];

  test.each(TABLE)('%s → %s / %s', (name, id, category) => {
    const form = getExerciseForm(name);
    expect(form?.id ?? null).toBe(id);
    expect(visionCategoryFor(form)).toBe(category);
  });

  it('normalises hyphens, underscores, case and runs of whitespace', () => {
    expect(getExerciseForm('  step_up ')?.id).toBe('lunge');
    expect(getExerciseForm('PULL-UP')?.id).toBe('pullup');
    expect(getExerciseForm('Chin-Up')?.id).toBe('pullup');
  });

  it('an exact exerciseName beats a longer keyword on another entry', () => {
    // 'Romanian Deadlift' is also a substring hit for deadlift's 'deadlift'.
    expect(getExerciseForm('romanian deadlift')?.id).toBe('romanian_deadlift');
  });

  it('returns null for an empty or unknown name', () => {
    expect(getExerciseForm('')).toBeNull();
    expect(getExerciseForm('Plank')).toBeNull();
  });
});

describe('hasVisionCoverage', () => {
  it.each(['Lateral Raise', 'Leg Curl', 'Overhead Tricep Extension'])(
    'is false for %s — no engine profile can count its reps', (name) => {
      expect(hasVisionCoverage(name)).toBe(false);
    },
  );

  it.each(['Bench Press', 'Barbell Back Squat', 'Lunge'])('is true for %s', (name) => {
    expect(hasVisionCoverage(name)).toBe(true);
  });
});

describe('library content', () => {
  it('every entry has id === its const name, in library order, and ids are unique', () => {
    const ids = EXERCISE_FORM_LIBRARY.map((f) => f.id);
    expect(ids).toEqual(EXPECTED_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EXERCISE_FORM_LIBRARY.map((f) => [f.id, f] as const))(
    '%s: every detectedFaults.checkId exists in its engine profile', (_id, form) => {
      const profile = getProfile(visionCategoryFor(form) ?? undefined);
      const known = profile.checks.map((c) => c.id);
      for (const fault of form.detectedFaults ?? []) {
        expect(known).toContain(fault.checkId);
        expect(fault.label.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(EXERCISE_FORM_LIBRARY.map((f) => [f.id, f] as const))(
    '%s: ships key points, a camera angle and a sane clip descriptor', (_id, form) => {
      expect(form.keyPoints?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(form.keyPoints?.length ?? 0).toBeLessThanOrEqual(5);
      expect(['side', 'front', 'front_45']).toContain(form.cameraAngle);
      expect(form.cameraNote?.trim().length ?? 0).toBeGreaterThan(0);
      // null = convention (`<id>_v1.mp4`); a descriptor may only ever move the
      // version FORWARD — v1 is taken by whatever was uploaded first.
      if (form.tutorial !== null) {
        expect(Number.isInteger(form.tutorial?.version)).toBe(true);
        expect(form.tutorial!.version).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it('entries with no engine profile claim no detected faults', () => {
    for (const form of EXERCISE_FORM_LIBRARY) {
      if (visionCategoryFor(form) === null) {
        expect(form.detectedFaults ?? []).toEqual([]);
      }
    }
  });

  it('visionCategory overrides the category default in both directions', () => {
    expect(formOrFail('Lateral Raise').category).toBe('isolation');
    expect(visionCategoryFor(formOrFail('Lateral Raise'))).toBeNull();
    expect(formOrFail('Lunge').category).toBe('squat');
    expect(visionCategoryFor(formOrFail('Lunge'))).toBe('lunge');
    expect(visionCategoryFor(null)).toBeNull();
  });
});

describe('getCoachCue', () => {
  const form = formOrFail('Bench Press');
  const ctLine = form.coachCues.find((c) => c.coachId === 'ct_fletcher')!.cue;
  const drMikeLine = form.coachCues.find((c) => c.coachId === 'dr_mike')!.cue;
  const cbumLine = form.coachCues.find((c) => c.coachId === 'cbum')!.cue;

  it.each(['ct_strength', 'ct', 'ct_fletcher'])('%s resolves to the CT line', (id) => {
    expect(getCoachCue(form, id)).toBe(ctLine);
  });

  it.each(['dr_mike_mav', 'drmike', 'dr_mike'])('%s resolves to the Dr Mike line', (id) => {
    expect(getCoachCue(form, id)).toBe(drMikeLine);
  });

  it('program ids for the other coaches resolve too', () => {
    expect(getCoachCue(form, 'cbum_evolved')).toBe(cbumLine);
    expect(getCoachCue(form, 'arnold_blueprint'))
      .toBe(form.coachCues.find((c) => c.coachId === 'arnold')!.cue);
    expect(getCoachCue(form, 'nippard_fundamentals'))
      .toBe(form.coachCues.find((c) => c.coachId === 'nippard')!.cue);
  });

  it('an unknown coach falls back to the first cue', () => {
    expect(getCoachCue(form, 'nobody')).toBe(form.coachCues[0].cue);
  });
});

describe('getExerciseFormKey', () => {
  it('uses the form id only when the entry IS the exercise', () => {
    expect(getExerciseFormKey('Barbell Bench Press')).toBe('bench_press');
    expect(getExerciseFormKey('Walking Lunge')).toBe('lunge');
  });

  it('gives a variant its own key even though it shares the engine profile', () => {
    // Step-Up is judged by the lunge profile but is not the lunge: its memory
    // and any future clip must not be the lunge's. Both now own a technique
    // card, so the key is the card id — which the catalog spelled as the slug.
    expect(getExerciseFormKey('Step-Up')).toBe('step_up');
    expect(getExerciseFormKey('Decline Bench Press')).toBe('decline_bench_press');
    expect(hasVisionCoverage('Step-Up')).toBe(true);
  });

  it('uses the technique card id, so a labelled variant shares its card memory', () => {
    // 'Leg Extension (Warmup)' is an alias of the leg_extension card: one clip,
    // one "seen it", not a phantom 'leg_extension_warmup' key.
    expect(getExerciseFormKey('Rack Pull')).toBe('rack_pull');
    expect(getExerciseFormKey('Leg Extension (Warmup)')).toBe('leg_extension');
    expect(getExerciseFormKey('  T-Bar Row ')).toBe('t_bar_row');
  });

  it('slugs the name when no table owns it', () => {
    expect(getExerciseFormKey('Underwater Basket Weaving')).toBe('underwater_basket_weaving');
    expect(getExerciseFormKey('  Odd  Lift (Test) ')).toBe('odd_lift_test');
  });
});

describe('requiredLandmarksFor', () => {
  it('mirrors the engine profile for a covered exercise', () => {
    expect(requiredLandmarksFor(formOrFail('Bench Press'))).toEqual(getProfile('press').requiredJoints);
    expect(requiredLandmarksFor(formOrFail('Deadlift'))).toEqual(getProfile('deadlift').requiredJoints);
    expect(requiredLandmarksFor(formOrFail('Lunge'))).toEqual(getProfile('lunge').requiredJoints);
  });

  it('is empty when there is no profile', () => {
    expect(requiredLandmarksFor(null)).toEqual([]);
    expect(requiredLandmarksFor(formOrFail('Lateral Raise'))).toEqual([]);
  });
});

describe('keyPointsFor / tipsForExercise', () => {
  it('prefers the authored key points of a matched form', () => {
    expect(keyPointsFor('Barbell Bench Press')).toEqual(formOrFail('Bench Press').keyPoints);
  });

  it('uses the technique card when no form entry owns the name', () => {
    // Rack Pull has no ExerciseForm; its card's key points are its own text.
    const points = keyPointsFor('Rack Pull');
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points).toEqual(getTechniqueCard('Rack Pull')!.keyPoints);
    expect(points).toEqual(getOwnTechnique('Rack Pull')!.keyPoints);
  });

  it('reaches expert-program tips for exercises the library does not list', () => {
    // 'Rotating DB Press' exists only in the CT program.
    expect(tipsForExercise('Rotating DB Press').length).toBeGreaterThan(0);
  });

  it('is empty, not a placeholder, for an unknown exercise', () => {
    expect(tipsForExercise('Underwater Basket Weaving')).toEqual([]);
    expect(keyPointsFor('Underwater Basket Weaving')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Own content vs family match. The first device run showed Lat Pulldown
// playing the pull-up clip under "chin over bar", Incline BARBELL Press
// telling the lifter to lower the DUMBBELLS, Decline Bench with the flat
// bench clip and Machine Shoulder Press with a standing barbell. A variant
// may share an entry's engine profile; it may never borrow its technique.
// ─────────────────────────────────────────────────────────────────────────────

describe('own technique content is exact-name only', () => {
  it.each([
    ['Barbell Bench Press', 'bench_press'],
    ['Flat Barbell Press', 'bench_press'],
    ['Incline Dumbbell Press', 'incline_db_press'],
    ['Overhead Press (Barbell)', 'overhead_press'],
    ['Pull-Up', 'pullup'],
    ['Wide-Grip Pull-Up', 'pullup'],
    ['Barbell Squat', 'barbell_squat'],
    ['EZ-Bar Curl', 'bicep_curl'],
    ['Cable Pushdown', 'tricep_pushdown'],
    ['Lying Leg Curl', 'leg_curl'],
  ])('%s owns %s', (name, id) => {
    expect(getOwnExerciseForm(name)?.id).toBe(id);
    expect(hasOwnTechniqueContent(name)).toBe(true);
  });

  // name → [family form id, family engine profile, own card id, card's engine profile].
  // These were once bare family matches (Form Check + "clip coming soon" + tips).
  // Batch 2 gave each its own TechniqueCard, so they are OWN content now — but
  // the card's, never the family form's: the borrowed-text check still holds.
  it.each([
    ['Lat Pulldown',            'pullup',           'pull',     'lat_pulldown',           'pull'],
    ['Close-Grip Lat Pulldown', 'pullup',           'pull',     'lat_pulldown',           'pull'],
    ['Incline Barbell Press',   'incline_db_press', 'press',    'incline_barbell_press',  'press'],
    ['Decline Bench Press',     'bench_press',      'press',    'decline_bench_press',    'press'],
    ['Close-Grip Bench Press',  'bench_press',      'press',    'close_grip_bench_press', 'press'],
    ['Machine Shoulder Press',  'overhead_press',   'press',    'machine_shoulder_press', 'press'],
    ['Seated Dumbbell Press',   'overhead_press',   'press',    'seated_dumbbell_press',  'press'],
    ['Hack Squat',              'barbell_squat',    'squat',    'hack_squat',             null],
    ['Bulgarian Split Squat',   'lunge',            'lunge',    'bulgarian_split_squat',  'lunge'],
    ['Sumo Deadlift',           'deadlift',         'deadlift', 'sumo_deadlift',          'deadlift'],
    ['Hammer Curl',             'bicep_curl',       'curl',     'hammer_curl',            'curl'],
    ['Seated Leg Curl',         'leg_curl',         null,       'seated_leg_curl',        null],
  ] as Array<[string, string, VisionCategory | null, string, VisionCategory | null]>)(
    '%s: family %s (%s) but OWN card %s (%s) — no borrowed text',
    (name, familyId, familyCategory, cardId, cardCategory) => {
      // The family match is unchanged — it still names the profile a variant
      // would share and the coach cues it borrows.
      const family = getExerciseForm(name)!;
      expect(family.id).toBe(familyId);
      expect(visionCategoryFor(family)).toBe(familyCategory);
      // No ExerciseForm owns the name; its TechniqueCard does.
      expect(getOwnExerciseForm(name)).toBeNull();
      const own = getOwnTechnique(name)!;
      expect(own.id).toBe(cardId);
      expect(hasOwnTechniqueContent(name)).toBe(true);
      expect(getExerciseFormKey(name)).toBe(cardId);
      // The card's honest engine decision wins BY NAME, even over a family
      // match that would have routed it somewhere (Hack Squat: squat → null).
      expect(own.visionCategory).toBe(cardCategory);
      expect(visionCategoryForName(name)).toBe(cardCategory);
      expect(hasVisionCoverage(name)).toBe(cardCategory !== null);
      // Key points are the card's, never the family entry's authored text.
      const borrowed = new Set([...(family.keyPoints ?? []), ...family.checkpoints.map((c) => c.description)]);
      expect(keyPointsFor(name)).toEqual(own.keyPoints);
      for (const line of own.keyPoints) expect(borrowed.has(line)).toBe(false);
    },
  );

  it('Lat Pulldown never sees "chin over bar"', () => {
    const own = getOwnTechnique('Lat Pulldown')!;
    expect(own.id).toBe('lat_pulldown');
    expect(visionCategoryForName('Lat Pulldown')).toBe('pull');
    expect(hasVisionCoverage('Lat Pulldown')).toBe(true);
    expect(keyPointsFor('Lat Pulldown').join(' ')).not.toMatch(/chin over bar|dead hang/i);
    expect(own.keyPoints.join(' ')).not.toMatch(/chin over bar|dead hang/i);
  });

  it('Leg Press owns a card but no profile: how-to only, no camera', () => {
    const own = getOwnTechnique('Leg Press')!;
    expect(own.id).toBe('leg_press');
    expect(own.visionCategory).toBeNull();
    expect(visionCategoryForName('Leg Press')).toBeNull();
    expect(hasVisionCoverage('Leg Press')).toBe(false);
    expect(own.detectedFaults).toEqual([]);
    expect(detectedFaultsFor('Leg Press')).toEqual([]);
  });

  it('Seated Cable Row is a pull by its card, though no keyword ever matched it', () => {
    expect(getExerciseForm('Seated Cable Row')).toBeNull();
    expect(getOwnTechnique('Seated Cable Row')?.id).toBe('seated_cable_row');
    expect(visionCategoryForName('Seated Cable Row')).toBe('pull');
    expect(hasVisionCoverage('Seated Cable Row')).toBe(true);
  });

  it('every alias resolves back to its own entry and to no other', () => {
    for (const form of EXERCISE_FORM_LIBRARY) {
      for (const alias of [form.exerciseName, ...form.aliases]) {
        expect(getOwnExerciseForm(alias)?.id).toBe(form.id);
        expect(getOwnTechnique(alias)?.id).toBe(form.id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOwnTechnique — one shape over both tables. Screens derive the clip path,
// the setup figure and the camera note from it and never see which table
// answered, so the form-entry projection is pinned field by field here.
// ─────────────────────────────────────────────────────────────────────────────

describe('getOwnTechnique', () => {
  it('projects a form entry: id, authored key points, camera, profile, faults, clip version', () => {
    const form = getOwnExerciseForm('Bench Press')!;
    const own = getOwnTechnique('Barbell Bench Press')!;
    expect(own.id).toBe('bench_press');
    expect(own.exerciseName).toBe(form.exerciseName);
    expect(own.keyPoints).toEqual(form.keyPoints);
    expect(own.cameraAngle).toBe(form.cameraAngle);
    expect(own.cameraNote).toBe(form.cameraNote);
    expect(own.visionCategory).toBe('press');
    expect(own.detectedFaults).toEqual(form.detectedFaults ?? []);
    // bench_press is the one entry re-shot: version 2, so the clip path moves.
    expect(own.tutorialVersion).toBe(form.tutorial?.version ?? 1);
    expect(own.tutorialVersion).toBe(2);
  });

  it('gives bench entries a lying posture, leg curl prone, pull-up hanging, everything else standing', () => {
    expect(getOwnTechnique('Bench Press')?.posture).toBe('lying');
    expect(getOwnTechnique('Incline Dumbbell Press')?.posture).toBe('lying');
    expect(getOwnTechnique('Leg Curl')?.posture).toBe('prone');
    expect(getOwnTechnique('Pull-Up')?.posture).toBe('hanging');
    for (const form of EXERCISE_FORM_LIBRARY) {
      if (['bench_press', 'incline_db_press', 'leg_curl', 'pullup'].includes(form.id)) continue;
      expect(getOwnTechnique(form.exerciseName)?.posture).toBe('standing');
    }
  });

  it('claims no detected faults for a form entry with no profile', () => {
    expect(getOwnTechnique('Lateral Raise')?.visionCategory).toBeNull();
    expect(getOwnTechnique('Lateral Raise')?.detectedFaults).toEqual([]);
    expect(detectedFaultsFor('Lateral Raise')).toEqual([]);
  });

  it('projects a card verbatim, with tutorialVersion defaulting to 1', () => {
    const card = getTechniqueCard('T-Bar Row')!;
    const own = getOwnTechnique('T-Bar Row')!;
    expect(own).toEqual({
      id: card.id,
      exerciseName: card.exerciseName,
      keyPoints: card.keyPoints,
      cameraAngle: card.cameraAngle,
      cameraNote: card.cameraNote,
      posture: card.posture,
      visionCategory: card.visionCategory,
      detectedFaults: card.detectedFaults ?? [],
      tutorialVersion: card.tutorial?.version ?? 1,
    });
    expect(own.tutorialVersion).toBe(1);
  });

  it('is null for an empty or unknown name', () => {
    expect(getOwnTechnique('')).toBeNull();
    expect(getOwnTechnique('Underwater Basket Weaving')).toBeNull();
  });
});

describe('detectedFaultsFor', () => {
  it('returns the own technique list, with ids the engine profile declares', () => {
    for (const name of ['Bench Press', 'Lat Pulldown', 'Hammer Curl', 'Sumo Deadlift', 'Step-Up']) {
      const faults = detectedFaultsFor(name);
      const category = visionCategoryForName(name)!;
      expect(category).not.toBeNull();
      expect(faults.length).toBeGreaterThan(0);
      const checkIds = new Set(getProfile(category).checks.map((c) => c.id));
      for (const f of faults) {
        expect(checkIds.has(f.checkId)).toBe(true);
        expect(f.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('is empty when nothing owns the name and no family matches', () => {
    expect(detectedFaultsFor('Underwater Basket Weaving')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage. Every exercise a user can tap — the workout library and every
// expert program — must land on its own technique: the 14 form entries or one
// of the technique cards. A miss here means a "coming soon" poster on the
// device for a name the catalog was supposed to cover.
// ─────────────────────────────────────────────────────────────────────────────

describe('own-technique coverage', () => {
  const allNames = (): string[] => {
    const names = new Set<string>();
    for (const group of EXERCISE_LIBRARY) for (const ex of group.exercises) names.add(ex.name);
    for (const program of Object.values(EXPERT_PROGRAMS)) {
      for (const day of program.schedule) for (const ex of day.exercises) names.add(ex.name);
    }
    return [...names].sort();
  };

  it('every EXERCISE_LIBRARY and EXPERT_PROGRAMS exercise resolves to an own technique', () => {
    const names = allNames();
    expect(names.length).toBeGreaterThan(50);
    const misses = names.filter((n) => getOwnTechnique(n) === null);
    if (misses.length) {
      // Printed so the failing names are in the log, not just a count.
      console.error(`No own technique for ${misses.length} exercise(s):\n  ${misses.join('\n  ')}`);
    }
    expect(misses).toEqual([]);
  });

  it('every covered name has 3–5 key points, a camera note and a usable clip stem', () => {
    for (const name of allNames()) {
      const own = getOwnTechnique(name)!;
      expect(own.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(own.keyPoints.length).toBeLessThanOrEqual(5);
      expect(own.cameraNote).toBeTruthy();
      expect(own.id).toMatch(/^[a-z0-9_]+$/);
      expect(own.tutorialVersion).toBeGreaterThanOrEqual(1);
      // A name without a profile never advertises detections or a camera.
      if (own.visionCategory === null) {
        expect(own.detectedFaults).toEqual([]);
        expect(hasVisionCoverage(name)).toBe(false);
      } else {
        expect(hasVisionCoverage(name)).toBe(true);
      }
    }
  });
});
