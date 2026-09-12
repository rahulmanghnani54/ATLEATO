/**
 * formDecision — the layer that decides whether to SPEAK.
 *
 * Device evidence this exists for: the app displayed "ELBOWS TOO WIDE — tuck to
 * ~75 degrees" while the founder sat with his hands on a desk, and counted reps
 * for it. Two failures stacked: it judged a body it could not see, and it said
 * so instantly, repeatedly, on the strength of single frames.
 *
 * So this layer enforces three rules, in order:
 *   1. HARD GATE — when pose quality says the body cannot be judged, the score
 *      is null. Not 0, not "last known", not 72%. Null. A number on screen is a
 *      claim about the user's body; we do not make claims we cannot support.
 *   2. TEMPORAL CONFIRMATION — a finding must hold across ~150-300ms of frames
 *      before it is speakable. One noisy frame never triggers a correction.
 *   3. ANTI-NAG — one thing at a time, with cooldowns, spoken at a moment the
 *      lifter can act on it.
 *
 * Pure decision logic: no React, no timers, no speech. The caller supplies tMs
 * (camera frame timestamps), so the whole engine can be replayed against
 * recorded video instead of validated by device builds.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
//
// These are declared structurally rather than imported so this module can be
// replayed and unit-tested standalone. TypeScript is structural: the richer
// PoseQuality / FormFinding objects produced upstream assign to these as long
// as the named fields match.
// ─────────────────────────────────────────────────────────────────────────────

export interface PoseQuality {
  /** 0..100 — how well the body can be seen and tracked right now. */
  overall: number;
  /** False when the pose is not trustworthy enough to judge form at all. */
  canJudge: boolean;
  /** Camera/positioning advice to show instead of a score, when available. */
  advice: string | null;
}

export type FormSeverity = 'info' | 'minor' | 'major' | 'critical';

export interface FormFinding {
  /** Stable identity of the fault (e.g. 'elbow_flare'); cooldowns key off it. */
  id: string;
  /**
   * Word or 0..1 magnitude. Numbers above 1 are read as a 0..100 scale, because
   * biomechanics modules upstream are authored independently and both
   * conventions are in the wild.
   */
  severity: FormSeverity | number;
  /** How sure the biomechanics layer is. 0..1, or 0..100 if above 1. */
  confidence: number;
  /** Coaching line to speak or display. */
  message: string;
  joint?: string;
}

export type RepPhase =
  | 'idle'
  | 'setup'
  | 'eccentric'
  | 'bottom'
  | 'concentric'
  | 'top'
  | 'lockout'
  | 'rest';

