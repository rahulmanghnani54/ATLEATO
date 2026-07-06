import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { AnimatedRing, CountUp } from '@/components/ui/motion';

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function CalorieRing({ consumed, goal, size = 180 }: Props) {
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const remaining = Math.max(goal - consumed, 0);

  return (
    <AnimatedRing
      progress={progress}
      size={size}
      stroke={14}
      color={Colors.primary}
      trackColor="rgba(10,31,25,0.08)"
    >
      <View style={styles.center}>
        <CountUp value={remaining} style={styles.big} />
        <Text style={styles.label}>kcal left</Text>
      </View>
    </AnimatedRing>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: Fonts.display, fontSize: 34, color: Colors.text, letterSpacing: -0.5 },
  label: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});
