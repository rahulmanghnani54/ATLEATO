/**
 * Onboarding Step 3 — activity level. Bold Canvas.
 *
 * Same spine as every other step: the question is the crown, the answers are
 * borderless rows, the action sits in the same place. The five levels are
 * genuinely hard to tell apart in prose, so each carries a five-segment
 * intensity meter that can be compared without reading a word.
 *
 * The params passed through to step 4 are unchanged.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';

import { CanvasScreen, Crown } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import type { ActivityLevel } from '@/lib/tdee';

interface LevelOption {
  key: ActivityLevel;
  title: string;
  tagline: string;
  description: string;
  intensity: 1 | 2 | 3 | 4 | 5;
}

const LEVELS: LevelOption[] = [
  { key: 'sedentary',         title: 'Sedentary',         tagline: 'Mostly desk, mostly still.',     description: 'Office work, little exercise, screen time.',          intensity: 1 },
  { key: 'lightly_active',    title: 'Lightly Active',    tagline: 'Walks and the odd workout.',     description: 'Light exercise 1-3 days a week, on-feet job.',        intensity: 2 },
  { key: 'moderately_active', title: 'Moderately Active', tagline: 'You train more days than not.',  description: 'Moderate workouts 3-5 days a week + active life.',    intensity: 3 },
  { key: 'very_active',       title: 'Very Active',       tagline: 'Iron is a routine, not a hobby.', description: 'Hard training 6-7 days a week, demanding work.',      intensity: 4 },
  { key: 'extremely_active',  title: 'Extremely Active',  tagline: 'Athlete or laborer. Or both.',   description: 'Physical job + daily intense training, no off days.', intensity: 5 },
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

export default function Step3Activity() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goal: string; gender: string; dob: string; heightCm: string; weightKg: string }>();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ActivityLevel | null>(null);

  return (
    <View style={styles.root}>
      <Crown
        eyebrow={`Step 3 of ${STEP_TOTAL}`}
        title="How hard do"
        accentLine="you move?"
        meta="Be honest. Overstating this gives you too many calories — and slows progress."
        right={<StepRail step={3} />}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <CanvasScreen tabBar={false} contentStyle={styles.body}>
        <View style={styles.list}>
          {LEVELS.map((l) => {
            const active = selected === l.key;
            return (
              <PressableScale
                key={l.key}
                onPress={() => setSelected(l.key)}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${l.title}. ${l.tagline} Intensity ${l.intensity} of 5.`}
                style={[styles.opt, active && styles.optOn]}
              >
                <View style={styles.optBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.optTitle}>{l.title}</Text>
                    <View style={styles.meter}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <View
                          key={n}
                          style={[
                            styles.meterBar,
                            n <= l.intensity && { height: 6 + n * 2 },
                            {
                              backgroundColor:
                                n <= l.intensity
                                  ? active
                                    ? tokens.accentText
                                    : tokens.textTertiary
                                  : tokens.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.optTag}>{l.tagline}</Text>
                  <Text style={styles.optDesc}>{l.description}</Text>
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
          onPress={() => router.push({ pathname: '/(onboarding)/step4-diet', params: { ...params, activityLevel: selected! } })}
          haptic="heavy"
          scaleTo={0.97}
          disabled={!selected}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityState={{ disabled: !selected }}
          style={[styles.cta, !selected && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>Continue</Text>
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
    titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
    optTitle: { flex: 1, fontFamily: Fonts.displayBold, fontSize: 21, letterSpacing: -0.84, color: t.text },
    optTag: { fontFamily: Fonts.bodySemi, fontSize: 12.5, color: t.textSecondary, marginTop: 3 },
    optDesc: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 17, color: t.textTertiary, marginTop: 5 },

    // A rising bar chart, not five identical dots — the shape alone ranks the
    // options before any label is read.
    meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 16 },
    meterBar: { width: 3, height: 4, borderRadius: 999 },

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
    ctaText: { fontFamily: Fonts.displayBold, fontSize: 16, letterSpacing: -0.3, color: t.bg },
  });
