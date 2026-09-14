/**
 * Technique cards cover every exercise the workout library and the expert
 * programs name that does not already own an ExerciseForm. Each card decides
 * which clip plays, which setup figure and camera note show, and — through
 * `visionCategory` — whether FORM CHECK is offered and which profile grades
 * the set. So the catalog's decisions are pinned row by row: the ids, the
 * postures, the camera views and the vision categories are encoded here, and
 * every detected-fault claim is checked against the engine itself.
 */
import {
  TECHNIQUE_CARDS,
  getTechniqueCard,
  type CardPosture,
  type TechniqueCard,
} from '@/constants/techniqueCards';
import {
  EXERCISE_FORM_LIBRARY,
  getOwnExerciseForm,
  type VisionCategory,
} from '@/constants/exerciseFormLibrary';
import { EXERCISE_LIBRARY } from '@/constants/exerciseLibrary';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { getProfile } from '@/lib/vision/biomechanics';

type Expected = {
  posture: CardPosture;
  view: TechniqueCard['cameraAngle'];
  vision: VisionCategory | null;
};

// The batch catalog, row by row (ids are final; vision decisions are DECIDED).
const CATALOG: Record<string, Expected> = {
  lat_pulldown:              { posture: 'seated',   view: 'side',     vision: 'pull' },
  seated_cable_row:          { posture: 'seated',   view: 'side',     vision: 'pull' },
  chest_supported_row:       { posture: 'prone',    view: 'side',     vision: 'pull' },
  t_bar_row:                 { posture: 'hinged',   view: 'side',     vision: 'pull' },
  single_arm_db_row:         { posture: 'hinged',   view: 'side',     vision: 'pull' },
  incline_barbell_press:     { posture: 'lying',    view: 'side',     vision: 'press' },
  decline_bench_press:       { posture: 'lying',    view: 'side',     vision: 'press' },
  close_grip_bench_press:    { posture: 'lying',    view: 'side',     vision: 'press' },
  flat_dumbbell_press:       { posture: 'lying',    view: 'side',     vision: 'press' },
  seated_dumbbell_press:     { posture: 'seated',   view: 'side',     vision: 'press' },
  machine_shoulder_press:    { posture: 'seated',   view: 'side',     vision: 'press' },
  seated_barbell_press:      { posture: 'seated',   view: 'side',     vision: 'press' },
  rotating_db_press:         { posture: 'seated',   view: 'front',    vision: 'press' },
  push_up:                   { posture: 'prone',    view: 'side',     vision: 'press' },
  diamond_push_up:           { posture: 'prone',    view: 'side',     vision: 'press' },
  tricep_dip:                { posture: 'standing', view: 'side',     vision: 'press' },
  skull_crusher:             { posture: 'lying',    view: 'side',     vision: null },
  overhead_tricep_extension: { posture: 'standing', view: 'side',     vision: null },
  tricep_kickback:           { posture: 'hinged',   view: 'side',     vision: null },
  hammer_curl:               { posture: 'standing', view: 'side',     vision: 'curl' },
  cable_curl:                { posture: 'standing', view: 'side',     vision: 'curl' },
  preacher_curl:             { posture: 'seated',   view: 'side',     vision: null },
  concentration_curl:        { posture: 'seated',   view: 'side',     vision: null },
  spider_curl:               { posture: 'prone',    view: 'side',     vision: null },
  incline_curl:              { posture: 'seated',   view: 'side',     vision: null },
  hack_squat:                { posture: 'standing', view: 'side',     vision: null },
  leg_press:                 { posture: 'seated',   view: 'side',     vision: null },
  leg_extension:             { posture: 'seated',   view: 'side',     vision: null },
  seated_leg_curl:           { posture: 'seated',   view: 'side',     vision: null },
  bulgarian_split_squat:     { posture: 'standing', view: 'side',     vision: 'lunge' },
  step_up:                   { posture: 'standing', view: 'side',     vision: 'lunge' },
  sumo_deadlift:             { posture: 'standing', view: 'front_45', vision: 'deadlift' },
  rack_pull:                 { posture: 'standing', view: 'side',     vision: null },
  hip_thrust:                { posture: 'seated',   view: 'side',     vision: null },
  glute_bridge:              { posture: 'lying',    view: 'side',     vision: null },
  reverse_hyperextension:    { posture: 'prone',    view: 'side',     vision: null },
  cable_fly:                 { posture: 'standing', view: 'front',    vision: null },
  dumbbell_fly:              { posture: 'lying',    view: 'front',    vision: null },
  pec_deck:                  { posture: 'seated',   view: 'front',    vision: null },
  reverse_pec_deck:          { posture: 'seated',   view: 'front',    vision: null },
  rear_delt_fly:             { posture: 'hinged',   view: 'front',    vision: null },
  face_pull:                 { posture: 'standing', view: 'side',     vision: null },
  front_raise:               { posture: 'standing', view: 'side',     vision: null },
  cable_lateral_raise:       { posture: 'standing', view: 'front',    vision: null },
  upright_row:               { posture: 'standing', view: 'front',    vision: null },
  barbell_shrug:             { posture: 'standing', view: 'front',    vision: null },
  standing_calf_raise:       { posture: 'standing', view: 'side',     vision: null },
  seated_calf_raise:         { posture: 'seated',   view: 'side',     vision: null },
  donkey_calf_raise:         { posture: 'hinged',   view: 'side',     vision: null },
  leg_press_calf_raise:      { posture: 'seated',   view: 'side',     vision: null },
  tibialis_raise:            { posture: 'standing', view: 'side',     vision: null },
  ab_wheel_rollout:          { posture: 'kneeling', view: 'side',     vision: null },
  cable_crunch:              { posture: 'kneeling', view: 'side',     vision: null },
  hanging_leg_raise:         { posture: 'hanging',  view: 'side',     vision: null },
  decline_sit_up:            { posture: 'lying',    view: 'side',     vision: null },
  plank:                     { posture: 'prone',    view: 'side',     vision: null },
  side_plank:                { posture: 'lying',    view: 'front',    vision: null },
  russian_twist:             { posture: 'seated',   view: 'front',    vision: null },
};

