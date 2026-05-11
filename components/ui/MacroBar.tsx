import { View, Text, StyleSheet, DimensionValue } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

interface Props {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  unit?: string;
}

export function MacroBar({ label, consumed, goal, color, unit = 'g' }: Props) {
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;

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

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  value: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  goal: { fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  track: { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
