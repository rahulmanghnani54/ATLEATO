/**
 * Rep counting is the product's core claim. A phantom rep is a fabricated
 * training log; a dropped real rep makes the coach look broken mid-set. Both
 * cost trust immediately, so the state machine is driven here with synthetic
 * angle traces rather than a device.
 *
 * The full-engine replay (lib/vision/__tests__/replay.ts) covers the wired
 * pipeline; this file pins the rep-quality decisions the pipeline delegates to.
 */
import { ExerciseStateMachine, type RepResult } from '@/lib/vision/exerciseState';
import { getProfile } from '@/lib/vision/biomechanics';

// Mirrors the shipped squat band; kept literal so a tuning change to the profile
// cannot silently redefine what these cases mean.
const SQUAT = { lowThreshold: 110, highThreshold: 155, minRepMs: 700, minRom: 45 };

const TOP_ANGLE = 175;
const STEP_MS = 50;

/** One down-and-up angle sweep, sampled every STEP_MS like a camera would. */
function repTrace(bottom: number, downMs: number, upMs: number, startMs = 0): [number, number][] {
  const frames: [number, number][] = [];
  const down = Math.max(3, Math.round(downMs / STEP_MS));
  const up = Math.max(3, Math.round(upMs / STEP_MS));
  let t = startMs;
  for (let i = 0; i <= down; i++) {
    frames.push([TOP_ANGLE + ((bottom - TOP_ANGLE) * i) / down, t]);
    t += STEP_MS;
  }
  for (let i = 1; i <= up; i++) {
    frames.push([bottom + ((TOP_ANGLE - bottom) * i) / up, t]);
    t += STEP_MS;
  }
  return frames;
}

function drive(
  m: ExerciseStateMachine,
  frames: [number, number][],
  symmetry = 4,
  shapeOk = true,
): RepResult[] {
  const banked: RepResult[] = [];
  for (const [angle, t] of frames) {
    const r = m.update(angle, t, symmetry, shapeOk);
    if (r) banked.push(r);
  }
  return banked;
}

function machine(over: Partial<typeof SQUAT> = {}) {
  return new ExerciseStateMachine({ ...SQUAT, ...over });
}

