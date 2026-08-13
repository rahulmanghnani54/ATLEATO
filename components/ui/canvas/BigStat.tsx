/**
 * BigStat / StatRow — the dramatic-type pairing that carries every metric.
 *
 * The whole effect is the size gap: a 32px 800-weight numeral sitting directly
 * on an 8px mono label. Do not close that gap.
 *
 * CountUp only animates when its value CHANGES, so a stat mounted at its final
 * number would never tick. BigStat therefore renders 0 for one frame and then
 * the real value — except under reduce-motion, where it mounts settled.
 */

import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { CountUp } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export interface BigStatProps {
  value: string | number;
  /** Small trailing unit — "kg", "kcal", "%". */
  unit?: string;
  /** Tiny mono uppercase caption under the value. */
  label: string;
  /** Render the value in the accent (emerald AS text). Spend this once per screen. */
  accent?: boolean;
  /** Numeral size. Stays inside the 27-38px band. Default 32. */
  size?: number;
  /** Decimal places for numeric values. Defaults to 0, or 1 for a fractional value. */
  decimals?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function BigStat({
  value,
  unit,
  label,
  accent = false,
  size = 32,
  decimals,
  style,
  testID,
}: BigStatProps) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const numeric = typeof value === 'number' && Number.isFinite(value);

  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  const color = accent ? tokens.accentText : tokens.text;
  const valueStyle = [
    styles.value,
    { color, fontSize: size, lineHeight: size * 1.02, letterSpacing: size * -0.045 },
  ];
  const places = decimals ?? (numeric && !Number.isInteger(value) ? 1 : 0);

  return (
    <View style={[styles.root, style]} testID={testID}>
      <View style={styles.valueRow}>
        {numeric ? (
          <CountUp
            value={settled ? (value as number) : 0}
            decimals={places}
            style={valueStyle}
            accessibilityLabel={`${value}${unit ? ` ${unit}` : ''} ${label}`}
          />
        ) : (
          <Text style={valueStyle} numberOfLines={1}>
            {value}
          </Text>
        )}
        {unit ? (
          <Text style={[styles.unit, { color: tokens.textTertiary }]}>{unit}</Text>
        ) : null}
      </View>
      <Text style={[styles.label, { color: tokens.textTertiary }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export interface StatRowProps {
  /** 2-4 <BigStat> children. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function StatRow({ children, style }: StatRowProps) {
  // Each child gets an equal column rather than sizing to its own digits, so
  // labels line up across the row no matter how wide the numbers run.
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.row, style]}>
      {items.map((child, i) => (
        <View key={i} style={styles.cell}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 7 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  value: {
    fontFamily: Fonts.displayBold,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: Fonts.bodySemi,
    fontSize: 12,
    // Lifts the unit off the numeral's descender line so it reads as a suffix.
    paddingBottom: 4,
  },
  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cell: { flex: 1 },
});
