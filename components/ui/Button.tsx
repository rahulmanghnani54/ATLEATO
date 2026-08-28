import { Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Radius, Fonts } from '@/constants/theme';
import { PressableScale } from '@/components/ui/motion';
import { useTheme } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style, fullWidth }: Props) {
  const { tokens } = useTheme();

  const bg =
    variant === 'primary' ? tokens.accent
    : variant === 'danger' ? tokens.danger
    : 'transparent';

  const textColor =
    variant === 'primary' ? tokens.accentInk
    // Danger is a saturated fill in both schemes; its ink stays the light one.
    : variant === 'danger' ? tokens.crownText
    : tokens.text;

  const borderColor =
    variant === 'secondary' ? tokens.borderStrong
    : variant === 'ghost' ? tokens.border
    // A filled emerald button is only 2.54:1 on a light page, so the deep-tone
    // hairline is what makes its boundary identifiable (SC 1.4.11).
    : variant === 'primary' ? tokens.accentLine
    : 'transparent';

  const isDisabled = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      // Primary/danger actions get a heavier tap; quieter variants a lighter one.
      haptic={variant === 'primary' || variant === 'danger' ? 'heavy' : 'light'}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[
        styles.base,
        { backgroundColor: bg, borderColor, width: fullWidth ? '100%' : undefined },
        variant === 'secondary' || variant === 'ghost' || variant === 'primary' ? styles.outlined : null,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={textColor} size="small" />
        : <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      }
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  outlined: {
    borderWidth: 1,
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
