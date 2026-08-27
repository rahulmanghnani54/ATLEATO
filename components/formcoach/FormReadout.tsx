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
 *  1. `score === null` means the engine refused to judge. It renders as a dash
 *     with the camera advice underneath — NEVER as 0, and never as the last
 *     number we happened to have. A stale 72 hanging over a lost body is the
 *     exact dishonesty being corrected.
 *  2. FORM is never coloured good/bad. The engine already expresses that
 *     through findings and speech; tinting the numeral green would restate a
 *     judgement in a channel that has no confidence gate on it. Only
 *     CONFIDENCE carries colour, because "how well can I see you" is precisely
 *     what a traffic-light band is honest about.
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

export interface FormReadoutProps {
  /** NULL means the engine could not judge. Renders as a dash, never as 0. */
  score: number | null;
  /** 0..100 — how well the body could be seen, blended with finding strength. */
  confidence: number;
  /** Joints usable this frame. */
  trackedJoints: number;
  /** Landmarks the detector emits, e.g. 33. */
  totalJoints: number;
  /** Camera guidance from the engine; shown only while `score` is null. */
  advice?: string | null;
}

const stage = TOKENS.dark;

/** U+2014. Wide enough to hold the hero slot, so absence is unmissable. */
const NO_SCORE = '—';

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
 * five props are primitives, so the default shallow compare is exact — and
 * skipping the re-render keeps two CountUp animations off the render path for
 * three ticks out of four.
 */
export const FormReadout = memo(function FormReadout({
  score,
  confidence,
  trackedJoints,
  totalJoints,
  advice,
}: FormReadoutProps): JSX.Element {
  const judged = score !== null && Number.isFinite(score);
  const conf = Math.round(clampPct(confidence));
  const tracked = Math.max(0, Math.trunc(trackedJoints));
  const total = Math.max(0, Math.trunc(totalJoints));

  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={
        judged
          ? `Form ${Math.round(clampPct(score as number))}, analysis confidence ${conf} percent, tracking ${tracked} of ${total} joints.`
          : `Form score unavailable. ${advice ?? 'The camera cannot see you well enough to judge.'}`
      }
    >
      {/* ── FORM — the hero. Uncoloured by design. ─────────────────────────── */}
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
        <Text style={styles.label} allowFontScaling={false}>
          Form
        </Text>
      </View>

      {/* The pairing that carries the whole fix: no score, and the reason why. */}
      {!judged && advice ? <Text style={styles.advice}>{advice}</Text> : null}

      <View style={styles.rule} />

      {/* ── CONFIDENCE — the only numeral allowed to carry colour. ─────────── */}
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
    </View>
  );
});

const styles = StyleSheet.create({
  // Borderless: this floats on the video, depth comes from the scrim beneath it.
  root: { gap: 14 },

  block: { alignItems: 'flex-start' },

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
