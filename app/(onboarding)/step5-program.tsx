/**
 * Onboarding Step 5 — Pick Your Coach
 *
 * Full-bleed swipeable persona deck. Each card takes the entire screen
 * in the coach's accent color, with their portrait initials, era, signature
 * quote, training philosophy, sample lifts, and nutrition approach.
 *
 * Swipe horizontally to compare. Tap "CHOOSE [COACH]" at the bottom to lock
 * in that coach — the button text and color match the visible card.
 *
 * Replaces the previous list-of-tiny-tiles design. Picking a coach should
 * feel like meeting them, not selecting a row.
 */
import { useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Alert,
  useWindowDimensions, ActivityIndicator,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Colors, Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { calculateBMR, calculateTDEE, calculateMacros, getAgeFromDOB } from '@/lib/tdee';
import type { ActivityLevel, Goal } from '@/lib/tdee';
import type { Database } from '@/types/database';
import { getPersona, quoteOfTheDay, styleText, type PersonaId, type PersonaTheme } from '@/lib/personaTheme';
import { getMaxCoaches } from '@/lib/featureGates';

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
  { programId: 'cbum_evolved',         personaId: 'cbum',        difficulty: 'INTERMEDIATE', daysPerWeek: 5, programLabel: 'CBum Evolved',          focus: 'CLASSIC PHYSIQUE' },
  { programId: 'arnold_blueprint',     personaId: 'arnold',      difficulty: 'ADVANCED',     daysPerWeek: 6, programLabel: "Arnold's Blueprint",     focus: 'HYPERTROPHY' },
  { programId: 'nippard_fundamentals', personaId: 'nippard',     difficulty: 'BEGINNER',     daysPerWeek: 4, programLabel: 'Science Fundamentals',  focus: 'EVIDENCE-BASED' },
  { programId: 'ct_strength',          personaId: 'ct_fletcher', difficulty: 'ADVANCED',     daysPerWeek: 5, programLabel: 'ISYMFS Strength',       focus: 'STRENGTH + MASS' },
  { programId: 'dr_mike_mav',          personaId: 'dr_mike',     difficulty: 'INTERMEDIATE', daysPerWeek: 5, programLabel: 'MAV Hypertrophy',        focus: 'RP METHOD' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Step5Program() {
  const params = useLocalSearchParams<{
    goal: string; gender: string; dob: string;
    heightCm: string; weightKg: string; activityLevel: string; diet: string;
  }>();
  const { user, fetchProfile } = useAuthStore();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<ProgramCard>>(null);

  // Resolved persona for the currently visible card — drives the bottom button
  const currentCard   = PROGRAM_CARDS[pageIndex];
  const currentPersona = useMemo(() => getPersona(currentCard.personaId), [currentCard.personaId]);

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
      const weightKg = parseFloat(params.weightKg);
      const heightCm = parseFloat(params.heightCm);
      const age      = getAgeFromDOB(params.dob);
      const gender   = (params.gender === 'male' || params.gender === 'female') ? params.gender : 'male';
      const bmr      = calculateBMR(weightKg, heightCm, age, gender);
      const tdee     = calculateTDEE(bmr, params.activityLevel as ActivityLevel);
      const macros   = calculateMacros(tdee, params.goal as Goal, weightKg);

      const updatePayload: ProfileUpdate = {
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
      {/* Progress + headline (compact, no scroll) */}
      <View style={styles.topBar}>
        <OnboardingProgress current={5} total={5} />
        <Text style={styles.monoLabel}>STEP 5 OF 5</Text>
        <Text style={styles.headline}>PICK YOUR COACH.</Text>
        <Text style={styles.sub}>Swipe to compare. Choose the master you'll train under.</Text>
      </View>

      {/* Dot pager indicator */}
      <View style={styles.dotsRow}>
        {PROGRAM_CARDS.map((card, i) => (
          <View
            key={card.programId}
            style={[
              styles.dot,
              i === pageIndex && { backgroundColor: currentPersona.accent, width: 22 },
            ]}
          />
        ))}
      </View>

      {/* Swipeable deck */}
      <FlatList
        ref={listRef}
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
        style={{ flex: 1 }}
      />

      {/* Choose button — text + color reflect the visible card */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.chooseBtn,
            { backgroundColor: currentPersona.accent },
            loading && { opacity: 0.5 },
          ]}
          onPress={handleComplete}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator size="small" color={currentPersona.ink} />
          ) : (
            <Text style={[styles.chooseBtnText, { color: currentPersona.ink }]}>
              {styleText(currentPersona, `Choose ${currentPersona.shortName}  →`)}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          You can switch coaches later from your profile.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona Card — one full-width page in the deck
// ─────────────────────────────────────────────────────────────────────────────

function PersonaCard({ card, index, width }: { card: ProgramCard; index: number; width: number }) {
  const persona: PersonaTheme = getPersona(card.personaId);
  const signatureQuote = quoteOfTheDay(persona); // stable per-day, fine here

  // Map mealsPerDay × macroSplit → readable nutrition line
  const macros = persona.nutrition.macroSplit;
  const macroLine = `${persona.nutrition.mealsPerDay}m/day · ${macros.protein}P/${macros.carbs}C/${macros.fat}F`;

  const maxCoaches = getMaxCoaches();
  const isLocked = index >= maxCoaches;

  return (
    <View style={[styles.card, { width, backgroundColor: persona.accent }]}>
      {isLocked && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 20 }}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
          <Text style={{ fontFamily: 'ArchivoBlack_400Regular', fontSize: 14, color: '#fff', marginTop: 8, letterSpacing: 1 }}>
            {maxCoaches === 1 ? 'PRO' : 'LEGEND'} ONLY
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            Upgrade to unlock this coach
          </Text>
        </View>
      )}
      {/* Hero block — avatar + name + era */}
      <View style={styles.cardHero}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { borderColor: persona.ink }]}>
            <Text style={[styles.avatarInitials, { color: persona.ink }]}>{persona.initials}</Text>
          </View>
          <View style={styles.tagsCol}>
            <View style={[styles.metaPill, { borderColor: persona.ink }]}>
              <Text style={[styles.metaPillText, { color: persona.ink }]}>{card.difficulty}</Text>
            </View>
            <View style={[styles.metaPill, { borderColor: persona.ink, marginTop: 6 }]}>
              <Text style={[styles.metaPillText, { color: persona.ink }]}>{card.daysPerWeek} DAYS/WK</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.cardVibe, { color: persona.ink, opacity: 0.6 }]}>
          {styleText(persona, persona.vibe)}
        </Text>
        <Text style={[styles.cardName, { color: persona.ink }]}>
          {styleText(persona, persona.fullName)}
        </Text>
        <Text style={[styles.cardEra, { color: persona.ink, opacity: 0.75 }]}>
          {persona.era}
        </Text>
      </View>

      {/* Quote in the coach's voice */}
      <View style={[styles.quoteBlock, { borderColor: persona.ink }]}>
        <Text style={[styles.quoteText, { color: persona.ink }]}>
          "{signatureQuote}"
        </Text>
      </View>

      {/* YOU'LL TRAIN block */}
      <View style={styles.philosophyBlock}>
        <Text style={[styles.blockLabel, { color: persona.ink, opacity: 0.65 }]}>
          {styleText(persona, "YOU'LL TRAIN")}
        </Text>
        <Text style={[styles.philosophySig, { color: persona.ink }]}>
          {persona.training.signature}
        </Text>
        {persona.training.focusOn.slice(0, 3).map((f, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={[styles.bullet, { color: persona.ink, opacity: 0.85 }]}>✓</Text>
            <Text style={[styles.bulletText, { color: persona.ink }]}>{f}</Text>
          </View>
        ))}
      </View>

      {/* SIGNATURE LIFTS row */}
      <View style={styles.signatureBlock}>
        <Text style={[styles.blockLabel, { color: persona.ink, opacity: 0.65 }]}>
          {styleText(persona, 'SIGNATURE LIFTS')}
        </Text>
        <View style={styles.liftChipsRow}>
          {persona.training.signatureLifts.slice(0, 3).map((lift, i) => (
            <View key={i} style={[styles.liftChip, { borderColor: persona.ink }]}>
              <Text style={[styles.liftChipText, { color: persona.ink }]}>{lift}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* YOU'LL EAT block */}
      <View style={styles.nutritionBlock}>
        <Text style={[styles.blockLabel, { color: persona.ink, opacity: 0.65 }]}>
          {styleText(persona, "YOU'LL EAT")}
        </Text>
        <Text style={[styles.nutritionLine, { color: persona.ink }]}>
          {styleText(persona, persona.nutrition.headline)}
        </Text>
        <Text style={[styles.nutritionMeta, { color: persona.ink, opacity: 0.7 }]}>
          {macroLine}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Top bar — progress, headline, subhead
  topBar: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  monoLabel: {
    fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary,
    letterSpacing: 1.4, marginTop: 10,
  },
  headline: {
    fontFamily: Fonts.display, fontSize: 28, color: Colors.text,
    lineHeight: 30, letterSpacing: -0.8, marginTop: 4,
  },
  sub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  // Dot pager
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, paddingVertical: 10,
  },
  dot: {
    width: 8, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  // ── Persona card ──
  card: {
    paddingHorizontal: 24, paddingVertical: 22,
    justifyContent: 'flex-start',
  },

  cardHero: { marginBottom: 18 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  avatar: {
    width: 76, height: 76, borderRadius: 10, borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: -0.6 },
  tagsCol: { alignItems: 'flex-end' },
  metaPill: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  metaPillText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3 },

  cardVibe: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 2.4, marginTop: 18 },
  cardName: { fontFamily: Fonts.display, fontSize: 26, letterSpacing: -0.6, marginTop: 4 },
  cardEra: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, marginTop: 4 },

  // Quote
  quoteBlock: {
    borderLeftWidth: 2,
    paddingLeft: 12, paddingVertical: 6,
    marginBottom: 18,
  },
  quoteText: {
    fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, fontStyle: 'italic',
  },

  // Philosophy + Lifts + Nutrition blocks
  philosophyBlock: { marginBottom: 14 },
  signatureBlock:  { marginBottom: 14 },
  nutritionBlock:  { marginBottom: 6 },
  blockLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 4 },
  philosophySig: { fontFamily: Fonts.body, fontSize: 13, marginBottom: 8, lineHeight: 18 },

  bulletRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, alignItems: 'flex-start' },
  bullet: { fontFamily: Fonts.mono, fontSize: 13 },
  bulletText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },

  liftChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  liftChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  liftChipText: { fontFamily: Fonts.bodySemi, fontSize: 11 },

  nutritionLine: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  nutritionMeta: { fontFamily: Fonts.mono, fontSize: 10, marginTop: 4, letterSpacing: 0.6 },

  // Footer
  footer: { padding: 20, paddingTop: 12, paddingBottom: 24 },
  chooseBtn: {
    borderRadius: 6, paddingVertical: 16, alignItems: 'center',
  },
  chooseBtnText: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: 0.4 },
  footerHint: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 10, letterSpacing: 0.6, fontStyle: 'italic',
  },
});
