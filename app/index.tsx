import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FitAI Pro</Text>
      <Text style={styles.subtitle}>Scaffold complete ✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h1, color: Colors.primary },
  subtitle: { ...Typography.body, marginTop: 8 },
});
