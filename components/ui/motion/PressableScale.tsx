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
import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
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

  return (
    <Animated.View style={[animStyle, disabled && { opacity: 0.5 }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={style}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
