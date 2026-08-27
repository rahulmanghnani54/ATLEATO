// ─────────────────────────────────────────────────────────────────────────────
// Rep state machine — explicit phases, direction-aware.
//
// The old counter was a two-state top/bottom toggle: cross `low` => bottom,
// cross `high` => rep. That shape cannot say WHEN in the lift it is, so every
// biomechanical check had to fire on every frame — including frames where the
// check is meaningless (knee valgus at lockout, bar path at the bottom hold).
// Splitting the cycle into setup/start/eccentric/bottom/concentric/top lets each
// check run at the only moment it means anything.
//
// Angle convention matches the rest of the engine: a SMALL angle is the flexed
// end of the movement ("bottom" — squat depth, elbow flexion at the top of a
// curl) and a LARGE angle is extension ("top" — lockout). Both directions of
// movement use the identical cycle; a curl is not a special case.
//
// Pure: no React, no timers, no camera. The caller owns the clock and supplies
// `tMs` from the camera frame timestamp, so this whole file can be replayed
// against recorded landmark data instead of validated by device builds.
// ─────────────────────────────────────────────────────────────────────────────

export type RepPhase = 'setup' | 'start' | 'eccentric' | 'bottom' | 'concentric' | 'top';

export interface PhaseEvent {
  phase: RepPhase;
  atMs: number;
  angle: number;
}

export interface RepResult {
  index: number;
  bottomAngle: number;
  topAngle: number;
  rom: number;
  eccentricMs: number;
  concentricMs: number;
  totalMs: number;
  symmetryAtBottom: number;
}

export interface StateMachineConfig {
  lowThreshold: number;
  highThreshold: number;
  minRepMs: number;
  minRom: number;
  /** Tracking gap after which the rep in progress is abandoned rather than
   *  completed across the gap. Optional — see DEFAULT_MAX_GAP_MS. */
  maxGapMs?: number;
  /** Angular backtrack needed to call a direction reversal. Optional. */
  reversalDeg?: number;
}

// A rep in progress must not survive a tracking dropout. Parking in 'bottom'
// across a gap is exactly how a set showed 7 reps before the user had entered
// frame: the first extended-arm frame after tracking returned "completed" a rep
// that spanned the blackout. Two detection steps at ~15fps is the tolerance.
const DEFAULT_MAX_GAP_MS = 400;

