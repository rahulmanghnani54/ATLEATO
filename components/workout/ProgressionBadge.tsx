/**
 * ProgressionBadge — the "add 2.5kg" suggestion under an exercise in a session.
 *
 * It renders INSIDE a Bold Canvas exercise card, so it carries no box of its
 * own: a card inside a card reads as clutter, and the old hardcoded pastel
 * plates (mint/lemon/slate) were light-only — on the dark scheme they were the
 * one bright rectangle on the page.
 *
 * Confidence is spoken by the semantic status tokens instead of three bespoke
 * palettes, and the suggested weight gets the dramatic-type treatment so the
 * number is readable mid-set at arm's length.
 */
import { View, Text, StyleSheet } from 'react-native';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import type { ProgressionSuggestion } from '@/lib/progressionEngine';

interface Props {
  suggestion: ProgressionSuggestion;
}

export function ProgressionBadge({ suggestion }: Props) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const weightChange = suggestion.suggestedWeightKg - suggestion.currentWeightKg;
  const isIncrease = weightChange > 0;
  const isDeload = weightChange < 0;

  // Low confidence stays neutral — colour here would claim certainty the
  // progression engine has explicitly said it does not have.
  const tone =
    suggestion.confidence === 'low'
      ? tokens.textSecondary
      : isDeload
        ? tokens.warning
        : tokens.success;

  const headline = isIncrease
    ? `+${weightChange}kg suggested`
    : isDeload
      ? `${weightChange}kg deload`
      : 'Hold this weight';

  return (
    <View style={styles.root}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: tone }]} numberOfLines={1}>
          {headline}
        </Text>
        <Text style={styles.reason} numberOfLines={2}>
          {suggestion.reason}
        </Text>
      </View>
      <View style={styles.valueCol}>
        <Text style={[styles.value, { color: tone }]}>{suggestion.suggestedWeightKg}</Text>
        <Text style={styles.unit}>kg next</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
      marginBottom: 2,
    },
    text: { flex: 1, gap: 4 },
    label: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    reason: {
      fontFamily: Fonts.body,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.textSecondary,
    },
    valueCol: { alignItems: 'flex-end' },
    value: {
      fontFamily: Fonts.displayBold,
      fontSize: 27,
      lineHeight: 29,
      // -0.045em at 27px.
      letterSpacing: -1.22,
      fontVariant: ['tabular-nums'],
    },
    unit: {
      fontFamily: Fonts.legacyMono,
      fontSize: 8,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: t.textTertiary,
      marginTop: 3,
    },
  });
