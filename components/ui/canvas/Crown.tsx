/**
 * Crown — the full-bleed dark hero that opens a key screen.
 *
 * It runs edge-to-edge and under the status bar, so it pads for the top inset
 * itself; CanvasScreen deliberately adds none. The persona accent lives here as
 * a soft radial tint: RN has no radial gradient, so it is a large translucent
 * circle bled off the top-right corner, faded back into the crown by a vertical
 * LinearGradient. That keeps the accent a glow rather than a shape.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export interface CrownProps {
  /** Tiny mono uppercase line above the title. */
  eyebrow?: string;
  title: string;
  /** Second title line, rendered in the persona accent. */
  accentLine?: string;
  /** One dim line under the title. */
  meta?: string;
  /** Mono chips outlined in crownLine. */
  pills?: string[];
  /** Persona accent driving the radial tint and the accent line. Defaults to tokens.crownAccent. */
  accent?: string;
  /** Top-right slot — avatar, action, badge. */
  right?: ReactNode;
  /** Renders a back affordance when provided. */
  onBack?: () => void;
  /** Extra content below the pills, still inside the dark block. */
  children?: ReactNode;
}

export function Crown({
  eyebrow,
  title,
  accentLine,
  meta,
  pills,
  accent,
  right,
  onBack,
  children,
}: CrownProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Scoped to FOCUS, not to mount: a crowned tab stays mounted underneath a
  // pushed light screen (profile, add-food), and an unconditional entry on RN's
  // StatusBar stack would leave that screen with white-on-white icons.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const tint = accent ?? tokens.crownAccent;
  // Bled well past the corner so only the falloff of the circle is visible.
  const glow = width * 1.5;

  const hasTopRow = Boolean(onBack || right);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: tokens.crown, paddingTop: insets.top + (hasTopRow ? 8 : 22) },
      ]}
    >
      {/* The crown runs UNDER the status bar and is near-black in both schemes,
          so the clock/battery must go light — the app shell asks for
          dark-content in the light scheme, which is invisible against ink. RN
          stacks StatusBar props, so unmounting restores the shell's setting. */}
      {focused ? <StatusBar barStyle="light-content" /> : null}

      <View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: glow,
            height: glow,
            borderRadius: glow / 2,
            backgroundColor: tint,
            top: -glow * 0.62,
            right: -glow * 0.3,
          },
        ]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', tokens.crown]}
        style={StyleSheet.absoluteFill}
      />

      {hasTopRow ? (
        <View style={styles.topRow}>
          {onBack ? (
            <PressableScale
              onPress={onBack}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              style={[styles.back, { borderColor: tokens.crownLine }]}
            >
              <ChevronLeft size={20} color={tokens.crownText} />
            </PressableScale>
          ) : (
            <View />
          )}
          {right ?? null}
        </View>
      ) : null}

      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: tokens.crownTextDim }]} numberOfLines={1}>
          {eyebrow}
        </Text>
      ) : null}

      <Text style={[styles.title, { color: tokens.crownText }]}>
        {title}
        {accentLine ? <Text style={{ color: tint }}>{`\n${accentLine}`}</Text> : null}
      </Text>

      {meta ? <Text style={[styles.meta, { color: tokens.crownTextDim }]}>{meta}</Text> : null}

      {pills?.length ? (
        <View style={styles.pills}>
          {pills.map((p) => (
            <View key={p} style={[styles.pill, { borderColor: tokens.crownLine }]}>
              <Text style={[styles.pillText, { color: tokens.crownTextDim }]} numberOfLines={1}>
                {p}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    opacity: 0.3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    minHeight: 38,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: 38,
    lineHeight: 41,
    // -0.045em at 38px.
    letterSpacing: -1.71,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  pillText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
