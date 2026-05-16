import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';

const DIETS = [
  { key: 'standard', icon: '🍽️', title: 'Standard', description: 'Balanced diet with all food groups' },
  { key: 'vegetarian', icon: '🥗', title: 'Vegetarian', description: 'No meat, includes dairy and eggs' },
  { key: 'vegan', icon: '🌱', title: 'Vegan', description: 'Plant-based only' },
  { key: 'keto', icon: '🥑', title: 'Keto', description: 'Very low carb, high fat' },
  { key: 'paleo', icon: '🥩', title: 'Paleo', description: 'Whole foods, no grains or dairy' },
];

export default function Step4Diet() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string;
  }>();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={4} total={5} />

        <View style={styles.header}>
          <Text style={styles.monoLabel}>STEP 4 OF 5</Text>
          <Text style={styles.headline}>DIET{'\n'}PREFERENCE?</Text>
          <Text style={styles.sub}>This shapes your meal plan suggestions.</Text>
        </View>

        <View style={styles.cards}>
          {DIETS.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.card, selected === d.key && styles.cardSelected]}
              onPress={() => setSelected(d.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{d.icon}</Text>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, selected === d.key && { color: Colors.primary }]}>{d.title}</Text>
                <Text style={styles.cardDesc}>{d.description}</Text>
              </View>
              {selected === d.key && (
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
          onPress={() => router.push({ pathname: '/(onboarding)/step5-program', params: { ...params, diet: selected! } })}
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
  icon: { fontSize: 24 },
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
