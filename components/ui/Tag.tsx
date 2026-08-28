import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

interface Props {
  label: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}

export function Tag({ label, color, bgColor, style }: Props) {
  const { tokens } = useTheme();
  // Defaults resolve at render, not as default parameters — a default parameter
  // would freeze the light accent into the signature and never follow a scheme
  // change. The sheet below holds no colours, so it can stay module-level.
  const fg = color ?? tokens.accentText;
  const bg = bgColor ?? tokens.accentSoft;
  return (
    <View style={[styles.tag, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
