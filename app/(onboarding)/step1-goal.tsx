/**
 * Onboarding Step 1 — What drives you?
 *
 * Goal selection. Polished to match step 5's design weight:
 * larger headline, prominent option cards with icon-in-circle + lime
 * accent stripe on selection. Same flow + same data, better feel.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
import { Flame, Dumbbell, Scale, Zap, Check, ArrowRight } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import type { Goal } from '@/types/index';

interface GoalOption {
  key: Goal;
  Icon: any;
  title: string;
  tagline: string;
  description: string;
}

const GOALS: GoalOption[] = [
  {
    key: 'lose_fat',
    Icon: Flame,
    title: 'Lose Fat',
    tagline: 'Drop body fat. Keep the muscle.',
    description: 'Calorie deficit + protein-first training to preserve lean mass.',
  },
  {
    key: 'build_muscle',
    Icon: Dumbbell,
    title: 'Build Muscle',
    tagline: 'Add lean size, the right way.',
    description: 'Surplus calories, progressive overload, hypertrophy-optimized splits.',
  },
  {
    key: 'maintain',
    Icon: Scale,
    title: 'Maintain',
    tagline: 'Hold your shape. Recompose slowly.',
    description: 'Stay at your current weight while improving body composition.',
  },
  {
    key: 'athletic_performance',
    Icon: Zap,
    title: 'Athletic Performance',
    tagline: 'Train for speed, power, endurance.',
    description: 'Performance-focused programming with carb timing for output.',
  },
];

export default function Step1Goal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromProfile?: string }>();
  const fromProfile = params.fromProfile === '1';
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [selected, setSelected] = useState<Goal | null>(
    fromProfile ? (profile?.goal as Goal | null) ?? null : null,
  );
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    if (!fromProfile) {
      // Normal onboarding flow — continue to next step
      router.push({ pathname: '/(onboarding)/step2-stats', params: { goal: selected } });
      return;
    }
    // Edit mode — save directly and return to profile
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from('profiles') as any)
        .update({ goal: selected, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      if (profile) setProfile({ ...profile, goal: selected } as any);
      // router.back() can land on /(tabs) instead of /profile when crossing
      // layout groups — force the destination so user always returns to
      // the settings hub where they came from.
      router.replace('/profile' as any);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={1} total={5} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Step 1 of 5</Text>
          <Text style={styles.headline}>What drives{'\n'}you?</Text>
          <Text style={styles.sub}>The whole plan revolves around this one answer.</Text>
        </View>

        <View style={styles.cards}>
          {GOALS.map((g) => {
            const active = selected === g.key;
            return (
              <TouchableOpacity
                key={g.key}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => setSelected(g.key)}
                activeOpacity={0.85}
              >
                {active && <View style={styles.accentStripe} />}
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <g.Icon size={22} color={active ? Colors.primary : Colors.textSecondary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>{g.title}</Text>
                  <Text style={styles.cardTagline}>{g.tagline}</Text>
                  <Text style={styles.cardDescription}>{g.description}</Text>
                </View>
                {active && (
                  <View style={styles.check}>
                    <Check size={14} color={Colors.accentInk} strokeWidth={3} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, (!selected || saving) && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || saving}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            {saving ? 'Saving…' : fromProfile ? 'Save' : 'Continue'}
          </Text>
          {!saving && <ArrowRight size={16} color={Colors.accentInk} />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 14, paddingBottom: 24 },

  header: { marginBottom: 22, marginTop: 4 },
  eyebrow:  { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.2 },
  headline: { fontFamily: Fonts.display, fontSize: 42, color: Colors.text, lineHeight: 44, letterSpacing: -1.4, marginTop: 8, marginBottom: 10 },
  sub:      { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  cards: { gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingVertical: 18, paddingHorizontal: 18, paddingLeft: 16,
    borderWidth: 1, borderColor: Colors.border,
    position: 'relative', overflow: 'hidden',
  },
  cardActive: { backgroundColor: 'rgba(224,90,38,0.06)', borderColor: Colors.primary },
  accentStripe: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: Colors.primary,
  },

  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  iconWrapActive: { backgroundColor: 'rgba(224,90,38,0.12)', borderColor: Colors.primary },

  cardBody: { flex: 1 },
  cardTitle:        { fontFamily: Fonts.display, fontSize: 16, color: Colors.text, marginBottom: 2, letterSpacing: -0.2 },
  cardTitleActive:  { color: Colors.primary },
  cardTagline:      { fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.text, marginBottom: 4, opacity: 0.85 },
  cardDescription:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  check: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },

  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16,
  },
  continueBtnDisabled: { opacity: 0.3 },
  continueBtnText: { fontFamily: Fonts.displayMedium, fontSize: 15, color: Colors.accentInk, letterSpacing: 0.2 },
});
