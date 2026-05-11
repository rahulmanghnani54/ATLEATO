import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '@/constants/theme';

interface Props {
  label: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}

export function Tag({ label, color = Colors.primary, bgColor = Colors.primaryLight, style }: Props) {
  return (
    <View style={[styles.tag, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
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
