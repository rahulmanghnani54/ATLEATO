/**
 * repScore — the set report's grading curve.
 *
 * Moved verbatim out of app/form-coach.tsx so it can be unit-tested and so the
 * screen owns no analysis of its own. Everything here is retrospective: rep
 * detection, phase and tempo come from the engine's state machine, and what
 * this module adds is a presentation choice about how to praise or fault a rep
 * that is already banked. The depth target below is that curve's reference
 * angle, not a rep-counting threshold — nothing here can create or cancel a rep.
 *
 * Pure: no React, no state, no I/O. `RepResult` is imported from its home
 * module rather than from './index' so this file never joins the engine's
 * import cycle.
 */

import type { RepResult } from './exerciseState';

export const REP_THRESHOLDS: Record<string, { low: number; high: number }> = {
  squat:    { low: 110, high: 155 },
  lunge:    { low: 110, high: 155 },
  deadlift: { low: 120, high: 160 },
  press:    { low: 100, high: 150 },
  pull:     { low: 100, high: 150 },
  curl:     { low: 90,  high: 140 },
};
export const REP_DEFAULT_TH = { low: 105, high: 150 };
// ─────────────────────────────────────────────────────────────────────────────
// PER-REP QUALITY — every rep graded 0-100 on depth, tempo, and symmetry, so
// the set report reads like a coach ("8 reps · 2 shallow · left side leading").
// ─────────────────────────────────────────────────────────────────────────────
export interface RepData {
  index: number;
  bottomDeg: number;   // deepest primary angle reached (lower = deeper)
  tempoMs: number;     // full down-up duration
  symmetry: number;    // |left − right| at the bottom (deg; lower = balanced)
  score: number;       // 0-100
  flaw: 'shallow' | 'rushed' | 'grindy' | 'uneven' | null; // dominant issue
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function scoreRep(bottomDeg: number, tempoMs: number, symmetry: number, category?: string): {
  score: number; flaw: RepData['flaw'];
} {
  const th = (category && REP_THRESHOLDS[category]) || REP_DEFAULT_TH;
  // Depth: full credit at/below the target; falls off over the next 35°.
  const depth = clamp01((th.low + 35 - bottomDeg) / 35) * 100;
  // Tempo: ideal ~1.5-5s. Rushed (<1.2s) or grindy (>6s) lose points.
  const s = tempoMs / 1000;
  let tempo = 100, tempoFlaw: RepData['flaw'] = null;
  if (s < 1.2) { tempo = clamp01(s / 1.2) * 70; tempoFlaw = 'rushed'; }
  else if (s > 6) { tempo = Math.max(55, 100 - (s - 6) * 8); tempoFlaw = 'grindy'; }
  // Symmetry: ≤12° balanced, ≥45° poor. The engine reports NaN — never 0 — when
  // only one side was ever visible, because 0 would assert perfect balance about
  // a limb we never saw. So the term is DROPPED and the remaining weights are
  // renormalised, rather than a missing measurement scoring as a good one.
  const symKnown = Number.isFinite(symmetry);
  const sym = symKnown ? clamp01((45 - symmetry) / 33) * 100 : 0;
  const score = symKnown
    ? Math.round(depth * 0.5 + tempo * 0.25 + sym * 0.25)
    : Math.round((depth * 0.5 + tempo * 0.25) / 0.75);
  // Dominant flaw = whichever dimension scored worst (if any is weak).
  let flaw: RepData['flaw'] = null;
  const worst = symKnown ? Math.min(depth, tempo, sym) : Math.min(depth, tempo);
  if (worst < 70) {
    if (worst === depth) flaw = 'shallow';
    else if (worst === tempo) flaw = tempoFlaw ?? 'rushed';
    else flaw = 'uneven';
  }
  return { score, flaw };
}

export interface SetReport {
  reps: number;
  avgScore: number;
  avgTempoMs: number;
  bestRep: RepData | null;
  worstRep: RepData | null;
  flawCounts: Record<string, number>;
  data: RepData[];
}

/**
 * The engine banks a `RepResult` (what happened); the report card renders a
 * `RepData` (what it was worth). Keeping the translation here means the engine
 * never has to know about grading curves, and the card keeps the exact shape it
 * has always rendered.
 */
export function toRepData(r: RepResult, category?: string): RepData {
  // symmetryAtBottom is NaN when only one side was readable — passed through
  // untouched so scoreRep can drop the term instead of scoring the unknown.
  const { score, flaw } = scoreRep(r.bottomAngle, r.totalMs, r.symmetryAtBottom, category);
  return {
    index: r.index,
    bottomDeg: r.bottomAngle,
    tempoMs: r.totalMs,
    symmetry: r.symmetryAtBottom,
    score,
    flaw,
  };
}

/** Summarize a finished set for the end-of-set report card. */
export function buildReport(reps: RepResult[], category?: string): SetReport {
  const data = reps.map((r) => toRepData(r, category));
  const n = data.length;
  const flawCounts: Record<string, number> = {};
  for (const r of data) if (r.flaw) flawCounts[r.flaw] = (flawCounts[r.flaw] ?? 0) + 1;
  return {
    reps: n,
    avgScore: n ? Math.round(data.reduce((s, r) => s + r.score, 0) / n) : 0,
    avgTempoMs: n ? Math.round(data.reduce((s, r) => s + r.tempoMs, 0) / n) : 0,
    bestRep: n ? data.reduce((a, b) => (b.score > a.score ? b : a)) : null,
    worstRep: n ? data.reduce((a, b) => (b.score < a.score ? b : a)) : null,
    flawCounts,
    data,
  };
}
