import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button, Tag } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
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
    difficulty: 'Advanced',
    days: '6 days/week',
    focus: 'Hypertrophy',
    color: '#1a1a2e',
    description: "The legendary double-split that built the greatest physique of all time.",
  },
  {
    id: 'cbum_evolved',
    name: 'CBum Evolved',
    expert: 'Chris Bumstead',
    emoji: '⭐',
    difficulty: 'Intermediate',
    days: '5 days/week',
    focus: 'Classic Physique',
    color: '#7c3aed',
    description: "5× Classic Physique Olympia champion's proven hypertrophy system.",
  },
  {
    id: 'nippard_fundamentals',
    name: 'Science Fundamentals',
    expert: 'Jeff Nippard',
    emoji: '🔬',
    difficulty: 'Beginner–Intermediate',
    days: '4 days/week',
    focus: 'Evidence-Based',
    color: '#0369a1',
    description: "Research-backed program optimised for maximum muscle growth per unit of time.",
  },
  {
    id: 'ct_strength',
    name: 'ISYMFS Strength',
    expert: 'CT Fletcher',
    emoji: '💥',
    difficulty: 'Advanced',
    days: '5 days/week',
    focus: 'Strength + Mass',
    color: '#991b1b',
    description: "Brutal high-intensity training forged on the streets of Compton.",
  },
  {
    id: 'dr_mike_mav',
    name: 'MAV Hypertrophy',
    expert: 'Dr. Mike Israetel',
    emoji: '📊',
    difficulty: 'Intermediate',
    days: '5 days/week',
    focus: 'RP Method',
    color: '#065f46',
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
        .update(updatePayload)
        .eq('id', user.id);

      if (error) throw error;

      await fetchProfile(user.id);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Setup failed. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <OnboardingProgress current={5} total={5} />
        <Text style={styles.headline}>Choose your program</Text>
        <Text style={styles.sub}>Pick the expert whose approach resonates with you</Text>

        <View style={styles.cards}>
          {PROGRAMS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.card, selected === p.id && styles.cardSelected]}
              onPress={() => setSelected(p.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.expertBadge, { backgroundColor: p.color }]}>
                <Text style={styles.expertEmoji}>{p.emoji}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.programName, selected === p.id && styles.programNameSelected]}>{p.name}</Text>
                <Text style={styles.expertName}>{p.expert}</Text>
                <Text style={styles.desc}>{p.description}</Text>
                <View style={styles.tags}>
                  <Tag label={p.difficulty} color="#6b7280" bgColor="#f3f4f6" />
                  <Tag label={p.days} color="#6b7280" bgColor="#f3f4f6" />
                  <Tag label={p.focus} color={Colors.primary} bgColor={Colors.primaryLight} />
                </View>
              </View>
              {selected === p.id && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Complete Setup 🚀"
          onPress={handleComplete}
          disabled={!selected}
          loading={loading}
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
  cards: { gap: Spacing.md },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 2, borderColor: 'transparent', gap: Spacing.md, alignItems: 'flex-start',
  },
  cardSelected: { borderColor: Colors.primary },
  expertBadge: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  expertEmoji: { fontSize: 22 },
  cardBody: { flex: 1 },
  programName: { ...Typography.bodyMedium, marginBottom: 2 },
  programNameSelected: { color: Colors.primary },
  expertName: { ...Typography.caption, color: Colors.primary, marginBottom: 4 },
  desc: { ...Typography.caption, marginBottom: 8, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  checkText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
});
