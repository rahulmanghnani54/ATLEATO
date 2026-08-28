import { View, Text, StyleSheet } from 'react-native';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  label: string;
  scoreA: number | null;
  scoreB: number | null;
}

export function PhysiqueScoreCard({ label, scoreA, scoreB }: Props) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const delta = scoreA != null && scoreB != null ? scoreB - scoreA : null;
  const arrowColor =
    delta == null ? tokens.textTertiary
    : delta > 0 ? tokens.success
    : delta < 0 ? tokens.warning
    : tokens.textTertiary;
  const arrow = delta == null ? '·' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.scores}>
        <Text style={styles.scoreA}>{scoreA ?? '—'}</Text>
        <Text style={[styles.arrow, { color: arrowColor }]}>{arrow}</Text>
        <Text style={[styles.scoreB, delta != null && delta !== 0 ? { color: arrowColor } : {}]}>
          {scoreB ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    chip: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      alignItems: 'center',
    },
    label: {
      fontFamily: Fonts.mono,
      fontSize: 8,
      color: t.textTertiary,
      letterSpacing: 1.2,
      marginBottom: 6,
    },
    scores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scoreA: { fontFamily: Fonts.display, fontSize: 16, color: t.textSecondary },
    arrow: { fontFamily: Fonts.mono, fontSize: 14 },
    scoreB: { fontFamily: Fonts.display, fontSize: 16, color: t.text },
  });
