/**
 * Onboarding Step 4 — Diet preference
 *
 * Matches step 1/3 polished design. Each option now shows a tiny "macro hint"
 * (e.g. "P 30 / C 50 / F 20") so users see how their choice shifts macros.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

interface DietOption {
  key: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  macroHint: string; // "P/C/F split", short
}

const DIETS: DietOption[] = [
  { key: 'standard',   icon: '🍽️', title: 'Standard',   tagline: 'Everything\'s on the table.',     description: 'Balanced across all food groups. The default for most people.', macroHint: '30 / 45 / 25' },
  { key: 'high_protein', icon: '🥩', title: 'High Protein', tagline: 'Protein-led for muscle.',         description: 'Prioritise protein at every meal. Best for muscle-building cuts.', macroHint: '40 / 35 / 25' },
  { key: 'vegetarian', icon: '🥗', title: 'Vegetarian', tagline: 'No meat. Dairy + eggs OK.',         description: 'We\'ll lean on legumes, paneer, eggs, and dairy for protein.',     macroHint: '25 / 50 / 25' },
  { key: 'vegan',      icon: '🌱', title: 'Vegan',      tagline: '100% plant-based.',                  description: 'Tofu, tempeh, seitan, legumes — protein from plants only.',         macroHint: '20 / 55 / 25' },
  { key: 'keto',       icon: '🥑', title: 'Keto',       tagline: 'Very low carb, very high fat.',     description: 'Fat-fuelled metabolism. Strict carb limit, deliberate planning.',   macroHint: '25 /  5 / 70' },
  { key: 'paleo',      icon: '🥩', title: 'Paleo',      tagline: 'Whole foods only.',                  description: 'Meat, fish, eggs, veg, fruit, nuts. No grains, legumes, dairy.',    macroHint: '35 / 25 / 40' },
];

export default function Step4Diet() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string;
    fromProfile?: string;
  }>();
  const fromProfile = params.fromProfile === '1';
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [selected, setSelected] = useState<string | null>(
    fromProfile ? ((profile as any)?.diet ?? null) : null,
  );
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    if (!fromProfile) {
      router.push({ pathname: '/(onboarding)/step5-program', params: { ...params, diet: selected } });
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from('profiles') as any)
        .update({ diet: selected, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      if (profile) setProfile({ ...profile, diet: selected } as any);
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OnboardingProgress current={4} total={5} />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>STEP 4 OF 5</Text>
          <Text style={styles.headline}>HOW DO{'\n'}YOU EAT?</Text>
          <Text style={styles.sub}>This shapes your macro split and what foods we suggest. You can change it anytime.</Text>
        </View>

        <View style={styles.cards}>
          {DIETS.map((d) => {
            const active = selected === d.key;
            return (
              <TouchableOpacity
                key={d.key}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => setSelected(d.key)}
                activeOpacity={0.85}
              >
                {active && <View style={styles.accentStripe} />}
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Text style={styles.icon}>{d.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>{d.title}</Text>
                    <View style={[styles.macroChip, active && styles.macroChipActive]}>
                      <Text style={[styles.macroChipText, active && styles.macroChipTextActive]}>{d.macroHint}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTagline}>{d.tagline}</Text>
                  <Text style={styles.cardDescription}>{d.description}</Text>
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

        <Text style={styles.macroLegend}>P / C / F = Protein / Carbs / Fat % split</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, (!selected || saving) && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || saving}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>
            {saving ? 'SAVING…' : fromProfile ? 'SAVE  →' : 'CONTINUE  →'}
          </Text>
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
  headline: { fontFamily: Fonts.display, fontSize: 42, color: Colors.text, lineHeight: 42, letterSpacing: -1.4, marginTop: 8, marginBottom: 10 },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  cardTitle:        { fontFamily: Fonts.display, fontSize: 15, color: Colors.text, letterSpacing: -0.2 },
  cardTitleActive:  { color: Colors.primary },
  cardTagline:      { fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.text, marginBottom: 3, opacity: 0.85 },
  cardDescription:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  macroChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  macroChipActive: { borderColor: Colors.primary, backgroundColor: 'rgba(223,255,31,0.1)' },
  macroChipText:        { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.8 },
  macroChipTextActive:  { color: Colors.primary },

  check: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkText: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.accentInk },

  macroLegend: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 14, letterSpacing: 0.6, fontStyle: 'italic',
  },

  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingVertical: 16, alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.3 },
  continueBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1.2 },
});
