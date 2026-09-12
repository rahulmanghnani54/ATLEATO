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
  getExerciseForm,
  getExerciseFormKey,
  getCoachCue,
  hasVisionCoverage,
  keyPointsFor,
  requiredLandmarksFor,
  tipsForExercise,
  visionCategoryFor,
  type ExerciseForm,
  type VisionCategory,
} from '@/constants/exerciseFormLibrary';
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
  it('uses the form id when the exercise matches an entry', () => {
    expect(getExerciseFormKey('Barbell Bench Press')).toBe('bench_press');
    expect(getExerciseFormKey('Step-Up')).toBe('lunge');
  });

  it('slugs the name when there is no entry', () => {
    expect(getExerciseFormKey('Rack Pull')).toBe('rack_pull');
    expect(getExerciseFormKey('Leg Extension (Warmup)')).toBe('leg_extension_warmup');
    expect(getExerciseFormKey('  T-Bar Row ')).toBe('t_bar_row');
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

  it('falls back to the exercise library tips when no form matches', () => {
    const tips = keyPointsFor('Rack Pull');
    expect(tips.length).toBeGreaterThan(0);
    expect(tips).toEqual(tipsForExercise('Rack Pull'));
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
