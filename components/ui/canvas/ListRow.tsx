/**
 * ListRow — a borderless row separated by a hairline, not a box.
 *
 * The divider sits at the BOTTOM of every row except the last, so a list needs
 * no wrapper card. Pass `last` on the final row (or `divider={false}`) rather
 * than trimming a trailing rule with negative margin.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Hairline } from './Section';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Trailing value — a number, a time, a status. */
  value?: string;
  onPress?: () => void;
  /** Render the value in the accent. */
  accent?: boolean;
  /** Custom trailing slot. Replaces `value` when both are given. */
  right?: ReactNode;
  /** Suppress the divider on the final row. */
  last?: boolean;
  /** Force the divider off. Default true. */
  divider?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  value,
  onPress,
  accent = false,
  right,
  last = false,
  divider = true,
  disabled = false,
  style,
  testID,
}: ListRowProps) {
  const { tokens } = useTheme();

  const body = (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (value ? (
          <Text
            style={[styles.value, { color: accent ? tokens.accentText : tokens.textSecondary }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null)}
    </View>
  );

  return (
    <View testID={testID}>
      {onPress ? (
        <PressableScale
          onPress={onPress}
          haptic="light"
          scaleTo={0.98}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        >
          {body}
        </PressableScale>
      ) : (
        body
      )}
      {divider && !last ? <Hairline /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  text: { flex: 1, gap: 3 },
  title: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  value: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
});
