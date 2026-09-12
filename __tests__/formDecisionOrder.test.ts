/**
 * The Form Check screen shows ONE correction: `verdict.findings[0]`. Before this
 * pin, `findings` came out in Map insertion order — i.e. whichever fault the
 * biomechanics layer happened to emit first — so a minor cue could sit on screen
 * above an injury-risk one for as long as both persisted. The decider already
 * knew how to rank tracks (its private `outranks`, used to choose what to
 * SPEAK); these cases pin that the displayed list uses the same ranking.
 *
 * Frames are driven the way lib/vision/__tests__/replay.ts drives the decider:
 * one `update()` per camera frame with a judgeable quality, the frame's
 * findings, a phase and a monotonic timestamp.
 */
import { FormDecider, type FormFinding, type FormVerdict, type PoseQuality } from '@/lib/vision/formDecision';

const FRAME_MS = 33;
/** Comfortably past CONFIRM_FRAMES (3) and CONFIRM_MS (220) so both confirm. */
const FRAMES = 12;

const clearView: PoseQuality = { overall: 90, canJudge: true, advice: null };

const finding = (id: string, severity: FormFinding['severity'], confidence = 0.9): FormFinding => ({
  id,
  severity,
  confidence,
  message: `fix ${id}`,
});

/** Feed the same findings every frame and return the last verdict. */
function persist(decider: FormDecider, findings: FormFinding[], frames = FRAMES): FormVerdict {
  let verdict: FormVerdict | null = null;
  for (let i = 0; i < frames; i++) {
    verdict = decider.update(clearView, findings, 'top', i * FRAME_MS);
  }
  if (!verdict) throw new Error('no frames driven');
  return verdict;
}

describe('FormDecider.update — findings are ordered worst-first', () => {
  it('puts a critical finding ahead of a minor one emitted before it', () => {
    const verdict = persist(new FormDecider(), [
      finding('minor_first', 'minor'),
      finding('critical_second', 'critical'),
    ]);
    expect(verdict.findings.map((f) => f.id)).toEqual(['critical_second', 'minor_first']);
  });

  it('keeps a critical finding first when it was also emitted first', () => {
    const verdict = persist(new FormDecider(), [
      finding('critical_first', 'critical'),
      finding('minor_second', 'minor'),
    ]);
    expect(verdict.findings.map((f) => f.id)).toEqual(['critical_first', 'minor_second']);
  });

  it('orders three severities major > minor > info regardless of emission order', () => {
    const verdict = persist(new FormDecider(), [
      finding('info', 'info'),
      finding('minor', 'minor'),
      finding('major', 'major'),
    ]);
    expect(verdict.findings.map((f) => f.id)).toEqual(['major', 'minor', 'info']);
  });

  it('breaks an equal-severity tie by confidence', () => {
    const verdict = persist(new FormDecider(), [
      finding('shaky', 'major', 0.6),
      finding('sure', 'major', 0.95),
    ]);
    expect(verdict.findings.map((f) => f.id)).toEqual(['sure', 'shaky']);
  });

  it('still returns every confirmed finding, not just the top one', () => {
    const verdict = persist(new FormDecider(), [
      finding('a', 'minor'),
      finding('b', 'critical'),
      finding('c', 'major'),
    ]);
    expect(verdict.findings).toHaveLength(3);
  });

  it('returns no findings at all while the body cannot be judged', () => {
    const decider = new FormDecider();
    persist(decider, [finding('a', 'minor'), finding('b', 'critical')]);
    const gated = decider.update(
      { overall: 20, canJudge: false, advice: null },
      [finding('a', 'minor'), finding('b', 'critical')],
      'top',
      FRAMES * FRAME_MS,
    );
    expect(gated.score).toBeNull();
    expect(gated.findings).toEqual([]);
  });
});
