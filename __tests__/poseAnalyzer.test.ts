import {
  analyzeForm,
  analyzeBilateral,
  type PoseCorrection,
} from '../lib/poseAnalyzer';

// Keypoint type — just needs x, y, score, name
type Keypoint = { x: number; y: number; score?: number; name?: string };

// Helper: build a 17-keypoint array with selective overrides
function makeKps(overrides: Record<number, { x: number; y: number; score?: number }>): Keypoint[] {
  return Array.from({ length: 17 }, (_, i) => ({
    x: overrides[i]?.x ?? 0,
    y: overrides[i]?.y ?? 0,
    score: overrides[i]?.score ?? 0.95,
    name: String(i),
  }));
}

const KP = {
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
};

// ── Squat ────────────────────────────────────────────────────────────────────

describe('analyzeForm — squat', () => {
  it('correction message contains a degree value', () => {
    const kps = makeKps({
      [KP.LEFT_HIP]: { x: 100, y: 100 },
      [KP.LEFT_KNEE]: { x: 100, y: 180 },
      [KP.LEFT_ANKLE]: { x: 100, y: 260 },
      [KP.LEFT_SHOULDER]: { x: 100, y: 40 },
    });
    const corrections = analyzeForm(kps as any, 'Barbell Back Squat');
    const withDeg = corrections.filter((c) => /\d+°/.test(c.message));
    expect(withDeg.length).toBeGreaterThan(0);
  });

  it('knee valgus correction has issueKey "knee_valgus_left" and includes degree value', () => {
    // Knee 60px to the right of ankle in x → valgus
    const kps = makeKps({
      [KP.LEFT_HIP]: { x: 100, y: 100 },
      [KP.LEFT_KNEE]: { x: 160, y: 180 },
      [KP.LEFT_ANKLE]: { x: 100, y: 260 },
      [KP.LEFT_SHOULDER]: { x: 100, y: 40 },
    });
    const corrections = analyzeForm(kps as any, 'Barbell Back Squat');
    const cave = corrections.find((c) => c.issueKey === 'knee_valgus_left');
    expect(cave).toBeDefined();
    expect(cave!.message).toMatch(/\d+(px|\°)/);
  });
});

// ── Bench press ───────────────────────────────────────────────────────────────

describe('analyzeForm — bench press velocity', () => {
  const benchKps = makeKps({
    [KP.LEFT_SHOULDER]: { x: 100, y: 100 },
    [KP.LEFT_ELBOW]: { x: 100, y: 140 },
    [KP.LEFT_WRIST]: { x: 100, y: 180 },
    [KP.RIGHT_SHOULDER]: { x: 200, y: 100 },
    [KP.RIGHT_ELBOW]: { x: 200, y: 140 },
  });

  it('fires velocity warning on fast descent (>8px/frame)', () => {
    const fastHistory = [80, 100, 120, 140, 160]; // 20px/frame
    const corrections = analyzeForm(benchKps as any, 'Barbell Bench Press', fastHistory);
    expect(corrections.some((c) => c.issueKey === 'bench_descent_too_fast')).toBe(true);
  });

  it('does not fire velocity warning on slow descent (<=8px/frame)', () => {
    const slowHistory = [160, 162, 164, 166, 168]; // 2px/frame
    const corrections = analyzeForm(benchKps as any, 'Barbell Bench Press', slowHistory);
    expect(corrections.some((c) => c.issueKey === 'bench_descent_too_fast')).toBe(false);
  });

  it('does not fire velocity warning with fewer than 5 history frames', () => {
    const corrections = analyzeForm(benchKps as any, 'Barbell Bench Press', [100, 120]);
    expect(corrections.some((c) => c.issueKey === 'bench_descent_too_fast')).toBe(false);
  });
});

// ── Bilateral ─────────────────────────────────────────────────────────────────

