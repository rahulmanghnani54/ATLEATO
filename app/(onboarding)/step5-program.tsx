import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { calculateBMR, calculateTDEE, calculateMacros, getAgeFromDOB } from '@/lib/tdee';
import type { ActivityLevel, Goal } from '@/lib/tdee';
import type { Database } from '@/types/database';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

const PROGRAMS = [
  {
    id: 'arnold_blueprint',
    name: "Arnold's Blueprint",
    expert: 'Arnold Schwarzenegger',
    emoji: '🏆',
    difficulty: 'ADVANCED',
    days: '6D/WK',
    focus: 'HYPERTROPHY',
    hue: '#ffb13a',
    description: "The legendary double-split that built the greatest physique of all time.",
  },
  {
    id: 'cbum_evolved',
    name: 'CBum Evolved',
    expert: 'Chris Bumstead',
    emoji: '⭐',
    difficulty: 'INTERMEDIATE',
    days: '5D/WK',
    focus: 'CLASSIC PHYSIQUE',
    hue: '#dfff1f',
    description: "5× Classic Physique Olympia champion's proven hypertrophy system.",
  },
  {
    id: 'nippard_fundamentals',
    name: 'Science Fundamentals',
    expert: 'Jeff Nippard',
    emoji: '🔬',
    difficulty: 'BEGINNER',
    days: '4D/WK',
    focus: 'EVIDENCE-BASED',
    hue: '#5b8cff',
    description: "Research-backed program optimised for maximum muscle growth per unit of time.",
  },
  {
    id: 'ct_strength',
    name: 'ISYMFS Strength',
    expert: 'CT Fletcher',
    emoji: '💥',
    difficulty: 'ADVANCED',
    days: '5D/WK',
    focus: 'STRENGTH + MASS',
    hue: '#ff5b3a',
    description: "Brutal high-intensity training forged on the streets of Compton.",
  },
  {
    id: 'dr_mike_mav',
    name: 'MAV Hypertrophy',
    expert: 'Dr. Mike Israetel',
    emoji: '📊',
    difficulty: 'INTERMEDIATE',
    days: '5D/WK',
    focus: 'RP METHOD',
    hue: '#39e08a',
    description: "Renaissance Periodization: train at Maximum Adaptive Volume for optimal gains.",
  },
];

export default function Step5Program() {
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string; diet: string;
  }>();
  const { user, fetchProfile } = useAuthStore();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!selected || !user) return;
    setLoading(true);
    try {
      const weightKg = parseFloat(params.weightKg);
      const heightCm = parseFloat(params.heightCm);
      const age = getAgeFromDOB(params.dob);
      const gender = (params.gender === 'male' || params.gender === 'female') ? params.gender : 'male';
      const bmr = calculateBMR(weightKg, heightCm, age, gender);
      const tdee = calculateTDEE(bmr, params.activityLevel as ActivityLevel);
      const macros = calculateMacros(tdee, params.goal as Goal, weightKg);

      const updatePayload: ProfileUpdate = {
        goal: params.goal as Goal,
        gender: params.gender as 'male' | 'female',
        date_of_birth: params.dob,
        height_cm: heightCm,
        weight_kg: weightKg,
        activity_level: params.activityLevel as ActivityLevel,
        selected_program: selected,
        tdee: macros.calories,
        protein_g: macros.proteinG,
        carbs_g: macros.carbsG,
        fat_g: macros.fatG,
        onboarding_complete: true,
      };

      const { error } = await (supabase.from('profiles') as ReturnType<typeof supabase.from>)
        .update(updatePayload).eq('id', user.id);

      if (error) throw error;
      await fetchProfile(user.id);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={5} total={5} />

        <View style={styles.header}>
          <Text style={styles.monoLabel}>STEP 5 OF 5</Text>
          <Text style={styles.headline}>PICK YOUR{'\n'}COACH.</Text>
          <Text style={styles.sub}>Choose the expert whose approach resonates with you.</Text>
        </View>

        <View style={styles.cards}>
          {PROGRAMS.map((p) => {
            const isSelected = selected === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, isSelected && { borderColor: p.hue }]}
                onPress={() => setSelected(p.id)}
                activeOpacity={0.85}
              >
                <View style={[styles.accentBar, { backgroundColor: p.hue }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.programName}>{p.name}</Text>
                    <Text style={styles.emoji}>{p.emoji}</Text>
                  </View>
                  <Text style={[styles.expertName, { color: p.hue }]}>{p.expert}</Text>
                  <Text style={styles.desc}>{p.description}</Text>
                  <View style={styles.tagRow}>
                    <View style={styles.tag}><Text style={styles.tagText}>{p.difficulty}</Text></View>
                    <View style={styles.tag}><Text style={styles.tagText}>{p.days}</Text></View>
                    <View style={[styles.tag, { borderColor: p.hue + '55' }]}>
                      <Text style={[styles.tagText, { color: p.hue }]}>{p.focus}</Text>
                    </View>
                  </View>
                </View>
                {isSelected && (
                  <View style={[styles.check, { backgroundColor: p.hue }]}>
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
          style={[styles.continueBtn, (!selected || loading) && styles.continueBtnDisabled]}
          onPress={handleComplete}
          disabled={!selected || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>{loading ? 'SETTING UP…' : 'COMPLETE SETUP'}</Text>
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
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, overflow: 'hidden',
  },
  accentBar: { width: 3, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  programName: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, flex: 1 },
  emoji: { fontSize: 18 },
  expertName: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginBottom: 6 },
  desc: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 2,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tagText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.8 },
  check: {
    width: 22, height: 22, borderRadius: 11, margin: 14, marginLeft: 0,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
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
