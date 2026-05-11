import { View, Text, StyleSheet } from 'react-native';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  style?: import('react-native').ViewStyle;
}

function getColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 80) return { bg: '#dcfce7', text: '#16a34a', label: 'Excellent' };
  if (score >= 65) return { bg: '#f0fdf4', text: '#22c55e', label: 'Good' };
  if (score >= 50) return { bg: '#fefce8', text: '#ca8a04', label: 'Moderate' };
  if (score >= 35) return { bg: '#fff7ed', text: '#ea580c', label: 'Poor' };
  return { bg: '#fef2f2', text: '#dc2626', label: 'Rest' };
}

const SIZES = {
  sm: { circle: 40, score: 14, label: 10 },
  md: { circle: 56, score: 18, label: 11 },
  lg: { circle: 72, score: 24, label: 12 },
};

export function RecoveryBadge({ score, size = 'md', style }: Props) {
  const { bg, text, label } = getColor(score);
  const s = SIZES[size];

  return (
    <View style={[styles.circle, { width: s.circle, height: s.circle, backgroundColor: bg }, style]}>
      <Text style={[styles.score, { color: text, fontSize: s.score }]}>{score}</Text>
      <Text style={[styles.label, { color: text, fontSize: s.label }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: 'Inter_700Bold' },
  label: { fontFamily: 'Inter_500Medium' },
});
