import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { ActivityLevel } from '@/lib/tdee';

const LEVELS: { key: ActivityLevel; title: string; description: string; icon: string }[] = [
  { key: 'sedentary', icon: '🪑', title: 'Sedentary', description: 'Little to no exercise, desk job' },
  { key: 'lightly_active', icon: '🚶', title: 'Lightly Active', description: '1–3 days/week light exercise' },
  { key: 'moderately_active', icon: '🏃', title: 'Moderately Active', description: '3–5 days/week moderate exercise' },
  { key: 'very_active', icon: '🏋️', title: 'Very Active', description: '6–7 days/week hard exercise' },
  { key: 'extremely_active', icon: '⚡', title: 'Extremely Active', description: 'Physical job + hard training daily' },
];

export default function Step3Activity() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goal: string; gender: string; dob: string; heightCm: string; weightKg: string }>();
  const [selected, setSelected] = useState<ActivityLevel | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <OnboardingProgress current={3} total={5} />
        <Text style={styles.headline}>Activity level</Text>
        <Text style={styles.sub}>Be honest — this affects your calorie targets</Text>

        <View style={styles.cards}>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l.key}
              style={[styles.card, selected === l.key && styles.cardSelected]}
              onPress={() => setSelected(l.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{l.icon}</Text>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, selected === l.key && styles.cardTitleSelected]}>{l.title}</Text>
                <Text style={styles.cardDesc}>{l.description}</Text>
              </View>
              {selected === l.key && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue"
          onPress={() => router.push({ pathname: '/(onboarding)/step4-diet', params: { ...params, activityLevel: selected! } })}
          disabled={!selected}
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xl },
  headline: { ...Typography.h1, marginBottom: 8 },
  sub: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  cards: { gap: Spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 2, borderColor: 'transparent', gap: Spacing.md,
  },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  icon: { fontSize: 24 },
  cardText: { flex: 1 },
  cardTitle: { ...Typography.bodyMedium },
  cardTitleSelected: { color: Colors.primary },
  cardDesc: { ...Typography.caption, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
});