describe('rep counting — a clean rep is credited', () => {
  it('banks exactly one rep for one deep, controlled sweep', () => {
    const reps = drive(machine(), repTrace(85, 1500, 1500));
    expect(reps).toHaveLength(1);
    expect(reps[0].index).toBe(1);
  });

  it('banks three reps for three sweeps and indexes them in order', () => {
    const m = machine();
    let t = 0;
    const all: RepResult[] = [];
    for (let i = 0; i < 3; i++) {
      const trace = repTrace(85, 1500, 1500, t);
      all.push(...drive(m, trace));
      t = trace[trace.length - 1][1] + STEP_MS;
    }
    expect(all.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(m.count).toBe(3);
  });

  it('reports a finite ROM and split tempo for every credited rep', () => {
    const [rep] = drive(machine(), repTrace(85, 1500, 1500));
    for (const v of [rep.rom, rep.totalMs, rep.eccentricMs, rep.concentricMs, rep.bottomAngle, rep.topAngle]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(rep.rom).toBeGreaterThan(0);
    expect(rep.eccentricMs).toBeGreaterThanOrEqual(0);
    expect(rep.concentricMs).toBeGreaterThanOrEqual(0);
    expect(rep.eccentricMs + rep.concentricMs).toBeCloseTo(rep.totalMs, 5);
  });
});

describe('rep quality — depth', () => {
  it('a deeper rep records a lower bottom angle and a larger ROM than a shallow one', () => {
    const [deep] = drive(machine(), repTrace(85, 1500, 1500));
    const [shallow] = drive(machine(), repTrace(105, 1500, 1500));
    expect(deep).toBeDefined();
    expect(shallow).toBeDefined();
    expect(deep.bottomAngle).toBeLessThan(shallow.bottomAngle);
    expect(deep.rom).toBeGreaterThan(shallow.rom);
  });

  it('ROM is ordered by depth across a whole range of bottoms', () => {
    const roms = [95, 105, 115, 125].map((bottom) => {
      const [rep] = drive(machine({ minRom: 0 }), repTrace(bottom, 1500, 1500));
      return rep.rom;
    });
    for (let i = 1; i < roms.length; i++) expect(roms[i]).toBeLessThan(roms[i - 1]);
  });

  it('a quarter-rep below the ROM floor is not credited at all', () => {
    const reps = drive(machine(), repTrace(140, 1500, 1500));
    expect(reps).toHaveLength(0);
  });

  it('a landmark twitching across the lockout threshold banks nothing', () => {
    // The exact phantom-rep signature: a few degrees of jitter, no arc.
    const frames: [number, number][] = [];
    for (let i = 0; i < 200; i++) frames.push([i % 2 ? 154 : 158, i * 60]);
    const m = machine();
    expect(drive(m, frames)).toHaveLength(0);
    expect(m.count).toBe(0);
  });
});

describe('rep quality — tempo', () => {
  it('a rushed sweep under the minimum rep duration is rejected', () => {
    const m = machine();
    // Full depth, but the whole cycle is faster than a loaded rep can be.
    expect(drive(m, repTrace(85, 200, 200))).toHaveLength(0);
    expect(m.count).toBe(0);
  });

  it('the same sweep at a human tempo is credited — depth was never the problem', () => {
    expect(drive(machine(), repTrace(85, 1500, 1500))).toHaveLength(1);
  });

  it('a slower rep records a longer totalMs', () => {
    const [fast] = drive(machine(), repTrace(85, 800, 800));
    const [slow] = drive(machine(), repTrace(85, 2500, 2500));
    expect(slow.totalMs).toBeGreaterThan(fast.totalMs);
  });

  it('a rep with a slow descent and a fast drive splits the tempo accordingly', () => {
    const [rep] = drive(machine(), repTrace(85, 2500, 900));
    expect(rep.eccentricMs).toBeGreaterThan(rep.concentricMs);
  });
});

describe('rep quality — symmetry', () => {
  it('captures the imbalance measured at the deepest point', () => {
    const [rep] = drive(machine(), repTrace(85, 1500, 1500), 17);
    expect(rep.symmetryAtBottom).toBe(17);
  });

  it('preserves NaN when only one side was ever visible — never coerces it to 0', () => {
    // 0 would assert perfect balance about a limb the camera never saw.
    const [rep] = drive(machine(), repTrace(85, 1500, 1500), NaN);
    expect(Number.isNaN(rep.symmetryAtBottom)).toBe(true);
  });
});

describe('rep quality — geometry gate', () => {
  it('a valid angle cycle with the wrong body shape is not credited', () => {
    const m = machine();
    expect(drive(m, repTrace(85, 1500, 1500), 4, false)).toHaveLength(0);
    expect(m.count).toBe(0);
  });
});

describe('empty and degenerate sets', () => {
  it('a set with no frames reports zero reps, not NaN', () => {
    const m = machine();
    expect(m.count).toBe(0);
    expect(m.reps).toEqual([]);
    expect(m.phase).toBe('setup');
    expect(Number.isFinite(m.phaseProgress())).toBe(true);
  });

  it('a set of only untrusted frames banks nothing and stays finite', () => {
    const m = machine();
    for (let i = 0; i < 50; i++) expect(m.update(null, i * 50, NaN, true)).toBeNull();
    expect(m.count).toBe(0);
    expect(m.reps).toEqual([]);
    expect(Number.isFinite(m.phaseProgress())).toBe(true);
  });

  it('phaseProgress stays inside 0..1 through an entire rep', () => {
    const m = machine();
    for (const [angle, t] of repTrace(85, 1500, 1500)) {
      m.update(angle, t, 4, true);
      const p = m.phaseProgress();
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('reset clears the count and the banked reps', () => {
    const m = machine();
    drive(m, repTrace(85, 1500, 1500));
    expect(m.count).toBe(1);
    m.reset();
    expect(m.count).toBe(0);
    expect(m.reps).toEqual([]);
  });

  it('the reps getter hands back a copy — a caller cannot corrupt the log', () => {
    const m = machine();
    drive(m, repTrace(85, 1500, 1500));
    m.reps.push({} as RepResult);
    expect(m.count).toBe(1);
    expect(m.reps).toHaveLength(1);
  });

  it('rejects a config whose thresholds cannot describe a rep', () => {
    expect(() => new ExerciseStateMachine({ ...SQUAT, highThreshold: 100 })).toThrow(RangeError);
    expect(() => new ExerciseStateMachine({ ...SQUAT, lowThreshold: NaN })).toThrow(RangeError);
  });
});

describe('tracking dropout', () => {
  it('abandons the rep in progress rather than completing it across a blackout', () => {
    const m = machine();
    const trace = repTrace(85, 1500, 1500);
    const half = Math.floor(trace.length / 2);
    drive(m, trace.slice(0, half));
    // Camera comes back a full second later, already near lockout.
    const resumeAt = trace[half - 1][1] + 1000;
    expect(m.update(TOP_ANGLE, resumeAt, 4, true)).toBeNull();
    expect(m.count).toBe(0);
  });

  it('keeps already-banked reps when tracking is lost', () => {
    const m = machine();
    const trace = repTrace(85, 1500, 1500);
    drive(m, trace);
    expect(m.count).toBe(1);
    m.abandon();
    expect(m.count).toBe(1);
    expect(m.phase).toBe('setup');
  });

  it('requires the lifter back at extension before a new rep can start', () => {
    const m = machine();
    m.abandon();
    // Resuming mid-range must not arm the machine — half a rep is not a rep.
    m.update(130, 0, 4, true);
    m.update(120, 50, 4, true);
    expect(m.phase).toBe('setup');
  });
});

describe('shipped exercise profiles', () => {
  it.each(['squat', 'press', 'pull', 'curl', 'deadlift'])(
    '%s declares a usable rep band',
    (category) => {
      const { low, high, minRom } = getProfile(category).thresholds;
      expect(high).toBeGreaterThan(low);
      expect(minRom).toBeGreaterThan(0);
      expect(minRom).toBeLessThanOrEqual(high - low + 45);
      expect(() => new ExerciseStateMachine({
        lowThreshold: low, highThreshold: high, minRepMs: 700, minRom,
      })).not.toThrow();
    },
  );
});
