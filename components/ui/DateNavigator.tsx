import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { format, addDays, subDays, isToday } from 'date-fns';

interface Props {
  date: Date;
  onDateChange: (date: Date) => void;
}

export function DateNavigator({ date, onDateChange }: Props) {
  const label = isToday(date) ? 'Today' : format(date, 'MMM d, yyyy');

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => onDateChange(subDays(date, 1))} style={styles.arrow} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={styles.arrowText}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.dateLabel}>{label}</Text>
      <TouchableOpacity
        onPress={() => onDateChange(addDays(date, 1))}
        style={styles.arrow}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        disabled={isToday(date)}
      >
        <Text style={[styles.arrowText, isToday(date) && styles.disabled]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  arrow: { padding: 4 },
  arrowText: { fontSize: 28, color: Colors.text, lineHeight: 32 },
  disabled: { color: Colors.textTertiary },
  dateLabel: { ...Typography.bodyMedium, minWidth: 120, textAlign: 'center' },
});
