import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Typography } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
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
    : variant === 'secondary' ? Colors.primaryLight
    : 'transparent';

  const textColor =
    variant === 'primary' || variant === 'danger' ? '#fff'
    : variant === 'secondary' ? Colors.primary
    : Colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg, width: fullWidth ? '100%' : undefined, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={textColor} size="small" />
        : <Text style={[Typography.bodyMedium, { color: textColor }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
