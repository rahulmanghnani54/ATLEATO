import { Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Fonts } from '@/constants/theme';
import { PressableScale } from '@/components/ui/motion';

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
  const bg =
    variant === 'primary' ? Colors.primary
    : variant === 'danger' ? Colors.error
    : variant === 'secondary' ? 'transparent'
    : 'transparent';

  const textColor =
    variant === 'primary' ? Colors.accentInk
    : variant === 'danger' ? '#fff'
    : Colors.text;

  const borderColor =
    variant === 'secondary' ? Colors.borderStrong
    : variant === 'ghost' ? Colors.border
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
        variant === 'secondary' || variant === 'ghost' ? styles.outlined : null,
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
