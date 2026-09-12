/**
 * FormReadout — the honesty fix, rendered.
 *
 * The screen used to show ONE number: "FORM 72%". That single number silently
 * fused two unrelated claims — "your form scored 72" and "I could see you well
 * enough to say so" — and it kept showing a confident value while the camera
 * was looking at an empty room. Splitting it into two readings is the whole
 * point of this component: FORM is a judgement, CONFIDENCE is whether that
 * judgement is worth anything, and the user gets to see both.
 *
 * Two rules this file exists to keep:
 *
 *  1. `score === null` means there is no judgement to show. It renders as a
 *     dash — NEVER as 0, and never as the last number we happened to have. A
 *     stale 72 hanging over a lost body is the exact dishonesty being
 *     corrected. The dash is always explained: by the engine's camera advice
 *     when it refused to judge, or by "First rep sets your score" when the
 *     camera is fine and nothing has been lifted yet. Before `state` existed
 *     those two cases were indistinguishable here, and the a11y label blamed
 *     the camera for a set that had not started.
 *  2. FORM is never coloured good/bad. The engine already expresses that
 *     through findings and speech; tinting the numeral green would restate a
 *     judgement in a channel that has no confidence gate on it. Only
 *     CONFIDENCE carries colour, because "how well can I see you" is precisely
 *     what a traffic-light band is honest about.
 *
 * The score is per REP, not per frame (the screen gates it on a completed
 * rep), so the readout has three shapes: `awaiting` before rep 1, `tracking`
 * while a rep is in flight (one mono line — a big numeral that cannot change
 * until the rep lands would just be a frozen number over a moving body), and
 * `scored` between reps. CONFIDENCE and the joint count are engineering
 * readings; they sit behind `debug` so the lifter sees one number, not three.
 *
 * Renders OVER the camera stage, which is a dark ground in both schemes, so
 * chrome is pinned to TOKENS.dark rather than following the active scheme —
 * the light token set is tuned against white and goes muddy over video. That
 * pin is also why the stylesheet is module-level instead of useThemedStyles:
 * nothing here varies per scheme, and this re-renders at detection rate.
 */

import { memo, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts } from '@/constants/theme';
import { TOKENS } from '@/lib/theme';
import { CountUp } from '@/components/ui/motion';
import { jointConfidenceTier } from '@/lib/vision';

export type FormReadoutState = 'awaiting' | 'tracking' | 'scored';

export interface FormReadoutProps {
  /** NULL means there is no judgement to show. Renders as a dash, never as 0. */
  score: number | null;
  /** 0..100 — how well the body could be seen, blended with finding strength. */
  confidence: number;
  /** Joints usable this frame. */
  trackedJoints: number;
  /** Landmarks the detector emits, e.g. 33. */
  totalJoints: number;
  /**
   * Camera guidance from the engine. Explains the dash before rep 1, and in
   * `scored` state sits under the held rep number — so when the engine stops
   * judging mid-set (NO CLEAR VIEW) the last score is not left unexplained.
   * Callers pass it only while the engine is refusing to judge.
   */
  advice?: string | null;
  /**
   * Which shape to render. Omitted → derived from `score` (`scored` when a
   * number is present, else `awaiting`), so a caller that only knows the
   * verdict still gets a truthful readout.
   */
  state?: FormReadoutState;
  /** 1-based rep the readout refers to: the one in flight or the one just scored. */
  repIndex?: number;
  /** Show CONFIDENCE and the joint count. Off by default — they are engineering readings. */
  debug?: boolean;
}

const stage = TOKENS.dark;

/** U+2014. Wide enough to hold the hero slot, so absence is unmissable. */
const NO_SCORE = '—';

/** U+25CF. The live marker beside "Tracking". */
const LIVE_DOT = '●';

/** Explains the dash before rep 1, when the camera is fine and nothing has happened yet. */
const AWAITING_HELP = 'First rep sets your score';

/**
 * Confidence ticks at detection rate, so the 650ms default would leave the
 * numeral perpetually chasing a target it never reaches. Short enough to
 * settle between frames, long enough not to read as a flicker.
 */
