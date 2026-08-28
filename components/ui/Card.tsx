import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: number;
  raised?: boolean;
}

export function Card({ children, style, onPress, padding = Spacing.md, raised }: Props) {
  const styles = useThemedStyles(makeStyles);
  const content = (
    <View style={[styles.card, raised && styles.cardRaised, { padding }, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: t.border,
    },
    cardRaised: {
      // In dark the raised step is a lighter surface, not a shadow — shadows are
      // invisible on a near-black page.
      backgroundColor: t.surfaceAlt,
    },
  });
