/**
 * <Stat> — Direction C metric tile
 *
 * A single stat (number + label). Designed to sit in a 3-up row right under
 * the HeroBlock. Drops the v0 "JetBrains Mono kicker" pattern entirely.
 *
 * Usage:
 *   <View style={{flexDirection: 'row', gap: 10}}>
 *     <Stat value="47" label="Day streak" accent />
 *     <Stat value="23" label="Cells" />
 *     <Stat value="12k" label="Week kg" />
 *   </View>
 */
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

interface Props {
  value: string;        // pre-formatted ("47" / "12.4k" / "23/500")
  label: string;        // short context, will UPPERCASE
  accent?: boolean;     // emphasize this stat (e.g., the headline streak)
  accentColor?: string; // override accent when accent=true (default: brand orange)
}

export function Stat({ value, label, accent, accentColor = Colors.primary }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.num, accent && { color: accentColor }]}>{value}</Text>
      <Text style={styles.lbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md - 2,           // off-ladder 14
    minHeight: 76,
    justifyContent: 'center',
  },
  num: {
    ...Typography.statNum,
    marginBottom: Spacing.xs,
  },
  lbl: {
    ...Typography.statLabel,
  },
});