const CONF_MS = 260;

/** Score arrives per rep, not per frame — it can afford the full tick-up. */
const SCORE_MS = 520;

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** `REP 3`, or null when the caller has not said which rep this is. */
function repLabel(repIndex: number | undefined): string | null {
  if (repIndex === undefined || !Number.isFinite(repIndex) || repIndex < 1) return null;
  return `REP ${Math.trunc(repIndex)}`;
}

/**
 * Banded on the ENGINE's own tiers (jointConfidenceTier) rather than on
 * thresholds invented here, so the colour the user sees and the cut-off the
 * engine acts on can never drift apart.
 */
function confidenceColor(pct: number): string {
  const tier = jointConfidenceTier(pct / 100);
  if (tier === 'high') return stage.success;
  if (tier === 'medium') return stage.warning;
  return stage.danger;
}

/**
 * Memoized: the parent re-renders ~30x/sec to interpolate the skeleton, while
 * every prop here changes only when a new detection is ANALYSED (~8Hz). All
 * props are primitives, so the default shallow compare is exact — and
 * skipping the re-render keeps two CountUp animations off the render path for
 * three ticks out of four.
 */
export const FormReadout = memo(function FormReadout({
  score,
  confidence,
  trackedJoints,
  totalJoints,
  advice,
  state,
  repIndex,
  debug = false,
}: FormReadoutProps): JSX.Element {
  const hasScore = score !== null && Number.isFinite(score);
  const mode: FormReadoutState = state ?? (hasScore ? 'scored' : 'awaiting');
  // The state is authoritative: a caller that says `awaiting` gets the dash
  // even if a number is in hand, so a stale score can never leak ahead of rep 1.
  const judged = mode === 'scored' && hasScore;
  const conf = Math.round(clampPct(confidence));
  const tracked = Math.max(0, Math.trunc(trackedJoints));
  const total = Math.max(0, Math.trunc(totalJoints));
  const rep = repLabel(repIndex);
  const repNo = rep ? Math.trunc(repIndex as number) : null;

  // Camera advice always wins the explanation slot: when the engine refused
  // to judge, "first rep sets your score" would be a lie about why the dash
  // is there. The camera copy is only ever used when advice actually exists.
  const explanation = advice ?? (mode === 'awaiting' ? AWAITING_HELP : null);

  const debugLabel = debug
    ? ` Analysis confidence ${conf} percent, tracking ${tracked} of ${total} joints.`
    : '';
  let a11y: string;
  if (mode === 'tracking') {
    a11y = `${repNo ? `Rep ${repNo} in progress` : 'Rep in progress'}, tracking.${debugLabel}`;
  } else if (judged) {
    a11y = `${repNo ? `Rep ${repNo}. ` : ''}Form ${Math.round(clampPct(score as number))}.${advice ? ` ${advice}` : ''}${debugLabel}`;
  } else if (advice) {
    a11y = `Form score unavailable. ${advice}${debugLabel}`;
  } else if (mode === 'awaiting') {
    a11y = `Form score pending. ${AWAITING_HELP}.${debugLabel}`;
  } else {
    a11y = `Form score unavailable.${debugLabel}`;
  }

  return (
    <View style={styles.root} accessible accessibilityRole="summary" accessibilityLabel={a11y}>
      {/* ── Context line: which rep this is, or plainly FORM before rep 1. ── */}
      <Text style={styles.eyebrow} allowFontScaling={false}>
        {mode === 'tracking' ? (
          <>
            {rep ? `${rep} · ` : ''}
            {'Tracking '}
            <Text style={styles.liveDot}>{LIVE_DOT}</Text>
          </>
        ) : (
          (rep ?? 'FORM')
        )}
      </Text>

      {/* ── FORM — the hero. Uncoloured by design. Absent while a rep is in
          flight: the number cannot move until the rep lands, and a frozen
          numeral over a moving body reads as a live score. ─────────────── */}
      {mode !== 'tracking' ? (
        <View style={styles.block}>
          {judged ? (
            // Keyed off the judged state so returning from a dash MOUNTS a fresh
            // CountUp seeded at the new value. Without that it would animate up
            // from whatever number was on screen before the blackout — inventing
            // a climb across frames where nothing was measured at all.
            <CountUp
              key="form-live"
              value={Math.round(clampPct(score as number))}
              duration={SCORE_MS}
              style={styles.heroValue}
              allowFontScaling={false}
            />
          ) : (
            <Text style={styles.heroValue} allowFontScaling={false}>
              {NO_SCORE}
            </Text>
          )}
          {/* The under-label names the numeral; when the eyebrow already says
              FORM (no rep yet) it would only repeat itself. */}
          {rep ? (
            <Text style={styles.label} allowFontScaling={false}>
              Form
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The pairing that carries the whole fix: no score, and the reason why.
          A judged number keeps the slot too, but only for camera advice: the
          held rep score is the LAST rep's, and if the engine has since stopped
          judging the lifter should read why under it, not a bare number. */}
      {mode !== 'tracking' && (judged ? advice : explanation) ? (
        <Text style={advice ? styles.advice : styles.helper}>{judged ? advice : explanation}</Text>
      ) : null}

      {debug ? (
        <>
          <View style={styles.rule} />

          {/* ── CONFIDENCE — the only numeral allowed to carry colour. ─────── */}
          <View style={styles.block}>
            <View style={styles.confRow}>
              <CountUp
                value={conf}
                duration={CONF_MS}
                style={[styles.confValue, { color: confidenceColor(conf) }]}
                allowFontScaling={false}
              />
              <Text
                style={[styles.confUnit, { color: confidenceColor(conf) }]}
                allowFontScaling={false}
              >
                %
              </Text>
            </View>
            <Text style={styles.label} allowFontScaling={false}>
              Confidence
            </Text>
          </View>

          <Text style={styles.tracking} allowFontScaling={false}>
            {`Tracking ${tracked}/${total} joints`}
          </Text>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // Borderless: this floats on the video, depth comes from the scrim beneath it.
  root: { gap: 14 },

  block: { alignItems: 'flex-start' },

  // Written in literal caps rather than textTransform so the mixed-case
  // "Tracking" survives beside the REP counter.
  eyebrow: {
    fontFamily: Fonts.legacyMono,
    fontVariant: ['tabular-nums'],
    fontSize: 9,
    letterSpacing: 1.8,
    color: stage.crownTextDim,
  },
  liveDot: { color: stage.success, letterSpacing: 0 },

  // 76px numeral straight onto a 9px mono label — the Bold Canvas jump, with
  // nothing at intermediate sizes to soften it.
  heroValue: {
    fontFamily: Fonts.displayBold,
    fontVariant: ['tabular-nums'],
    fontSize: 76,
    lineHeight: 77,
    letterSpacing: -3.04,
    color: stage.crownText,
  },

  confRow: { flexDirection: 'row', alignItems: 'flex-end' },
  confValue: {
    fontFamily: Fonts.displayBold,
    fontVariant: ['tabular-nums'],
    fontSize: 40,
    lineHeight: 41,
    letterSpacing: -1.6,
  },
  confUnit: {
    fontFamily: Fonts.legacyMono,
    fontSize: 13,
    letterSpacing: 0.4,
    marginLeft: 3,
    paddingBottom: 6,
  },

  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: stage.crownTextDim,
    marginTop: 4,
  },

  advice: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: stage.crownText,
    marginTop: -4,
  },

  // Quieter than `advice`: nothing is wrong, the set just has not started.
  helper: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: stage.crownTextDim,
    marginTop: -4,
  },

  // Hairline, not a card edge — the only separator on the stage.
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: stage.crownLine },

  tracking: {
    fontFamily: Fonts.legacyMono,
    fontVariant: ['tabular-nums'],
    fontSize: 10,
    letterSpacing: 0.6,
    color: stage.textTertiary,
  },
});
