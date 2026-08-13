/**
 * Onboarding Step 5 — pick your coach. Bold Canvas, and the payoff of the flow.
 *
 * The spine is the same as steps 1-4 (crown → body → one action in the same
 * place), but here the crown itself takes the visible coach's accent: swiping
 * the deck re-tints the glow, the second title line, the pager and the button,
 * so the whole screen becomes that coach before you commit to them.
 *
 * Each card is the coach's own accent (personaAccent for the active scheme) —
 * five identities, not five rows.
 *
 * Presentation only. The paywall gate, the change-program-only path, the
 * BMR/TDEE/macro computation and every route are carried over unchanged.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Lock } from 'lucide-react-native';

import { Crown, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { calculateBMR, calculateTDEE, calculateMacros, getAgeFromDOB } from '@/lib/tdee';
import type { ActivityLevel, Goal } from '@/lib/tdee';
import type { Database } from '@/types/database';
import {
  getPersona,
  personaAccent,
  quoteOfTheDay,
  styleText,
  type PersonaId,
  type PersonaTheme,
} from '@/lib/personaTheme';
import { getMaxCoaches } from '@/lib/featureGates';
import { syncAppIconToCoach } from '@/lib/appIcon';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

// ─────────────────────────────────────────────────────────────────────────────
// The 5 programs (id ↔ persona ↔ meta)
// ─────────────────────────────────────────────────────────────────────────────

interface ProgramCard {
  programId: string;                 // value persisted to profile.selected_program
  personaId: PersonaId;              // resolves to PersonaTheme for visual + voice
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  daysPerWeek: number;
  programLabel: string;              // marketing name
  focus: string;                     // headline focus tag
}

const PROGRAM_CARDS: ProgramCard[] = [
  { programId: 'cbum_evolved',         personaId: 'cbum',        difficulty: 'INTERMEDIATE', daysPerWeek: 5, programLabel: 'The Sculptor Method',   focus: 'CLASSIC PHYSIQUE' },
  { programId: 'arnold_blueprint',     personaId: 'arnold',      difficulty: 'ADVANCED',     daysPerWeek: 6, programLabel: "The Monument's Blueprint", focus: 'HYPERTROPHY' },
  { programId: 'nippard_fundamentals', personaId: 'nippard',     difficulty: 'BEGINNER',     daysPerWeek: 4, programLabel: 'Science Fundamentals',  focus: 'EVIDENCE-BASED' },
  { programId: 'ct_strength',          personaId: 'ct_fletcher', difficulty: 'ADVANCED',     daysPerWeek: 5, programLabel: 'Commander Strength',    focus: 'STRENGTH + MASS' },
  { programId: 'dr_mike_mav',          personaId: 'dr_mike',     difficulty: 'INTERMEDIATE', daysPerWeek: 5, programLabel: 'MAV Hypertrophy',        focus: 'RP METHOD' },
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

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function Step5Program() {
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string; diet: string;
    fromProfile: string;
  }>();
  const { user, fetchProfile } = useAuthStore();
  const router = useRouter();
  const { scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Resolved persona for the currently visible card — drives crown + button
  const currentCard   = PROGRAM_CARDS[pageIndex];
  const currentPersona = useMemo(() => getPersona(currentCard.personaId), [currentCard.personaId]);
  const pa = personaAccent(currentPersona, scheme);
  // The crown is a dark block in BOTH schemes, so its tint always takes the
  // persona's dark-tuned accent — the light triplet goes muddy on near-black.
  const crownTint = personaAccent(currentPersona, 'dark').accent;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setPageIndex(Math.max(0, Math.min(PROGRAM_CARDS.length - 1, idx)));
  };

  const handleComplete = async () => {
    if (!user) return;
    const maxCoaches = getMaxCoaches();
    if (pageIndex >= maxCoaches) {
      router.push(`/paywall?feature=ai_form_coach` as any);
      return;
    }
    setLoading(true);
    try {
      // Two entry paths:
      //  1) Normal onboarding — full demographic params are present, so we
      //     compute BMR/TDEE/macros and write the whole profile.
      //  2) "Change program" from Profile (?fromProfile=1, no demographic
      //     params) — ONLY switch the program. Building the full payload here
      //     would write NaN/undefined macros and corrupt the existing profile.
      const changeProgramOnly = params.fromProfile === '1' && !params.weightKg;

      let updatePayload: ProfileUpdate;
      if (changeProgramOnly) {
        updatePayload = { selected_program: currentCard.programId };
      } else {
        const weightKg = parseFloat(params.weightKg);
        const heightCm = parseFloat(params.heightCm);
        const age      = getAgeFromDOB(params.dob);
        const gender   = (params.gender === 'male' || params.gender === 'female') ? params.gender : 'male';
        const bmr      = calculateBMR(weightKg, heightCm, age, gender);
        const tdee     = calculateTDEE(bmr, params.activityLevel as ActivityLevel);
        const macros   = calculateMacros(tdee, params.goal as Goal, weightKg);

        updatePayload = {
          goal: params.goal as Goal,
          gender: gender,
          date_of_birth: params.dob,
          height_cm: heightCm,
          weight_kg: weightKg,
          activity_level: params.activityLevel as ActivityLevel,
          selected_program: currentCard.programId,
          tdee: macros.calories,
          protein_g: macros.proteinG,
          carbs_g: macros.carbsG,
          fat_g: macros.fatG,
          onboarding_complete: true,
        };
      }

      const { error } = await (supabase.from('profiles') as ReturnType<typeof supabase.from>)
        .update(updatePayload).eq('id', user.id);
      if (error) throw error;
      // The write already succeeded — refresh the local store but NEVER let a
      // stalled refresh (auth-lock / flaky network) block navigation. Wait up
      // to 6s, then proceed regardless; the store re-syncs on next focus. This
      // is what made "change active coach" spin forever.
      await Promise.race([
        fetchProfile(user.id),
        new Promise<void>((resolve) => setTimeout(resolve, 6000)),
      ]);
      // The whole app transforms with the coach — including the launcher icon
      // (fire-and-forget; cosmetic, never blocks the switch).
      syncAppIconToCoach(currentCard.personaId);
      // Change-program returns to Profile; full onboarding lands in the app.
      if (changeProgramOnly) router.back();
      else router.replace('/(tabs)');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const chooseLabel = styleText(currentPersona, `Choose ${currentPersona.shortName}`);

  return (
    <View style={styles.root}>
      <Crown
        eyebrow={`Step 5 of ${STEP_TOTAL}`}
        title="Choose your"
        accentLine="coach."
        accent={crownTint}
        right={<StepRail step={5} />}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <View style={styles.pager}>
        {PROGRAM_CARDS.map((card, i) => (
          <View
            key={card.programId}
            style={[
              styles.dot,
              i === pageIndex && [styles.dotOn, { backgroundColor: pa.accentText }],
            ]}
          />
        ))}
      </View>

      <FlatList
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={PROGRAM_CARDS}
        keyExtractor={(item) => item.programId}
        onMomentumScrollEnd={onScrollEnd}
        // Performance — only render 1 forward, 1 back at a time
        initialNumToRender={1}
        windowSize={3}
        renderItem={({ item, index }) => (
          <PersonaCard card={item} index={index} width={screenWidth} />
        )}
        style={styles.deck}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PressableScale
          onPress={handleComplete}
          haptic="heavy"
          scaleTo={0.97}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={chooseLabel}
          // The hairline is load-bearing: a persona fill can sit under 3:1
          // against the light page, and this outline gives the control an edge.
          style={[
            styles.cta,
            { backgroundColor: pa.accent, borderColor: pa.accentText },
            loading && styles.ctaBusy,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={pa.ink} />
          ) : (
            <Text style={[styles.ctaText, { color: pa.ink }]}>{chooseLabel}</Text>
          )}
        </PressableScale>
        <Text style={styles.footerHint}>You can switch coaches later from your profile.</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona Card — one full-width page in the deck
// ─────────────────────────────────────────────────────────────────────────────

function PersonaCard({ card, index, width }: { card: ProgramCard; index: number; width: number }) {
  const { scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const persona: PersonaTheme = getPersona(card.personaId);
  const pa = personaAccent(persona, scheme);
  const signatureQuote = quoteOfTheDay(persona); // stable per-day, fine here

  // Map mealsPerDay × macroSplit → readable nutrition line
  const macros = persona.nutrition.macroSplit;
  const macroLine = `${persona.nutrition.mealsPerDay} meals/day · ${macros.protein}P · ${macros.carbs}C · ${macros.fat}F`;

  const maxCoaches = getMaxCoaches();
  const isLocked = index >= maxCoaches;

  return (
    // alignSelf stretches the page to the deck's height on the cross axis; a
    // `flex: 1` here would fight the explicit page width on the main axis.
    <View style={[styles.page, { width }]}>
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.card}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero slab — the coach's own accent carries their identity */}
        <View style={[styles.slab, { backgroundColor: pa.accentSoft }]}>
          <View style={styles.slabTop}>
            <Text style={[styles.initials, { color: pa.accentText }]}>{persona.initials}</Text>
            <View style={styles.metaCol}>
              <Text style={[styles.metaPill, { color: pa.accentText }]}>{card.difficulty}</Text>
              <Text style={[styles.metaPill, { color: pa.accentText }]}>
                {card.daysPerWeek} DAYS / WK
              </Text>
            </View>
          </View>

          <Text style={[styles.vibe, { color: pa.accentText }]}>
            {styleText(persona, persona.vibe)}
          </Text>
          <Text style={styles.name}>{styleText(persona, persona.fullName)}</Text>
          <Text style={styles.era}>{persona.era}</Text>

          <Text style={styles.program}>
            {card.programLabel}  ·  {card.focus}
          </Text>
        </View>

        <View style={[styles.quoteBlock, { borderLeftColor: pa.accentText }]}>
          <Text style={styles.quote}>"{signatureQuote}"</Text>
        </View>

        <Section label="You'll train">
          <Text style={styles.lead}>{persona.training.signature}</Text>
          {persona.training.focusOn.slice(0, 3).map((f, i) => (
            <View key={i} style={styles.bulletRow}>
              <Check size={13} color={pa.accentText} strokeWidth={3} />
              <Text style={styles.bulletText}>{f}</Text>
            </View>
          ))}
        </Section>

        <Section label="Signature lifts">
          <View style={styles.chipRow}>
            {persona.training.signatureLifts.slice(0, 3).map((lift, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{lift}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section label="You'll eat">
          <Text style={styles.eatHead}>{styleText(persona, persona.nutrition.headline)}</Text>
          <Text style={styles.eatMeta}>{macroLine}</Text>
        </Section>
      </ScrollView>

      {isLocked && (
        <View style={styles.lockWrap} pointerEvents="none">
          <Lock size={26} color={pa.accentText} strokeWidth={2.2} />
          <Text style={styles.lockTier}>{maxCoaches === 1 ? 'PRO' : 'LEGEND'} ONLY</Text>
          <Text style={styles.lockHint}>Upgrade to unlock this coach</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },

    // ── Pager ──
    pager: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 16,
    },
    dot: { width: 8, height: 3, borderRadius: 999, backgroundColor: t.border },
    dotOn: { width: 24 },

    deck: { flex: 1 },

    // ── Card ──
    page: { alignSelf: 'stretch' },
    cardScroll: { flex: 1 },
    card: { paddingHorizontal: 22, paddingBottom: 26 },
    slab: { borderRadius: 28, padding: 22 },
    slabTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    initials: {
      fontFamily: Fonts.displayBold,
      fontSize: 64,
      lineHeight: 66,
      // -0.045em at 64px.
      letterSpacing: -2.88,
    },
    metaCol: { alignItems: 'flex-end', gap: 6, paddingTop: 8 },
    metaPill: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    vibe: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
      marginTop: 18,
    },
    name: {
      fontFamily: Fonts.displayBold,
      fontSize: 32,
      lineHeight: 35,
      // -0.045em at 32px.
      letterSpacing: -1.44,
      color: t.text,
      marginTop: 4,
    },
    era: { fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 18, color: t.textSecondary, marginTop: 6 },
    program: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.textTertiary,
      marginTop: 14,
    },

    quoteBlock: { borderLeftWidth: 2, paddingLeft: 14, marginTop: 26 },
    quote: { fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 21, fontStyle: 'italic', color: t.text },

    lead: { fontFamily: Fonts.displayMedium, fontSize: 15, lineHeight: 21, color: t.text, marginBottom: 10 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
    bulletText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: t.textSecondary },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: t.surfaceAlt, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
    chipText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: t.text },

    eatHead: { fontFamily: Fonts.displayBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.8, color: t.text },
    eatMeta: {
      fontFamily: Fonts.legacyMono,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: t.textTertiary,
      marginTop: 8,
    },

    // ── Locked ──
    lockWrap: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    lockTier: {
      fontFamily: Fonts.displayBold,
      fontSize: 16,
      letterSpacing: 1.2,
      color: t.crownText,
    },
    lockHint: { fontFamily: Fonts.body, fontSize: 12.5, color: t.crownTextDim },

    // ── Footer ──
    footer: { paddingHorizontal: 22, paddingTop: 10 },
    cta: {
      minHeight: 58,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    ctaBusy: { opacity: 0.5 },
    ctaText: { fontFamily: Fonts.displayBold, fontSize: 16, letterSpacing: -0.3 },
    footerHint: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: t.textTertiary,
      textAlign: 'center',
      marginTop: 12,
    },
  });
