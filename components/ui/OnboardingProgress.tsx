import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  current: number; // 1-based
  total: number;
}

export function OnboardingProgress({ current, total }: Props) {
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  dot: { borderRadius: 999 },
  active: { width: 24, height: 8, backgroundColor: Colors.primary },
  inactive: { width: 8, height: 8, backgroundColor: '#d1d5db' },
});
