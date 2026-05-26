/**
 * Onboarding Step 3 — Activity level
 *
 * Matches step 1/4's polished visual language. Adds a small intensity meter
 * (●●●○○) per option so users can compare levels at a glance instead of
 * reading every description.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
import type { ActivityLevel } from '@/lib/tdee';

interface LevelOption {
  key: ActivityLevel;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  intensity: 1 | 2 | 3 | 4 | 5;  // for the ●●●○○ meter
}

const LEVELS: LevelOption[] = [
  { key: 'sedentary',         icon: '🪑', title: 'Sedentary',         tagline: 'Mostly desk, mostly still.',          description: 'Office work, little exercise, screen time.',          intensity: 1 },
  { key: 'lightly_active',    icon: '🚶', title: 'Lightly Active',    tagline: 'Walks and the odd workout.',           description: 'Light exercise 1-3 days a week, on-feet job.',       intensity: 2 },
  { key: 'moderately_active', icon: '🏃', title: 'Moderately Active', tagline: 'You train more days than not.',        description: 'Moderate workouts 3-5 days a week + active life.',   intensity: 3 },
  { key: 'very_active',       icon: '🏋️', title: 'Very Active',       tagline: 'Iron is a routine, not a hobby.',      description: 'Hard training 6-7 days a week, demanding work.',    intensity: 4 },
  { key: 'extremely_active',  icon: '⚡', title: 'Extremely Active',  tagline: 'Athlete or laborer. Or both.',          description: 'Physical job + daily intense training, no off days.', intensity: 5 },
];

export default function Step3Activity() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goal: string; gender: string; dob: string; heightCm: string; weightKg: string }>();
  const [selected, setSelected] = useState<ActivityLevel | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={3} total={5} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>STEP 3 OF 5</Text>
          <Text style={styles.headline}>HOW HARD{'\n'}DO YOU MOVE?</Text>
          <Text style={styles.sub}>Be honest. Overstating this gives you too many calories — and slows progress.</Text>
        </View>

        <View style={styles.cards}>
          {LEVELS.map((l) => {
            const active = selected === l.key;
            return (
              <TouchableOpacity
                key={l.key}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => setSelected(l.key)}
                activeOpacity={0.85}
              >
                {active && <View style={styles.accentStripe} />}
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Text style={styles.icon}>{l.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>{l.title}</Text>
                    <View style={styles.intensityMeter}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <View
                          key={n}
                          style={[
                            styles.intensityDot,
                            { backgroundColor: n <= l.intensity ? (active ? Colors.primary : Colors.textSecondary) : Colors.border },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.cardTagline}>{l.tagline}</Text>
                  <Text style={styles.cardDescription}>{l.description}</Text>
                </View>
                {active && (
                  <View style={styles.check}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
          onPress={() => router.push({ pathname: '/(onboarding)/step4-diet', params: { ...params, activityLevel: selected! } })}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>CONTINUE  →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 24 },

  header: { marginBottom: 22, marginTop: 4 },
  eyebrow:  { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },
  headline: { fontFamily: Fonts.display, fontSize: 38, color: Colors.text, lineHeight: 40, letterSpacing: -1.2, marginTop: 8, marginBottom: 10 },
  sub:      { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  cards: { gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingVertical: 16, paddingHorizontal: 18, paddingLeft: 16,
    borderWidth: 1, borderColor: Colors.border,
    position: 'relative', overflow: 'hidden',
  },
  cardActive: { backgroundColor: 'rgba(223,255,31,0.06)', borderColor: Colors.primary },
  accentStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: Colors.primary },

  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  iconWrapActive: { backgroundColor: 'rgba(223,255,31,0.12)', borderColor: Colors.primary },
  icon: { fontSize: 24 },

  cardBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle:        { fontFamily: Fonts.display, fontSize: 15, color: Colors.text, letterSpacing: -0.2 },
  cardTitleActive:  { color: Colors.primary },
  cardTagline:      { fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.text, marginBottom: 3, opacity: 0.85 },
  cardDescription:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  intensityMeter: { flexDirection: 'row', gap: 4 },
  intensityDot:   { width: 6, height: 6, borderRadius: 3 },

  check: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkText: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.accentInk },

  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingVertical: 16, alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.3 },
  continueBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1.2 },
});
