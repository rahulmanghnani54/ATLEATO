/**
 * Parity pin for the set-report grading curve after its move out of
 * app/form-coach.tsx into lib/vision/repScore.ts.
 *
 * Every expected value below was produced by running the ORIGINAL inline
 * functions (form-coach.tsx:253-353 at 79fd7a5) once and copying the numbers.
 * They are an oracle, not a derivation: if a case here changes, the report card
 * grades a rep differently from the way it did on device, and that is a product
 * decision to make on purpose rather than a side effect of a file move.
 */
import { buildReport, scoreRep, toRepData, type RepData } from '@/lib/vision/repScore';
import type { RepResult } from '@/lib/vision/exerciseState';

type Case = [
  bottomDeg: number,
  tempoMs: number,
  symmetry: number,
  category: string | undefined,
  score: number,
  flaw: RepData['flaw'],
];

// (bottomDeg, tempoMs, symmetry, category) -> {score, flaw}, recorded from the
// original implementation. Rows cover: full credit, the depth fall-off, rushed
// and grindy tempo, the symmetry term, symmetry dropped when NaN (one side never
// seen), a curl/press/deadlift/pull/lunge band each, and the default band for
// an unknown or missing category.
const ORACLE: Case[] = [
  [85, 3000, 4, 'squat', 100, null],
  [125, 3000, 4, 'squat', 79, 'shallow'],
  [140, 3000, 4, 'squat', 57, 'shallow'],
  [85, 800, 4, 'squat', 87, 'rushed'],
  [85, 8000, 4, 'squat', 96, null],
  [85, 3000, 30, 'squat', 86, 'uneven'],
  [85, 3000, NaN, 'squat', 100, null],
  [85, 800, NaN, 'squat', 82, 'rushed'],
  [60, 2000, 10, 'curl', 100, null],
  [110, 2000, 10, 'curl', 71, 'shallow'],
  [95, 1000, 50, 'press', 65, 'uneven'],
  [130, 5000, 20, 'deadlift', 80, null],
  [100, 2500, 6, undefined, 100, null],
  [100, 2500, 6, 'unknown-cat', 100, null],
  [70, 3000, 45, 'pull', 75, 'uneven'],
  [100, 1200, 12, 'lunge', 100, null],
];

describe('scoreRep — parity with the original inline grading curve', () => {
  it.each(ORACLE)(
    'bottom %d deg, %d ms, symmetry %p, category %p -> %d / %p',
    (bottomDeg, tempoMs, symmetry, category, score, flaw) => {
      expect(scoreRep(bottomDeg, tempoMs, symmetry, category)).toEqual({ score, flaw });
    },
  );
});

const rep = (over: Partial<RepResult>): RepResult => ({
  index: 1,
  bottomAngle: 85,
  topAngle: 175,
  rom: 90,
  eccentricMs: 1500,
  concentricMs: 1500,
  totalMs: 3000,
  symmetryAtBottom: 4,
  ...over,
});

describe('toRepData — engine RepResult to report-card RepData', () => {
  it('carries the measured fields through and grades them', () => {
    const d = toRepData(rep({ index: 2, bottomAngle: 130, totalMs: 900, symmetryAtBottom: 10 }), 'squat');
    expect(d).toEqual({ index: 2, bottomDeg: 130, tempoMs: 900, symmetry: 10, score: 60, flaw: 'shallow' });
  });

  it('passes an unknown symmetry (NaN) through untouched rather than as 0', () => {
    const d = toRepData(rep({ symmetryAtBottom: NaN }), 'squat');
    expect(Number.isNaN(d.symmetry)).toBe(true);
    expect(d.score).toBe(100);
  });
});

describe('buildReport — end-of-set summary', () => {
  it('summarises an empty set with zeros and nulls, never NaN', () => {
    expect(buildReport([], 'squat')).toEqual({
      reps: 0,
      avgScore: 0,
      avgTempoMs: 0,
      bestRep: null,
      worstRep: null,
      flawCounts: {},
      data: [],
    });
  });

  it('matches the original report for a three-rep squat set', () => {
    const reps: RepResult[] = [
      rep({ index: 1 }),
      rep({ index: 2, bottomAngle: 130, rom: 45, eccentricMs: 400, concentricMs: 500, totalMs: 900, symmetryAtBottom: 10 }),
      rep({ index: 3, bottomAngle: 90, rom: 85, eccentricMs: 4000, concentricMs: 3000, totalMs: 7000, symmetryAtBottom: NaN }),
    ];
    const report = buildReport(reps, 'squat');

    expect(report.reps).toBe(3);
    expect(report.avgScore).toBe(86);
    expect(report.avgTempoMs).toBe(3633);
    expect(report.flawCounts).toEqual({ shallow: 1 });
    expect(report.data.map((d) => [d.index, d.score, d.flaw])).toEqual([
      [1, 100, null],
      [2, 60, 'shallow'],
      [3, 97, null],
    ]);
    expect(report.bestRep).toBe(report.data[0]);
    expect(report.worstRep).toBe(report.data[1]);
    // Rep 3's symmetry was never measured; the report must say so, not invent 0.
    expect(Number.isNaN(report.data[2].symmetry)).toBe(true);
  });
});
