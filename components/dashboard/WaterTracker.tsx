import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface Props {
  glasses: number;
  goalGlasses: number;
  totalMl: number;
  onAddGlass: () => void;
}

export function WaterTracker({ glasses, goalGlasses, totalMl, onAddGlass }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Water</Text>
        <Text style={styles.total}>{totalMl} / 2000 ml</Text>
      </View>
      <View style={styles.drops}>
        {Array.from({ length: goalGlasses }).map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={i >= glasses ? onAddGlass : undefined}
            disabled={i < glasses}
            style={styles.dropBtn}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.drop, i < glasses ? styles.dropFilled : styles.dropEmpty]}>
              💧
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title: Typography.bodyMedium,
  total: { ...Typography.caption, color: Colors.info },
  drops: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  dropBtn: { padding: 2 },
  drop: { fontSize: 22 },
  dropFilled: { opacity: 1 },
  dropEmpty: { opacity: 0.25 },
});
