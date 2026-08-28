import { View, Text, StyleSheet, DimensionValue } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, consumed, goal, color, unit = 'g' }: Props) {
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(consumed)}<Text style={styles.goal}>/{goal}{unit}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` as DimensionValue, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    container: { marginBottom: Spacing.sm },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    label: { fontSize: 13, fontFamily: 'Inter_500Medium', color: t.text },
    value: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: t.text },
    goal: { fontFamily: 'Inter_400Regular', color: t.textSecondary },
    // The unfilled track has to stay visible against the card it sits on, so it
    // is a surface step rather than a fixed grey.
    track: { height: 6, backgroundColor: t.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
  });
