/**
 * <AnchorCTA> — Direction C bottom-anchored primary action
 *
 * Sits at the very bottom of a screen above the tab bar / safe area. Persona-
 * colored. The signature "START PUSH DAY →" or "RESUME RUN" button you see in
 * Nike Training Club / Strava / Calm.
 *
 * Pass an `accent` prop (persona accent) to color it; defaults to brand orange.
 *
 * Usage:
 *   <AnchorCTA label="START PUSH DAY →" onPress={...} accent="#c8ff3d" />
 *
 * Note: positioned absolute so it overlays the scroll area. Parent screen
 * should add bottom padding of ~90px to its scroll content so the last item
 * isn't hidden behind this button.
 */
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  accent?: string;        // background color — defaults to brand orange
  accentInk?: string;     // text color on the accent — defaults to white
  disabled?: boolean;
}

export function AnchorCTA({ label, onPress, accent = Colors.primary, accentInk = Colors.accentInk, disabled }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + Spacing.sm + 2 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: accent, shadowColor: accent },
          disabled && { opacity: 0.45 },
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.86}
      >
        <Text style={[styles.label, { color: accentInk }]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.md + 2,                     // off-ladder 18
    right: Spacing.md + 2,                    // off-ladder 18
    bottom: 0,
  },
  btn: {
    borderRadius: Radius.lg,                  // 14 — matches RowCard
    paddingVertical: Spacing.md - 2,          // off-ladder 14
    alignItems: 'center',
    justifyContent: 'center',
    // soft glow — persona-tinted shadow
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
  },
  label: { ...Typography.ctaText },
});
