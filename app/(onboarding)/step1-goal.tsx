import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={1} total={5} />

        <View style={styles.header}>
          <Text style={styles.monoLabel}>STEP 1 OF 5</Text>
          <Text style={styles.headline}>WHAT'S{'\n'}YOUR GOAL?</Text>
          <Text style={styles.sub}>We'll personalise your plan around it.</Text>
        </View>

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
                <Text style={[styles.cardTitle, selected === g.key && { color: Colors.primary }]}>{g.title}</Text>
                <Text style={styles.cardDesc}>{g.description}</Text>
              </View>
              {selected === g.key && (
                <View style={styles.check}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
          onPress={() => router.push({ pathname: '/(onboarding)/step2-stats', params: { goal: selected! } })}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>CONTINUE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 14 },

  header: { marginBottom: 24 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text, lineHeight: 34, letterSpacing: -1, marginTop: 6, marginBottom: 8 },
  sub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },

  cards: { gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 6,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 14,
  },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  icon: { fontSize: 26 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, marginBottom: 2 },
  cardDesc: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary },
  check: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.accentInk },

  footer: { padding: 20, paddingBottom: 28 },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1 },
});
