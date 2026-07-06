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
import { CountUp } from '@/components/ui/motion';

interface Props {
  value: string;        // pre-formatted ("47" / "12.4k" / "23/500")
  label: string;        // short context, will UPPERCASE
  accent?: boolean;     // emphasize this stat (e.g., the headline streak)
  accentColor?: string; // override accent when accent=true (default: brand orange)
  /** When set, the number TICKS UP to this value on change. `value`'s prefix/
   *  suffix (e.g. the "k" in "12.4k") is preserved via countSuffix. */
  countTo?: number;
  countDecimals?: number;
  countSuffix?: string;
}

export function Stat({ value, label, accent, accentColor = Colors.primary, countTo, countDecimals, countSuffix }: Props) {
  const numStyle = [styles.num, accent && { color: accentColor }];
  return (
    <View style={styles.tile}>
      {typeof countTo === 'number' ? (
        <CountUp value={countTo} decimals={countDecimals} suffix={countSuffix} style={numStyle} />
      ) : (
        <Text style={numStyle}>{value}</Text>
      )}
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