export interface FormVerdict {
  /** 0..100, or NULL when the pose cannot be judged. Never a fallback number. */
  score: number | null;
  /** 0..100 — how much to trust `score`. Reported separately, always. */
  confidence: number;
  /** Findings that survived temporal confirmation this frame; ordered worst-first. */
  findings: FormFinding[];
  /** The ONE finding worth saying right now, or null to stay silent. */
  speak: FormFinding | null;
  /** Camera/positioning advice when quality is too low to coach. */
  advice: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuning
// ─────────────────────────────────────────────────────────────────────────────

/** A finding must hold this long before it may be spoken. */
const CONFIRM_MS = 220;
/**
 * ...and across this many distinct frames. Duration alone is not enough: two
 * frames 250ms apart is a dropout, not a persistent fault.
 */
const CONFIRM_FRAMES = 3;
/** A finding not seen for this long is treated as gone and must re-confirm. */
const STALE_MS = 400;
/** Same fault stays quiet this long after being spoken. */
const SAME_FINDING_COOLDOWN_MS = 9000;
/**
 * ...unless the SAME fault gets materially worse, which is new information
 * rather than a repeat. Keying the cooldown on id alone meant a fault spoken as
 * minor and then escalating to critical stayed silent for the rest of the 9s
 * window: measured at 5.3s of silence on an injury-risk escalation. One step up
 * the severity scale (minor->major, major->critical) re-opens the mouth.
 */
const ESCALATION_STEP = 0.3;
/** ...but never as a stutter. An escalation still waits this long after the last
 *  time this same fault was spoken. */
const ESCALATION_MIN_GAP_MS = 1500;
/** No two corrections closer together than this, whatever they are. */
const ANY_SPEECH_GAP_MS = 3000;
/** Below this trust level we display but do not speak — silence beats a guess. */
const MIN_SPEAK_CONFIDENCE = 55;
/** Below this pose quality, surface positioning advice even while judging. */
const ADVICE_QUALITY_FLOOR = 55;
/** Score smoothing per update; low enough that one frame cannot swing the UI. */
const SCORE_EMA = 0.18;
/** Confidence tracking of a finding, smoothed the same way. */
const FINDING_CONF_EMA = 0.3;
/** Full-weight penalty for a sustained critical fault. */
const MAX_PENALTY = 55;
/** Persistence beyond this adds no further penalty. */
const PENALTY_SATURATION_MS = 1500;

const SEVERITY_WEIGHT: Record<FormSeverity, number> = {
  info: 0.15,
  minor: 0.35,
  major: 0.7,
  critical: 1,
};

/**
 * Phases where a correction is actionable. Mid-rep the lifter is under load and
 * cannot change anything without breaking the set, so only critical (injury
 * risk) findings interrupt; everything else waits for the top or the rest.
 */
const COACHABLE_PHASES: ReadonlySet<RepPhase> = new Set<RepPhase>([
  'idle',
  'setup',
  'top',
  'lockout',
  'rest',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

/** Normalise a 0..1-or-0..100 field to 0..1. */
function toUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return clamp(n > 1 ? n / 100 : n, 0, 1);
}

function severityWeight(severity: FormSeverity | number): number {
  if (typeof severity === 'number') return toUnit(severity);
  return SEVERITY_WEIGHT[severity] ?? SEVERITY_WEIGHT.minor;
}

interface Track {
  /** Latest payload, so `findings` and `speak` carry current wording/values. */
  finding: FormFinding;
  firstSeenMs: number;
  lastSeenMs: number;
  frames: number;
  /** Accumulated time the fault has been continuously present. */
  activeMs: number;
  /** Smoothed confidence; a fault that flickers in confidence stays quiet. */
  confidence: number;
  /** Peak severity seen this episode — a fault does not get quieter by fading. */
  weight: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FormDecider
// ─────────────────────────────────────────────────────────────────────────────

export class FormDecider {
  private tracks = new Map<string, Track>();
  private spokenAtMs = new Map<string, number>();
  /** Severity weight each fault carried when it was last spoken, so an escalation
   *  can be told apart from a repeat. */
  private spokenWeight = new Map<string, number>();
  private lastSpeechMs = -Infinity;
  private lastTMs: number | null = null;
  private score = 100;
  /** False until the first judgeable frame, so score starts honest, not at 100. */
  private scoreSeeded = false;

  update(
    quality: PoseQuality,
    findings: FormFinding[],
    phase: RepPhase,
    tMs: number,
  ): FormVerdict {
    const now = Number.isFinite(tMs) ? tMs : (this.lastTMs ?? 0);
    // Timestamps come from camera frames; a jump backwards means a new stream
    // (or a replay restart) and the accumulated evidence no longer applies.
    if (this.lastTMs !== null && now < this.lastTMs) this.resetEvidence();
    this.lastTMs = now;

    const overall = clamp(quality.overall, 0, 100);

    // ── Rule 1: the hard gate. ────────────────────────────────────────────
    if (!quality.canJudge) {
      // Evidence gathered while the body was visible does not survive losing
      // sight of it; anything still wrong must re-confirm once we can see again.
      this.tracks.clear();
      this.scoreSeeded = false;
      return {
        score: null,
        confidence: overall,
        findings: [],
        speak: null,
        advice: quality.advice ?? 'Step back so your whole body is in frame.',
      };
    }

    this.ingest(findings, now);
    this.prune(now);

    const confirmed = this.confirmed();
    const confidence = this.blendConfidence(overall, confirmed);
    const score = this.updateScore(confirmed);
    const speak = this.pickSpeech(confirmed, confidence, phase, now);
    if (speak) {
      this.spokenAtMs.set(speak.id, now);
      this.spokenWeight.set(speak.id, this.tracks.get(speak.id)?.weight ?? 0);
      this.lastSpeechMs = now;
    }

    // The screen shows findings[0] as THE correction. Until now the list came
    // out in Map insertion order — whichever fault the checks emitted first —
    // so a minor cue could sit above an injury-risk one for as long as both
    // persisted. Rank it the way speech is ranked, so what is displayed and what
    // would be said agree. Sorted after pickSpeech so speech election, which
    // walks this array in place, is untouched; `confirmed()` returns a fresh
    // array, so sorting in place disturbs nothing else.
    confirmed.sort((a, b) => (this.outranks(a, b) ? -1 : this.outranks(b, a) ? 1 : 0));

    return {
      score,
      confidence,
      findings: confirmed.map((t) => t.finding),
      speak,
      // Quality is judgeable but marginal: still worth telling the user how to
      // give the camera a better look, without hiding the score.
      advice: overall < ADVICE_QUALITY_FLOOR ? quality.advice : null,
    };
  }

  reset(): void {
    this.resetEvidence();
    this.spokenAtMs.clear();
    this.spokenWeight.clear();
    this.lastSpeechMs = -Infinity;
    this.lastTMs = null;
  }

  private resetEvidence(): void {
    this.tracks.clear();
    this.score = 100;
    this.scoreSeeded = false;
  }

  // ── Rule 2: temporal confirmation. ──────────────────────────────────────
  private ingest(findings: FormFinding[], now: number): void {
    const seen = new Set<string>();
    for (const finding of findings) {
      if (!finding || typeof finding.id !== 'string' || finding.id.length === 0) continue;
      if (seen.has(finding.id)) continue; // first wins; duplicates are upstream noise
      seen.add(finding.id);

      const conf = toUnit(finding.confidence);
      const weight = severityWeight(finding.severity);
      const existing = this.tracks.get(finding.id);

      if (!existing || now - existing.lastSeenMs > STALE_MS) {
        this.tracks.set(finding.id, {
          finding,
          firstSeenMs: now,
          lastSeenMs: now,
          frames: 1,
          activeMs: 0,
          confidence: conf,
          weight,
        });
        continue;
      }

      existing.finding = finding;
      existing.frames += 1;
      // Credit the gap since we last saw it, so a one-frame dropout inside
      // STALE_MS does not restart confirmation from zero.
      existing.activeMs += clamp(now - existing.lastSeenMs, 0, STALE_MS);
      existing.lastSeenMs = now;
      existing.confidence += (conf - existing.confidence) * FINDING_CONF_EMA;
      if (weight > existing.weight) existing.weight = weight;
    }
  }

  private prune(now: number): void {
    for (const [id, track] of this.tracks) {
      if (now - track.lastSeenMs > STALE_MS) this.tracks.delete(id);
    }
    for (const [id, at] of this.spokenAtMs) {
      if (now - at > SAME_FINDING_COOLDOWN_MS * 2) {
        this.spokenAtMs.delete(id);
        this.spokenWeight.delete(id);
      }
    }
  }

  private confirmed(): Track[] {
    const out: Track[] = [];
    for (const track of this.tracks.values()) {
      if (track.frames < CONFIRM_FRAMES) continue;
      if (track.activeMs < CONFIRM_MS) continue;
      out.push(track);
    }
    return out;
  }

  private blendConfidence(overall: number, confirmed: Track[]): number {
    if (confirmed.length === 0) return Math.round(overall);
    let sum = 0;
    for (const track of confirmed) sum += track.confidence;
    const findingConf = (sum / confirmed.length) * 100;
    // Pose quality dominates: a confident fault read off a badly seen body is
    // still a badly seen body.
    return Math.round(clamp(overall * 0.65 + findingConf * 0.35, 0, 100));
  }

  private updateScore(confirmed: Track[]): number {
    let penalty = 0;
    for (const track of confirmed) {
      const persistence = clamp(track.activeMs / PENALTY_SATURATION_MS, 0, 1);
      // Ramp from the confirmation threshold rather than from zero, so a fault
      // does not slam the score the instant it confirms.
      const ramp = 0.4 + 0.6 * persistence;
      penalty += MAX_PENALTY * track.weight * ramp * track.confidence;
    }
    const target = clamp(100 - penalty, 0, 100);
    if (!this.scoreSeeded) {
      this.score = target;
      this.scoreSeeded = true;
    } else {
      this.score += (target - this.score) * SCORE_EMA;
    }
    return Math.round(clamp(this.score, 0, 100));
  }

  // ── Rule 3: anti-nag. ───────────────────────────────────────────────────
  private pickSpeech(
    confirmed: Track[],
    confidence: number,
    phase: RepPhase,
    now: number,
  ): FormFinding | null {
    if (confidence < MIN_SPEAK_CONFIDENCE) return null;
    if (now - this.lastSpeechMs < ANY_SPEECH_GAP_MS) return null;

    const coachable = COACHABLE_PHASES.has(phase);
    let best: Track | null = null;
    for (const track of confirmed) {
      // Only injury-risk faults interrupt a lifter mid-rep.
      const critical = track.weight >= SEVERITY_WEIGHT.critical;
      if (!coachable && !critical) continue;
      const spokenAt = this.spokenAtMs.get(track.finding.id);
      if (spokenAt !== undefined && now - spokenAt < SAME_FINDING_COOLDOWN_MS && !this.escalated(track, spokenAt, now)) {
        continue;
      }
      if (best === null || this.outranks(track, best)) best = track;
    }
    return best ? best.finding : null;
  }

  /**
   * Has this fault got materially WORSE since it was last spoken? `Track.weight`
   * is the peak severity of the episode and only ever rises, so this reads as
   * "it escalated", never as "it flickered". An escalation is new information and
   * the cooldown must not swallow it — but it still respects a short gap so a
   * fault creeping up cannot machine-gun the lifter.
   */
  private escalated(track: Track, spokenAt: number, now: number): boolean {
    if (now - spokenAt < ESCALATION_MIN_GAP_MS) return false;
    const said = this.spokenWeight.get(track.finding.id);
    return said !== undefined && track.weight >= said + ESCALATION_STEP;
  }

  /** Severity first, then confidence, then how long it has persisted. */
  private outranks(a: Track, b: Track): boolean {
    if (a.weight !== b.weight) return a.weight > b.weight;
    if (Math.abs(a.confidence - b.confidence) > 0.05) return a.confidence > b.confidence;
    return a.activeMs > b.activeMs;
  }
}
