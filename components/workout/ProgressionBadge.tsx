import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { ProgressionSuggestion } from '@/lib/progressionEngine';

interface Props {
  suggestion: ProgressionSuggestion;
}

const CONFIDENCE_COLORS = {
  high: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  medium: { bg: '#fef9c3', text: '#ca8a04', border: '#fde047' },
  low: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
};

export function ProgressionBadge({ suggestion }: Props) {
  const colors = CONFIDENCE_COLORS[suggestion.confidence];
  const weightChange = suggestion.suggestedWeightKg - suggestion.currentWeightKg;
  const isIncrease = weightChange > 0;
  const isDeload = weightChange < 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={styles.icon}>{isIncrease ? '📈' : isDeload ? '📉' : '✅'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.text }]}>
            {isIncrease
              ? `+${weightChange}kg suggested`
              : isDeload
              ? `${weightChange}kg (deload)`
              : 'Maintain weight'}
          </Text>
          <Text style={styles.reason} numberOfLines={2}>{suggestion.reason}</Text>
        </View>
        <Text style={[styles.weight, { color: colors.text }]}>
          {suggestion.suggestedWeightKg}kg
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8, borderWidth: 1,
    padding: Spacing.sm, marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  icon: { fontSize: 18 },
  label: { ...Typography.label, marginBottom: 2 },
  reason: { ...Typography.caption, color: Colors.textSecondary, lineHeight: 16 },
  weight: { fontSize: 16, fontFamily: 'Inter_700Bold' },
});