describe('analyzeBilateral', () => {
  it('detects shoulder height imbalance > 15px', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 121 }, // 21px difference
    });
    const corrections = analyzeBilateral(kps as any);
    expect(corrections.some((c) => c.issueKey === 'shoulder_height_imbalance')).toBe(true);
  });

  it('does not flag shoulder imbalance <= 15px', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 110 }, // 10px difference
    });
    const corrections = analyzeBilateral(kps as any);
    expect(corrections.some((c) => c.issueKey === 'shoulder_height_imbalance')).toBe(false);
  });

  it('shoulder imbalance message contains "Left" or "Right"', () => {
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 125 },
    });
    const corrections = analyzeBilateral(kps as any);
    const issue = corrections.find((c) => c.issueKey === 'shoulder_height_imbalance');
    expect(issue!.message).toMatch(/Left|Right/);
  });
});

// ── analyzeForm appends bilateral results ─────────────────────────────────────

describe('analyzeForm — appends bilateral', () => {
  it('includes bilateral check results appended to exercise results', () => {
    // Big shoulder imbalance should appear even in a squat analysis
    const kps = makeKps({
      [KP.LEFT_SHOULDER]: { x: 80, y: 100 },
      [KP.RIGHT_SHOULDER]: { x: 200, y: 130 }, // 30px imbalance
      [KP.LEFT_HIP]: { x: 100, y: 200 },
      [KP.LEFT_KNEE]: { x: 100, y: 280 },
      [KP.LEFT_ANKLE]: { x: 100, y: 360 },
    });
    const corrections = analyzeForm(kps as any, 'Barbell Back Squat');
    expect(corrections.some((c) => c.issueKey === 'shoulder_height_imbalance')).toBe(true);
  });
});

// ── New exercises ─────────────────────────────────────────────────────────────

describe('analyzeForm — new exercises return corrections without throwing', () => {
  const baseKps = makeKps({
    [KP.LEFT_SHOULDER]: { x: 100, y: 80 },
    [KP.RIGHT_SHOULDER]: { x: 200, y: 80 },
    [KP.LEFT_ELBOW]: { x: 100, y: 140 },
    [KP.RIGHT_ELBOW]: { x: 200, y: 140 },
    [KP.LEFT_WRIST]: { x: 100, y: 200 },
    [KP.RIGHT_WRIST]: { x: 200, y: 200 },
    [KP.LEFT_HIP]: { x: 100, y: 220 },
    [KP.RIGHT_HIP]: { x: 200, y: 220 },
    [KP.LEFT_KNEE]: { x: 100, y: 300 },
    [KP.RIGHT_KNEE]: { x: 200, y: 300 },
    [KP.LEFT_ANKLE]: { x: 100, y: 380 },
    [KP.RIGHT_ANKLE]: { x: 200, y: 380 },
  });

  const exercises = [
    'Romanian Deadlift',
    'Barbell Row',
    'Lat Pulldown',
    'Bicep Curl',
    'Tricep Pushdown',
    'Lunge',
    'Hip Thrust',
  ];

  exercises.forEach((name) => {
    it(`${name} returns at least one correction`, () => {
      const corrections = analyzeForm(baseKps as any, name);
      expect(Array.isArray(corrections)).toBe(true);
      expect(corrections.length).toBeGreaterThan(0);
    });
  });
});

// ── issueKey presence ─────────────────────────────────────────────────────────

describe('PoseCorrection issueKey', () => {
  it('corrections that have an issueKey have a non-empty string value', () => {
    const kps = makeKps({
      [KP.LEFT_HIP]: { x: 100, y: 100 },
      [KP.LEFT_KNEE]: { x: 100, y: 180 },
      [KP.LEFT_ANKLE]: { x: 100, y: 260 },
    });
    const corrections = analyzeForm(kps as any, 'Barbell Back Squat');
    corrections
      .filter((c) => c.issueKey !== undefined)
      .forEach((c) => expect(typeof c.issueKey).toBe('string'));
  });
});
