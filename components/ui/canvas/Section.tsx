/**
 * Section / Hairline — the quiet structure between hero moments.
 *
 * Bold Canvas has no card borders, so a screen's rhythm comes entirely from
 * these two: a tiny mono label with generous space above it, and a 1px rule at
 * the border token (~9% ink) when two blocks need separating without a box.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export interface SectionProps {
  /** Mono uppercase label in the tertiary ink. */
  label: string;
  children: ReactNode;
  /** Optional trailing slot on the label line — a count, a link, an action. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Applied to the children wrapper. */
  contentStyle?: StyleProp<ViewStyle>;
}

export function Section({ label, children, right, style, contentStyle }: SectionProps) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.root, style]}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: tokens.textTertiary }]} numberOfLines={1}>
          {label}
        </Text>
        {right ?? null}
      </View>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

export interface HairlineProps {
  /** Horizontal inset on both ends, so a rule can start at the text edge. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function Hairline({ inset = 0, style }: HairlineProps) {
  const { tokens } = useTheme();
  return (
    <View
      // A 1px rule is decoration; screen readers should skip it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.rule, { backgroundColor: tokens.border, marginHorizontal: inset }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 34 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  // A full 1px, not StyleSheet.hairlineWidth — at 9% ink a sub-pixel rule
  // vanishes entirely on low-DPI Android.
  rule: { height: 1 },
});
