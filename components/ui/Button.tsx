import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Fonts } from '@/constants/theme';

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
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[
        styles.base,
        { backgroundColor: bg, borderColor, width: fullWidth ? '100%' : undefined, opacity: isDisabled ? 0.4 : 1 },
        variant === 'secondary' || variant === 'ghost' ? styles.outlined : null,
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={textColor} size="small" />
        : <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      }
    </TouchableOpacity>
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
