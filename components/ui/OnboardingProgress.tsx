import { View, StyleSheet } from 'react-native';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  current: number; // 1-based
  total: number;
}

export function OnboardingProgress({ current, total }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i + 1 === current ? styles.active : styles.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
    dot: { borderRadius: 999 },
    active: { width: 24, height: 8, backgroundColor: t.accent },
    inactive: { width: 8, height: 8, backgroundColor: t.borderStrong },
  });
