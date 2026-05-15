import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  label: string;
  scoreA: number | null;
  scoreB: number | null;
}

export function PhysiqueScoreCard({ label, scoreA, scoreB }: Props) {
  const delta = scoreA != null && scoreB != null ? scoreB - scoreA : null;
  const arrowColor =
    delta == null ? Colors.textTertiary
    : delta > 0 ? Colors.success
    : delta < 0 ? Colors.warning
    : Colors.textTertiary;
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

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Colors.textTertiary,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  scores: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreA: { fontFamily: Fonts.display, fontSize: 16, color: Colors.textSecondary },
  arrow: { fontFamily: Fonts.mono, fontSize: 14 },
  scoreB: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
});
