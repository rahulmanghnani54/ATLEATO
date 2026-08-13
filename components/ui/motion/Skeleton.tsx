/**
 * Skeleton — a shimmering placeholder that replaces spinners.
 *
 * A spinner says "something might be broken". A skeleton says "your content is
 * on its way" — the screen looks built even while loading. Use it for any
 * async block:
 *   {isLoading ? <Skeleton height={80} radius={12} /> : <RealContent/>}
 *
 * A soft highlight sweeps left→right on a loop (Reanimated, UI thread).
 *
 * The plate is a TOKEN, not a fixed tint: a dark ink at 7% is invisible on the
 * dark page, which used to leave every dark-scheme loading state blank.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, type DimensionValue, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from '@/lib/theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 20, radius = 8, style }: SkeletonProps) {
  const { tokens } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-220, 220]) }],
  }));

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: tokens.border, overflow: 'hidden' },
        style,
      ]}
    >
      <AnimatedGradient
        colors={['transparent', tokens.accentSoft, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, sweep]}
      />
    </View>
  );
}

/** Convenience: N stacked skeleton lines with a gap (e.g. a loading list). */
export function SkeletonLines({ count = 3, height = 16, gap = 10 }: { count?: number; height?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}