const CATALOG_IDS = Object.keys(CATALOG);

// The same normalisation the matcher applies, restated here so the test does
// not trust the module under test to define what "the same name" means.
function norm(raw: string): string {
  return raw.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cardNames(card: TechniqueCard): string[] {
  return [card.exerciseName, ...card.aliases];
}

describe('TECHNIQUE_CARDS — the catalog, row by row', () => {
  it('has exactly 58 cards with unique ids, in catalog order', () => {
    expect(CATALOG_IDS).toHaveLength(58);
    expect(TECHNIQUE_CARDS).toHaveLength(58);
    const ids = TECHNIQUE_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(CATALOG_IDS);
  });

  it.each(CATALOG_IDS)('%s matches the catalog posture, view and vision decision', (id) => {
    const card = TECHNIQUE_CARDS.find((c) => c.id === id)!;
    expect(card).toBeDefined();
    expect(card.posture).toBe(CATALOG[id].posture);
    expect(card.cameraAngle).toBe(CATALOG[id].view);
    expect(card.visionCategory).toBe(CATALOG[id].vision);
  });

  it('ids are clip-safe slugs (lowercase, digits, underscores)', () => {
    for (const card of TECHNIQUE_CARDS) {
      expect(card.id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    }
  });
});

describe('TECHNIQUE_CARDS — content rules', () => {
  it.each(TECHNIQUE_CARDS.map((c) => [c.id, c] as const))(
    '%s has 3–5 non-empty key points and a camera note',
    (_id, card) => {
      expect(card.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(card.keyPoints.length).toBeLessThanOrEqual(5);
      for (const line of card.keyPoints) {
        expect(typeof line).toBe('string');
        expect(line.trim().length).toBeGreaterThan(0);
      }
      expect(card.cameraNote.trim().length).toBeGreaterThan(0);
      expect(card.exerciseName.trim().length).toBeGreaterThan(0);
      for (const alias of card.aliases) expect(alias.trim().length).toBeGreaterThan(0);
    },
  );

  it('does not ship tutorial metadata — clips are found by convention as <id>_v1.mp4', () => {
    for (const card of TECHNIQUE_CARDS) {
      expect(card.tutorial == null).toBe(true);
    }
  });
});

describe('TECHNIQUE_CARDS — detected faults come from the engine', () => {
  it.each(TECHNIQUE_CARDS.map((c) => [c.id, c] as const))('%s', (_id, card) => {
    if (card.visionCategory === null) {
      // No profile → no detections may be advertised.
      expect(card.detectedFaults).toBeUndefined();
      return;
    }
    const profile = getProfile(card.visionCategory);
    const legal = new Set(profile.checks.map((chk) => chk.id));
    expect(legal.size).toBeGreaterThan(0);
    expect(card.detectedFaults).toBeDefined();
    expect(card.detectedFaults!.length).toBeGreaterThan(0);
    for (const fault of card.detectedFaults!) {
      expect(legal.has(fault.checkId)).toBe(true);
      expect(fault.checkId.startsWith(`${card.visionCategory}.`)).toBe(true);
      expect(fault.label.trim().length).toBeGreaterThan(0);
    }
    // No duplicate check ids on a card.
    const ids = card.detectedFaults!.map((f) => f.checkId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getTechniqueCard — exact name/alias match only', () => {
  it('every title and alias resolves to its own card and to no other', () => {
    const owner = new Map<string, string>();
    for (const card of TECHNIQUE_CARDS) {
      for (const name of cardNames(card)) {
        const key = norm(name);
        const prev = owner.get(key);
        if (prev && prev !== card.id) {
          throw new Error(`"${name}" is claimed by both ${prev} and ${card.id}`);
        }
        owner.set(key, card.id);
        expect(getTechniqueCard(name)?.id).toBe(card.id);
      }
    }
  });

  it('normalises case, hyphens, underscores and whitespace', () => {
    expect(getTechniqueCard('lat_pulldown')?.id).toBe('lat_pulldown');
    expect(getTechniqueCard('LAT-PULLDOWN')?.id).toBe('lat_pulldown');
    expect(getTechniqueCard('  Lat   Pulldown ')?.id).toBe('lat_pulldown');
    expect(getTechniqueCard('push up')?.id).toBe('push_up');
    expect(getTechniqueCard('PUSH_UP')?.id).toBe('push_up');
    expect(getTechniqueCard('cable row (seated)')?.id).toBe('seated_cable_row');
  });

  it('never keyword-matches: a variant with no card of its own returns null', () => {
    expect(getTechniqueCard('')).toBeNull();
    expect(getTechniqueCard('   ')).toBeNull();
    expect(getTechniqueCard('Lat Pulldown Machine')).toBeNull();
    expect(getTechniqueCard('Pulldown')).toBeNull();
    expect(getTechniqueCard('Curl')).toBeNull();
    expect(getTechniqueCard('Bench Press')).toBeNull(); // owned by the ExerciseForm library
  });
});

describe('TECHNIQUE_CARDS — no overlap with the ExerciseForm library', () => {
  it('no card title or alias is also an ExerciseForm title or alias', () => {
    const formNames = new Set<string>();
    for (const ef of EXERCISE_FORM_LIBRARY) {
      formNames.add(norm(ef.exerciseName));
      for (const a of ef.aliases) formNames.add(norm(a));
    }
    const clashes: string[] = [];
    for (const card of TECHNIQUE_CARDS) {
      for (const name of cardNames(card)) {
        if (formNames.has(norm(name)) || getOwnExerciseForm(name) !== null) {
          clashes.push(`${card.id}: "${name}"`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('no card id collides with an ExerciseForm id (shared clip/memory namespace)', () => {
    const formIds = new Set(EXERCISE_FORM_LIBRARY.map((ef) => ef.id));
    for (const card of TECHNIQUE_CARDS) {
      expect(formIds.has(card.id)).toBe(false);
    }
  });
});

describe('coverage — every exercise the app names owns technique content', () => {
  function allAppExerciseNames(): string[] {
    const names = new Set<string>();
    for (const group of EXERCISE_LIBRARY) {
      for (const ex of group.exercises) names.add(ex.name);
    }
    for (const program of Object.values(EXPERT_PROGRAMS)) {
      for (const day of program.schedule) {
        for (const ex of day.exercises) names.add(ex.name);
      }
    }
    return [...names].sort();
  }

  it('resolves every EXERCISE_LIBRARY and EXPERT_PROGRAMS exercise to an ExerciseForm or a TechniqueCard', () => {
    const names = allAppExerciseNames();
    expect(names.length).toBeGreaterThan(0);

    const uncovered = names.filter(
      (name) => getOwnExerciseForm(name) === null && getTechniqueCard(name) === null,
    );
    if (uncovered.length) {
      // Surfaced by name so the catalog can be fixed rather than guessed at.
      // eslint-disable-next-line no-console
      console.error('Exercises with no own technique content:\n  ' + uncovered.join('\n  '));
    }
    expect(uncovered).toEqual([]);
  });

  it('never resolves a name to BOTH an ExerciseForm and a TechniqueCard', () => {
    const both = allAppExerciseNames().filter(
      (name) => getOwnExerciseForm(name) !== null && getTechniqueCard(name) !== null,
    );
    expect(both).toEqual([]);
  });
});