// Direction is what separates eccentric from concentric, so it cannot flip on
// smoothing ripple. A limb must give back this many degrees from its extreme
// before we believe it turned around. Under this, One-Euro output at the bottom
// of a slow squat oscillates enough to fake a reversal every few frames.
const DEFAULT_REVERSAL_DEG = 6;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class ExerciseStateMachine {
  private readonly cfg: Required<StateMachineConfig>;

  private _phase: RepPhase = 'setup';
  private _count = 0;
  private _reps: RepResult[] = [];

  // Last trustworthy sample. `lastValidMs` is the gap clock — untrusted frames
  // deliberately do not touch it.
  private lastAngle = 0;
  private lastValidMs = -1;
  private hasSample = false;

  // Direction tracking. `dir` is 0 until two trustworthy samples have been seen,
  // so the machine never starts a rep off a single frame.
  private dir: -1 | 0 | 1 = 0;
  private extremeMin = Number.POSITIVE_INFINITY;
  private extremeMax = Number.NEGATIVE_INFINITY;

  // Rep in progress.
  private repStartMs = 0;
  private bottomAngle = Number.POSITIVE_INFINITY;
  private bottomAtMs = 0;   // instant of the deepest point = the eccentric/concentric split
  private bottomSym = 0;    // |L−R| captured AT the deepest point, not averaged over the rep

  constructor(cfg: StateMachineConfig) {
    if (!Number.isFinite(cfg.lowThreshold) || !Number.isFinite(cfg.highThreshold)) {
      throw new RangeError('ExerciseStateMachine: thresholds must be finite');
    }
    if (cfg.highThreshold <= cfg.lowThreshold) {
      throw new RangeError('ExerciseStateMachine: highThreshold must exceed lowThreshold');
    }
    this.cfg = {
      lowThreshold: cfg.lowThreshold,
      highThreshold: cfg.highThreshold,
      minRepMs: Math.max(0, cfg.minRepMs),
      minRom: Math.max(0, cfg.minRom),
      maxGapMs: cfg.maxGapMs != null && cfg.maxGapMs > 0 ? cfg.maxGapMs : DEFAULT_MAX_GAP_MS,
      reversalDeg: cfg.reversalDeg != null && cfg.reversalDeg > 0 ? cfg.reversalDeg : DEFAULT_REVERSAL_DEG,
    };
  }

  get phase(): RepPhase {
    return this._phase;
  }

  get count(): number {
    return this._count;
  }

  get reps(): RepResult[] {
    return this._reps.slice();
  }

  /**
   * Feed one frame. `angle` is null when the pose is missing or untrustworthy —
   * a null must never advance the machine, only age the gap clock.
   * Returns the completed RepResult on the frame it completes, else null.
   */
  update(angle: number | null, tMs: number, symmetry: number, shapeOk: boolean): RepResult | null {
    const trusted = angle != null && Number.isFinite(angle);

    // Gap check runs before anything else and on EVERY frame, trusted or not:
    // a caller that simply stops calling during a dropout must not be able to
    // resume mid-rep either.
    if (this.lastValidMs >= 0 && tMs - this.lastValidMs > this.cfg.maxGapMs) {
      this.abandon();
    }

    if (!trusted) return null;

    const a = angle as number;
    const prev = this.lastAngle;
    const hadSample = this.hasSample;

    this.lastValidMs = tMs;
    this.lastAngle = a;
    this.hasSample = true;

    if (!hadSample) {
      // First trustworthy sample: seed the extremes, claim no direction yet.
      this.extremeMin = a;
      this.extremeMax = a;
      this.dir = 0;
      this.armFromRest(a);
      return null;
    }

    this.updateDirection(a, prev);

    switch (this._phase) {
      case 'setup':
        this.armFromRest(a);
        return null;

      case 'start':
      case 'top':
        // Direction-aware entry: being below the lockout threshold is not enough
        // (a partial-lockout style parks there permanently). The lifter must be
        // actively descending.
        if (a < this.cfg.highThreshold && this.dir === -1) {
          this._phase = 'eccentric';
          this.repStartMs = tMs;
          this.bottomAngle = a;
          this.bottomAtMs = tMs;
          this.bottomSym = symmetry;
        }
        return null;

      case 'eccentric':
        this.trackBottom(a, tMs, symmetry);
        if (a <= this.cfg.lowThreshold) {
          this._phase = 'bottom';
        } else if (this.dir === 1) {
          // Turned around above depth — a partial. Let it run; the minRom gate
          // at completion decides whether it was a rep or a twitch.
          this._phase = 'concentric';
        }
        return null;

      case 'bottom':
        this.trackBottom(a, tMs, symmetry);
        if (this.dir === 1) this._phase = 'concentric';
        return null;

      case 'concentric':
        if (this.dir === -1) {
          // Sank back down mid-ascent (a grind, or a lost landmark). Reopen the
          // descent so the deepest point — and its symmetry — stays honest.
          this.trackBottom(a, tMs, symmetry);
          this._phase = a <= this.cfg.lowThreshold ? 'bottom' : 'eccentric';
          return null;
        }
        if (a >= this.cfg.highThreshold) return this.complete(a, tMs, shapeOk);
        return null;

      default:
        return null;
    }
  }

  /**
   * Tracking lost — drop the rep in progress, KEEP the count.
   * Returns to 'setup', not 'start': after a dropout the machine has to see the
   * lifter back at extension before it will believe another rep is beginning.
   */
  abandon(): void {
    this.clearRep();
    this._phase = 'setup';
    this.dir = 0;
    this.hasSample = false;
    this.lastValidMs = -1;
    this.extremeMin = Number.POSITIVE_INFINITY;
    this.extremeMax = Number.NEGATIVE_INFINITY;
  }

  reset(): void {
    this.abandon();
    this._count = 0;
    this._reps = [];
    this.lastAngle = 0;
  }

  /** 0..1 through the current phase, for a UI progress ring. */
  phaseProgress(): number {
    const a = this.lastAngle;
    const { lowThreshold, highThreshold } = this.cfg;
    switch (this._phase) {
      case 'setup':
        return 0;
      case 'start':
        return 0;
      case 'eccentric':
        return clamp01((highThreshold - a) / (highThreshold - lowThreshold));
      case 'bottom':
        return 1;
      case 'concentric': {
        const from = Math.min(this.bottomAngle, highThreshold);
        const span = highThreshold - from;
        return span > 0 ? clamp01((a - from) / span) : 1;
      }
      case 'top':
        return 1;
      default:
        return 0;
    }
  }

  /** Live phase snapshot for logging and the diagnostic overlay. */
  currentEvent(tMs: number): PhaseEvent {
    return { phase: this._phase, atMs: tMs, angle: this.lastAngle };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** From 'setup', only extension re-arms the machine. Re-arming mid-range would
   *  let a dropout that ended halfway down count the back half as a whole rep. */
  private armFromRest(a: number): void {
    if (a >= this.cfg.highThreshold) this._phase = 'start';
  }

  /** Reversal-gated direction: a limb must give back `reversalDeg` from its
   *  running extreme before the direction is allowed to flip. */
  private updateDirection(a: number, prev: number): void {
    if (a < this.extremeMin) this.extremeMin = a;
    if (a > this.extremeMax) this.extremeMax = a;

    const d = this.cfg.reversalDeg;
    if (this.dir === 1) {
      if (a <= this.extremeMax - d) {
        this.dir = -1;
        this.extremeMin = a;
      }
      return;
    }
    if (this.dir === -1) {
      if (a >= this.extremeMin + d) {
        this.dir = 1;
        this.extremeMax = a;
      }
      return;
    }
    // dir === 0: no direction claimed yet. Take the first move that clears the
    // deadband, measured from the extreme rather than the previous frame so a
    // slow descent still registers.
    if (a <= this.extremeMax - d) {
      this.dir = -1;
      this.extremeMin = a;
    } else if (a >= this.extremeMin + d) {
      this.dir = 1;
      this.extremeMax = a;
    } else if (prev !== a) {
      // Movement inside the deadband stays directionless on purpose.
      this.dir = 0;
    }
  }

  private trackBottom(a: number, tMs: number, symmetry: number): void {
    if (a < this.bottomAngle) {
      this.bottomAngle = a;
      this.bottomAtMs = tMs;
      this.bottomSym = symmetry;
    }
  }

  private complete(topAngle: number, tMs: number, shapeOk: boolean): RepResult | null {
    const totalMs = tMs - this.repStartMs;
    const bottomAngle = this.bottomAngle;
    const rom = topAngle - bottomAngle;
    const eccentricMs = Math.max(0, this.bottomAtMs - this.repStartMs);
    const concentricMs = Math.max(0, tMs - this.bottomAtMs);
    const symmetryAtBottom = this.bottomSym;

    this.clearRep();
    this._phase = 'top';

    // Three independent reasons to throw the cycle away. minRom is the one that
    // kills jitter parked on a threshold: a real rep travels a meaningful arc,
    // a landmark twitching across `highThreshold` travels a few degrees.
    if (!shapeOk) return null;
    if (totalMs < this.cfg.minRepMs) return null;
    if (rom < this.cfg.minRom) return null;

    this._count += 1;
    const result: RepResult = {
      index: this._count,
      bottomAngle,
      topAngle,
      rom,
      eccentricMs,
      concentricMs,
      totalMs,
      symmetryAtBottom,
    };
    this._reps.push(result);
    return result;
  }

  private clearRep(): void {
    this.repStartMs = 0;
    this.bottomAngle = Number.POSITIVE_INFINITY;
    this.bottomAtMs = 0;
    this.bottomSym = 0;
  }
}
