import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
}

export function RecoverySlider({ label, value, min, max, step = 1, onChange, lowLabel, highLabel }: Props) {
  const steps = Math.round((max - min) / step) + 1;
  const values = Array.from({ length: steps }, (_, i) => min + i * step);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valueText}>{value % 1 === 0 ? value : value.toFixed(1)}</Text>
      </View>
      <View style={styles.track}>
        {values.map((v) => {
          const active = Math.abs(v - value) < step * 0.5;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.dot, active && styles.dotActive]}
              onPress={() => onChange(v)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            />
          );
        })}
      </View>
      {(lowLabel || highLabel) && (
        <View style={styles.hints}>
          {lowLabel && <Text style={styles.hint}>{lowLabel}</Text>}
          {highLabel && <Text style={styles.hint}>{highLabel}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { ...Typography.label },
  valueText: { ...Typography.bodyMedium, color: Colors.primary },
  track: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    flex: 1, height: 12, borderRadius: 6,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    transform: [{ scaleY: 1.4 }],
  },
  hints: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  hint: { ...Typography.caption, color: Colors.textTertiary },
});
