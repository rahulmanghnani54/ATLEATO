import { View, Text, StyleSheet } from 'react-native';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  style?: import('react-native').ViewStyle;
}

/**
 * Five recovery bands, three semantic hues. The old five-hex ramp (green →
 * lime → yellow → orange → red) has no counterpart in the token set and was
 * light-only, so adjacent bands now share a hue and the LABEL carries the
 * finer distinction.
 */
function bandColor(score: number, t: SemanticTokens): { hue: string; label: string } {
  if (score >= 80) return { hue: t.success, label: 'Excellent' };
  if (score >= 65) return { hue: t.success, label: 'Good' };
  if (score >= 50) return { hue: t.warning, label: 'Moderate' };
  if (score >= 35) return { hue: t.warning, label: 'Poor' };
  return { hue: t.danger, label: 'Rest' };
}

// Status hues are only guaranteed 3:1 (non-text) against the page, so the badge
// carries them as a fill tint plus a ring and keeps the numerals on `text`,
// which clears AA on both schemes.
function tint(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  let h = color.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  return `rgba(${(num >> 16) & 0xff}, ${(num >> 8) & 0xff}, ${num & 0xff}, ${alpha})`;
}

const SIZES = {
  sm: { circle: 40, score: 14, label: 10 },
  md: { circle: 56, score: 18, label: 11 },
  lg: { circle: 72, score: 24, label: 12 },
};

export function RecoveryBadge({ score, size = 'md', style }: Props) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { hue, label } = bandColor(score, tokens);
  const s = SIZES[size];

  return (
    <View
      style={[
        styles.circle,
        { width: s.circle, height: s.circle, backgroundColor: tint(hue, 0.14), borderColor: hue },
        style,
      ]}
    >
      <Text style={[styles.score, { fontSize: s.score }]}>{score}</Text>
      <Text style={[styles.label, { fontSize: s.label }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    circle: { borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    score: { fontFamily: 'Inter_700Bold', color: t.text },
    label: { fontFamily: 'Inter_500Medium', color: t.textSecondary },
  });
