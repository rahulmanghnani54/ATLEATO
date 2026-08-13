/**
 * Onboarding Step 1 — the goal. Bold Canvas.
 *
 * One question, asked in display type inside the crown; the options below are
 * borderless rows in the light body. The flow's spine (crown + StepRail + a
 * bottom Continue in the same place) repeats on all five steps so first-run
 * reads as ONE journey rather than five unrelated forms.
 *
 * Presentation only: the edit-mode entry (?fromProfile=1), the Supabase write
 * and every route are carried over from the previous version unchanged.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Dumbbell, Flame, Scale, Zap } from 'lucide-react-native';

import { CanvasScreen, Crown } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
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

export default function Step1Goal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromProfile?: string }>();
  const fromProfile = params.fromProfile === '1';
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
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

  const ctaLabel = saving ? 'Saving…' : fromProfile ? 'Save' : 'Continue';

  return (
    <View style={styles.root}>
      <Crown
        eyebrow={`Step 1 of ${STEP_TOTAL}`}
        title="What drives"
        accentLine="you?"
        meta="The whole plan revolves around this one answer."
        right={<StepRail step={1} />}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <CanvasScreen tabBar={false} contentStyle={styles.body}>
        <View style={styles.list}>
          {GOALS.map((g) => {
            const active = selected === g.key;
            return (
              <PressableScale
                key={g.key}
                onPress={() => setSelected(g.key)}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${g.title}. ${g.tagline}`}
                style={[styles.opt, active && styles.optOn]}
              >
                <g.Icon
                  size={22}
                  color={active ? tokens.accentText : tokens.textTertiary}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                <View style={styles.optBody}>
                  <Text style={styles.optTitle}>{g.title}</Text>
                  <Text style={styles.optTag}>{g.tagline}</Text>
                  <Text style={styles.optDesc}>{g.description}</Text>
                </View>
                <View style={[styles.mark, active && styles.markOn]}>
                  {active ? <Check size={14} color={tokens.accentInk} strokeWidth={3} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
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

    // The soft selected block bleeds past the text column, so the rows carry
    // their own inset and pull back out to keep titles on the 22px margin.
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
    optTitle: { fontFamily: Fonts.displayBold, fontSize: 21, letterSpacing: -0.84, color: t.text },
    optTag: { fontFamily: Fonts.bodySemi, fontSize: 12.5, color: t.textSecondary, marginTop: 3 },
    optDesc: {
      fontFamily: Fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: t.textTertiary,
      marginTop: 5,
    },

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
    ctaText: {
      fontFamily: Fonts.displayBold,
      fontSize: 16,
      letterSpacing: -0.3,
      color: t.bg,
    },
  });
