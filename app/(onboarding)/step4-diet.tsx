/**
 * Onboarding Step 4 — diet preference. Bold Canvas.
 *
 * Same spine as every other step. Each option carries its protein/carb/fat
 * split as mono numerals on the right, so the consequence of the choice is
 * visible before it is made.
 *
 * The edit-mode entry (?fromProfile=1), the Supabase write and both routes are
 * carried over unchanged.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';

import { CanvasScreen, Crown } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

interface DietOption {
  key: string;
  title: string;
  tagline: string;
  description: string;
  /** Protein / carbs / fat, as % of calories. */
  split: [number, number, number];
}

const DIETS: DietOption[] = [
  { key: 'standard',     title: 'Standard',     tagline: "Everything's on the table.",   description: 'Balanced across all food groups. The default for most people.',   split: [30, 45, 25] },
  { key: 'high_protein', title: 'High Protein', tagline: 'Protein-led for muscle.',      description: 'Prioritise protein at every meal. Best for muscle-building cuts.', split: [40, 35, 25] },
  { key: 'vegetarian',   title: 'Vegetarian',   tagline: 'No meat. Dairy + eggs OK.',    description: "We'll lean on legumes, paneer, eggs, and dairy for protein.",      split: [25, 50, 25] },
  { key: 'vegan',        title: 'Vegan',        tagline: '100% plant-based.',            description: 'Tofu, tempeh, seitan, legumes — protein from plants only.',        split: [20, 55, 25] },
  { key: 'keto',         title: 'Keto',         tagline: 'Very low carb, very high fat.', description: 'Fat-fuelled metabolism. Strict carb limit, deliberate planning.',  split: [25, 5, 70] },
  { key: 'paleo',        title: 'Paleo',        tagline: 'Whole foods only.',            description: 'Meat, fish, eggs, veg, fruit, nuts. No grains, legumes, dairy.',   split: [35, 25, 40] },
];

// ─────────────────────────────────────────────────────────────────────────────
// The shared spine. Duplicated verbatim across the five step files: the kit has
// no onboarding primitive and the steps are the only owners of this flow.
// ─────────────────────────────────────────────────────────────────────────────

const STEP_TOTAL = 5;

function StepRail({ step }: { step: number }) {
  const { tokens } = useTheme();
  return (
    <View
      style={railStyles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${STEP_TOTAL}`}
    >
      {Array.from({ length: STEP_TOTAL }, (_, i) => {
        const n = i + 1;
        const now = n === step;
        return (
          <View
            key={n}
            style={[
              railStyles.seg,
              now && railStyles.segNow,
              {
                backgroundColor: now
                  ? tokens.crownAccent
                  : n < step
                    ? tokens.crownText
                    : tokens.crownLine,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const railStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seg: { width: 12, height: 3, borderRadius: 999 },
  segNow: { width: 24 },
});

export default function Step4Diet() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string;
    fromProfile?: string;
  }>();
  const fromProfile = params.fromProfile === '1';
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
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

  const ctaLabel = saving ? 'Saving…' : fromProfile ? 'Save' : 'Continue';

  return (
    <View style={styles.root}>
      <Crown
        eyebrow={`Step 4 of ${STEP_TOTAL}`}
        title="How do"
        accentLine="you eat?"
        meta="This shapes your macro split and what foods we suggest. You can change it anytime."
        right={<StepRail step={4} />}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <CanvasScreen tabBar={false} contentStyle={styles.body}>
        <View style={styles.list}>
          {DIETS.map((d) => {
            const active = selected === d.key;
            const [p, c, f] = d.split;
            return (
              <PressableScale
                key={d.key}
                onPress={() => setSelected(d.key)}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${d.title}. ${d.tagline} ${p} percent protein, ${c} percent carbs, ${f} percent fat.`}
                style={[styles.opt, active && styles.optOn]}
              >
                <View style={styles.optBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.optTitle}>{d.title}</Text>
                    <Text style={[styles.split, active && styles.splitOn]}>
                      {p} · {c} · {f}
                    </Text>
                  </View>
                  <Text style={styles.optTag}>{d.tagline}</Text>
                  <Text style={styles.optDesc}>{d.description}</Text>
                </View>
                <View style={[styles.mark, active && styles.markOn]}>
                  {active ? <Check size={14} color={tokens.accentInk} strokeWidth={3} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.legend}>Protein · Carbs · Fat, as % of calories</Text>
      </CanvasScreen>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleContinue}
          haptic="heavy"
          scaleTo={0.97}
          disabled={!selected || saving}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={{ disabled: !selected || saving }}
          style={[styles.cta, (!selected || saving) && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    body: { paddingHorizontal: 22, paddingTop: 26 },

    list: { gap: 6, marginHorizontal: -14 },
    opt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 17,
      paddingHorizontal: 14,
      borderRadius: 24,
    },
    optOn: { backgroundColor: t.accentSoft },
    optBody: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    optTitle: { flex: 1, fontFamily: Fonts.displayBold, fontSize: 21, letterSpacing: -0.84, color: t.text },
    optTag: { fontFamily: Fonts.bodySemi, fontSize: 12.5, color: t.textSecondary, marginTop: 3 },
    optDesc: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17, color: t.textTertiary, marginTop: 5 },

    split: {
      fontFamily: Fonts.legacyMono,
      fontSize: 10,
      letterSpacing: 1.2,
      color: t.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    splitOn: { color: t.accentText },

    mark: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Brand emerald is 2.54:1 on white — the deep hairline is what gives the
    // filled marker an identifiable boundary.
    markOn: { backgroundColor: t.accent, borderColor: t.accentLine },

    legend: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: t.textTertiary,
      textAlign: 'center',
      marginTop: 22,
    },

    footer: { paddingHorizontal: 22, paddingTop: 10 },
    cta: {
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: t.text,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    // Nothing else on the screen signals "not yet" — without this the inert
    // button looks fully live.
    ctaDisabled: { opacity: 0.3 },
    ctaText: { fontFamily: Fonts.displayBold, fontSize: 16, letterSpacing: -0.3, color: t.bg },
  });
