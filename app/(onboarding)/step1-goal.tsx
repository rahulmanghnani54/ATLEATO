import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { Goal } from '@/types/index';

const GOALS: { key: Goal; icon: string; title: string; description: string }[] = [
  { key: 'lose_fat', icon: '🔥', title: 'Lose Fat', description: 'Burn fat while preserving muscle mass' },
  { key: 'build_muscle', icon: '💪', title: 'Build Muscle', description: 'Add lean mass with targeted programs' },
  { key: 'maintain', icon: '⚖️', title: 'Maintain', description: 'Stay at current weight and fitness level' },
  { key: 'athletic_performance', icon: '⚡', title: 'Athletic Performance', description: 'Train for speed, power, and endurance' },
];

export default function Step1Goal() {
  const router = useRouter();
  const [selected, setSelected] = useState<Goal | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <OnboardingProgress current={1} total={5} />
        <Text style={styles.headline}>What's your goal?</Text>
        <Text style={styles.sub}>We'll personalise your plan around it</Text>

        <View style={styles.cards}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.key}
              style={[styles.card, selected === g.key && styles.cardSelected]}
              onPress={() => setSelected(g.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{g.icon}</Text>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, selected === g.key && styles.cardTitleSelected]}>{g.title}</Text>
                <Text style={styles.cardDesc}>{g.description}</Text>
              </View>
              {selected === g.key && <View style={styles.checkmark}><Text style={styles.checkmarkText}>✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue"
          onPress={() => router.push({ pathname: '/(onboarding)/step2-stats', params: { goal: selected! } })}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: Spacing.md,
  },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  icon: { fontSize: 28 },
  cardText: { flex: 1 },
  cardTitle: { ...Typography.bodyMedium },
  cardTitleSelected: { color: Colors.primary },
  cardDesc: { ...Typography.caption, marginTop: 2 },
  checkmark: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  checkmarkText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
});
