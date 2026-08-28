import { View, Text, StyleSheet } from 'react-native';
import { Fonts } from '@/constants/theme';
import { AnimatedRing, CountUp } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function CalorieRing({ consumed, goal, size = 180 }: Props) {
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const remaining = Math.max(goal - consumed, 0);
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <AnimatedRing
      progress={progress}
      size={size}
      stroke={14}
      color={tokens.accent}
      // The unfilled arc must read as a groove on both schemes; a fixed dark
      // rgba() disappears on the near-black page.
      trackColor={tokens.border}
    >
      <View style={styles.center}>
        <CountUp value={remaining} style={styles.big} />
        <Text style={styles.label}>kcal left</Text>
      </View>
    </AnimatedRing>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center' },
    big: { fontFamily: Fonts.display, fontSize: 34, color: t.text, letterSpacing: -0.5 },
    label: { fontFamily: Fonts.body, fontSize: 13, color: t.textSecondary, marginTop: 2 },
  });
