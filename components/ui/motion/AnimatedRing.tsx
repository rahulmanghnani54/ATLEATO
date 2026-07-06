/**
 * AnimatedRing — a progress ring that FILLS on mount / when its value changes.
 *
 * The calorie ring, XP ring, streak ring — they should sweep to their value,
 * not just appear full. Punchy: a fast spring with a hint of overshoot.
 *   <AnimatedRing progress={0.62} size={160} stroke={12} color={accent}>
 *     <CountUp value={1240} .../>
 *   </AnimatedRing>
 *
 * Reanimated animates the SVG stroke on the UI thread (buttery even during
 * navigation). Children render centered inside the ring.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface AnimatedRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  /** Track (unfilled) color. Default a soft neutral. */
  trackColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Fast fill with a touch of bounce.
const FILL_SPRING = { damping: 16, stiffness: 120, mass: 1 };

export function AnimatedRing({
  progress,
  size = 160,
  stroke = 12,
  color,
  trackColor = 'rgba(10,31,25,0.10)',
  children,
  style,
}: AnimatedRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withSpring(Math.max(0, Math.min(1, progress)), FILL_SPRING);
  }, [progress, anim]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - anim.value),
  }));

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor} strokeWidth={stroke} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children != null && <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>}
    </View>
  );
}
