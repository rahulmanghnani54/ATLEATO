/**
 * PressableScale — the tactile foundation of Evulto's "bold & punchy" feel.
 *
 * Every meaningful tap should spring + tap back. Wrap any button/card:
 *   <PressableScale onPress={...}><YourContent/></PressableScale>
 *
 * - Presses down to 0.94 on a snappy spring, overshoots back on release.
 * - Fires a haptic on press-in (Medium by default; 'heavy' for big actions,
 *   'light' for list rows). No-ops silently if haptics are unavailable.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

type Weight = 'light' | 'medium' | 'heavy';

const IMPACT: Record<Weight, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

// Snappy spring — high stiffness, low mass = fast + a touch of bounce (punchy).
const PRESS_SPRING = { damping: 15, stiffness: 400, mass: 0.5 };

/**
 * Style keys that size or place the component in its PARENT. These have to live
 * on the outer animated wrapper: the wrapper is what the parent lays out, so a
 * `flex: 1` sitting on the inner Pressable is inert and the button silently
 * shrink-wraps its text instead of filling the row. (That shipped in four
 * places before it was caught.) Everything else — padding, background, radius,
 * alignment — stays inside, where it paints the button itself.
 */
const LAYOUT_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'right', 'bottom', 'left', 'zIndex',
] as const;

/** Split a flattened style into [outer layout box, inner paint]. */
function splitStyle(style: StyleProp<ViewStyle>): [ViewStyle | null, ViewStyle | null] {
  const flat = StyleSheet.flatten(style) as Record<string, unknown> | undefined;
  if (!flat) return [null, null];
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  let hasOuter = false;
  for (const k of Object.keys(flat)) {
    if ((LAYOUT_KEYS as readonly string[]).includes(k)) { outer[k] = flat[k]; hasOuter = true; }
    else inner[k] = flat[k];
  }
  return [hasOuter ? (outer as ViewStyle) : null, inner as ViewStyle];
}

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  /** Scale at full press. Lower = more dramatic. Default 0.94. */
  scaleTo?: number;
  /** Haptic weight on press-in. Default 'medium'. Pass null to disable. */
  haptic?: Weight | null;
  style?: StyleProp<ViewStyle>;
}

export function PressableScale({
  children,
  scaleTo = 0.94,
  haptic = 'medium',
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (e: any) => {
      scale.value = withSpring(scaleTo, PRESS_SPRING);
      if (haptic && !disabled) {
        Haptics.impactAsync(IMPACT[haptic]).catch(() => {});
      }
      onPressIn?.(e);
    },
    [scale, scaleTo, haptic, disabled, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      // Overshoot slightly past 1 then settle — the "pop".
      scale.value = withSpring(1, { damping: 12, stiffness: 380, mass: 0.5 });
      onPressOut?.(e);
    },
    [scale, onPressOut],
  );

  const [outerStyle, innerStyle] = useMemo(() => splitStyle(style), [style]);

  return (
    // The wrapper carries the layout box. A View defaults to alignItems:'stretch',
    // so the Pressable fills whatever width the wrapper is given — no extra flex
    // needed on the inner element.
    <Animated.View style={[outerStyle, animStyle, disabled && { opacity: 0.5 }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={innerStyle}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
