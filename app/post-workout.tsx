import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';
import { X as XIcon, Zap, Trophy, MessageCircle, Send } from 'lucide-react-native';
import { ImplementationIntentionSheet } from '@/components/dashboard/ImplementationIntentionSheet';
import { RewardChestModal } from '@/components/dashboard/RewardChestModal';
import { getPersona, type PersonaId } from '@/lib/personaTheme';
import { getTomorrowIntention } from '@/lib/implementationIntention';
import { format } from 'date-fns';
import { addXP } from '@/lib/legendProgression';
import { supabase } from '@/lib/supabase';

type ExerciseResult = {
  name: string;
  sets: string;
  volume: string;
  tag: string;
  tagColor: string;
};

export default function PostWorkout() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionName?: string;
    score?: string;
    durationMin?: string;
    volume?: string;
    avgRpe?: string;
    tut?: string;
    coachId?: string;
    newPR?: string;
    prExercise?: string;
    prNewRM?: string;
    prPrevRM?: string;
    prWeight?: string;
    prReps?: string;
    prRpe?: string;
    exercisesJson?: string;
  }>();

  const sessionName  = params.sessionName  ?? 'Push · Day 2';
  const score        = parseInt(params.score        ?? '9');
  const durationMin  = parseInt(params.durationMin  ?? '72');
  const volume       = params.volume       ?? '8.4';
  const avgRpe       = params.avgRpe       ?? '8.2';
  const tut          = params.tut          ?? '24';
  const coachId      = params.coachId      ?? 'cbum';
  const hasPR        = params.newPR === 'true';

  // Habit-chain: right after the user finishes a workout, prompt them to
  // pre-commit to tomorrow's session. Only if no commitment exists yet.
  // Delay 1.5s so they see the post-workout summary first.
  const persona      = getPersona(coachId as PersonaId);
  const [intentionSheetOpen, setIntentionSheetOpen] = useState(false);
  const [chestOpen, setChestOpen] = useState(false);
  const [xpBadge, setXpBadge] = useState<string | null>(null);
  const tomorrowISO  = format(new Date(Date.now() + 86_400_000), 'yyyy-MM-dd');

  // Post-workout choreography:
  // 1.2s after mount → open Reward Chest (variable-reward Skinner box)
  // After chest closes → if no tomorrow-intention exists, open commit sheet
  // Also award +50 XP for completing a workout.
  useEffect(() => {
    let cancelled = false;
    // Award XP immediately on mount
    addXP('workout', coachId as PersonaId).then((info) => {
      if (!cancelled) {
        setXpBadge(`+50 XP · ${info.persona_title}`);
        setTimeout(() => { if (!cancelled) setXpBadge(null); }, 3500);
      }
    });

    // V2 §5 ADD #1 — contribute this workout's volume to the user's squad.
    // volume comes in as a string like "8.4" representing thousands of kg
    // (legacy units from the session screen). Convert to integer kg and submit.
    // Best-effort: failures are silent — squad RPC handles unauthenticated +
    // not-in-a-squad cases with a no-op return.
    try {
      const vKg = Math.round(parseFloat(volume) * 1000);
      if (vKg > 0 && vKg < 50000) {
        (supabase.rpc as any)('submit_squad_volume', { p_volume_kg: vKg })
          .then(({ error }: any) => { if (error && __DEV__) console.warn('submit_squad_volume:', error.message); });
      }
    } catch (e) { /* never block post-workout UX */ }

    const id = setTimeout(() => {
      if (!cancelled) setChestOpen(true);
    }, 1200);
    return () => { cancelled = true; clearTimeout(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChestClose = async () => {
    setChestOpen(false);
    const existing = await getTomorrowIntention();
    if (!existing) setIntentionSheetOpen(true);
  };
  const prExercise   = params.prExercise   ?? 'Incline DB Press';
  const prNewRM      = params.prNewRM      ?? '42.8';
  const prPrevRM     = params.prPrevRM     ?? '40.1';
  const prWeight     = params.prWeight     ?? '32.5';
  const prReps       = params.prReps       ?? '8';
  const prRpe        = params.prRpe        ?? '9';

  const durationLabel = durationMin >= 60
    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
    : `${durationMin}m`;

  // Coach card metadata derives from the persona theme so accent + initials
  // always match the user's current coach (no hard-coded hues to drift).
  const coach = {
    initials: persona.initials,
    hue: persona.accent,
    ink: persona.ink,
    name: `${persona.shortName}'s breakdown`,
  };

  const coachBreakdowns: Record<string, { body: string; win: string; fix: string }> = {
    cbum: {
      body: `Strong session. ${hasPR ? `Incline DB hit a fresh estimated 1RM and you held form on every set. ` : ''}Volume was up and intensity right on target.`,
      win: hasPR ? `New 1RM on ${prExercise}: ${prNewRM} kg (+${(parseFloat(prNewRM) - parseFloat(prPrevRM)).toFixed(1)}).` : 'Consistent output across all exercises.',
      fix: 'Slow your lateral raise eccentric — 3 sec down, squeeze the cap for 1.',
    },
    nippard: {
      body: `Volume is tracking +12% week-over-week. RPE avg of ${avgRpe} is within the 7.5–8.5 productive range. TUT at ${tut} min is solid.`,
      win: hasPR ? `Est. 1RM on ${prExercise} increased — Epley formula confirms ${prNewRM} kg.` : 'MEV maintained, stimulus-to-fatigue ratio positive.',
      fix: 'Consider adding one set to Lateral Raise to hit MAV next session.',
    },
    arnold: {
      body: 'The pump was there. I can feel it from here. You worked the muscle, not just the weight.',
      win: hasPR ? `A new personal record! The muscle is growing — ${prNewRM} kg is yours now.` : 'Perfect pump. The muscle speaks.',
      fix: 'More focus on the squeeze at the peak contraction.',
    },
    ct_fletcher: {
      body: `I DON'T ACCEPT AVERAGE. ${score}/10 MEANS NOTHING TO ME. YOU SHOULD HAVE LEFT EVERYTHING IN THAT GYM.`,
      win: hasPR ? `YOU HIT A PR. ${prNewRM} KG. I COMMANDED YOU TO GROW — YOU OBEYED.` : 'YOU SHOWED UP. THAT IS ALL.',
      fix: 'NEXT SESSION — MORE WEIGHT, MORE REPS, LESS COMPLAINING.',
    },
    dr_mike: {
      body: `Week volume is at ~75% MAV for chest. RPE avg of ${avgRpe} indicates we're in the productive stimulus zone. TUT of ${tut} min is above minimum.`,
      win: hasPR ? `Progressive overload confirmed on ${prExercise}. Epley 1RM: ${prNewRM} kg.` : 'Stimulus-to-fatigue ratio positive across all exercises.',
      fix: 'Deload cue: if fatigue accumulates over 2 more sessions, consider a back-off week.',
    },
  };
  const breakdown = coachBreakdowns[coachId] ?? coachBreakdowns.cbum;

  // Real exercises from the session, or sensible empty fallback
  const exercises: ExerciseResult[] = (() => {
    if (!params.exercisesJson) return [];
    try {
      const raw = JSON.parse(params.exercisesJson) as Array<{ name: string; sets: string; volume: string; tag: string }>;
      const colorFor = (tag: string) =>
        tag === 'PR'        ? Colors.primary
      : tag === 'COMPLETED' ? Colors.good
      : tag === 'PARTIAL'   ? Colors.warning
      :                       Colors.textSecondary;
      return raw.map((e) => ({ ...e, tagColor: colorFor(e.tag) }));
    } catch {
      return [];
    }
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={[styles.tag, { backgroundColor: persona.accent + '1a' }]}>
            <Text style={[styles.tagText, { color: persona.accent }]}>
              Session complete · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <XIcon size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* XP Award Badge */}
        {xpBadge && (
          <View style={[styles.xpBadge, { backgroundColor: persona.accent + '1a', borderColor: persona.accent + '44' }]}>
            <Zap size={14} color={persona.accent} fill={persona.accent} />
            <Text style={[styles.xpBadgeText, { color: persona.accent }]}>{xpBadge}</Text>
          </View>
        )}

        {/* Score headline */}
        <Text style={styles.headline}>
          That was{'\n'}a{' '}
          <Text style={{ color: persona.accent }}>{score}/10</Text>.
        </Text>
        <Text style={styles.subline}>
          {sessionName} — {durationLabel} · The Sculptor Method, Week 3
        </Text>

        {/* Score grid */}
        <View style={styles.scoreGrid}>
          {[
            { l: 'Volume',             v: volume,  u: 'k kg',     d: '+12%', good: true },
            { l: 'Intensity',          v: avgRpe,  u: 'avg RPE',  d: 'on tgt', good: true },
            { l: 'Time under\ntension', v: tut,    u: 'min',      d: '+3m', good: true },
          ].map((s, i) => (
            <View key={i} style={styles.scoreCard}>
              <Text style={styles.scoreCardLabel}>{s.l}</Text>
              <Text style={styles.scoreCardValue}>
                {s.v}<Text style={styles.scoreCardUnit}> {s.u}</Text>
              </Text>
              <Text style={[styles.scoreCardDelta, { color: s.good ? Colors.good : Colors.warning }]}>{s.d}</Text>
            </View>
          ))}
        </View>

        {/* PR banner (if applicable) */}
        {hasPR && (
          <TouchableOpacity
            style={[styles.prBanner, { backgroundColor: persona.accent + '0d', borderColor: persona.accent + '33' }]}
            onPress={() => router.push({
              pathname: '/pr-celebration',
              params: {
                exercise: prExercise, newRM: prNewRM, prevRM: prPrevRM,
                weight: prWeight, reps: prReps, rpe: prRpe, coachId,
              },
            } as any)}
            activeOpacity={0.85}
          >
            <View style={styles.prBannerLeft}>
              <View style={styles.prBannerLabelRow}>
                <Trophy size={14} color={persona.accent} />
                <Text style={[styles.prBannerLabel, { color: persona.accent }]}>Personal record</Text>
              </View>
              <Text style={styles.prBannerExercise}>{prExercise}</Text>
            </View>
            <View style={styles.prBannerRight}>
              <Text style={[styles.prBannerNum, { color: persona.accent }]}>
                {prNewRM}<Text style={styles.prBannerUnit}> kg</Text>
              </Text>
              <Text style={styles.prBannerDelta}>
                +{(parseFloat(prNewRM) - parseFloat(prPrevRM)).toFixed(1)} kg ↑
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Coach breakdown */}
        <View style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <View style={[styles.coachAvatar, { backgroundColor: coach.hue }]}>
              <Text style={[styles.coachInitials, { color: coach.ink }]}>{coach.initials}</Text>
            </View>
            <View>
              <Text style={styles.coachTitle}>{coach.name}</Text>
              <Text style={styles.coachSubtitle}>Powered by AI</Text>
            </View>
          </View>
          <Text style={styles.coachBody}>{breakdown.body}</Text>
          <View style={styles.coachDivider} />
          <Text style={[styles.coachTagLabel, { color: persona.accent }]}>Win of the session</Text>
          <Text style={styles.coachDetail}>{breakdown.win}</Text>
          <View style={styles.coachDivider} />
          <Text style={[styles.coachTagLabel, { color: Colors.warning }]}>Fix next week</Text>
          <Text style={styles.coachDetail}>{breakdown.fix}</Text>
        </View>

        {/* Per-exercise list */}
        <Text style={styles.sectionLabel}>Exercises</Text>
        <View style={styles.exerciseCard}>
          {exercises.map((e, i) => (
            <View key={i} style={[styles.exerciseRow, i < exercises.length - 1 && styles.exerciseRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{e.name}</Text>
                <Text style={styles.exerciseMeta}>{e.sets} · {e.volume}</Text>
              </View>
              <View style={[styles.exerciseTag, { borderColor: `${e.tagColor}33`, backgroundColor: `${e.tagColor}14` }]}>
                <Text style={[styles.exerciseTagText, { color: e.tagColor }]}>{e.tag}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { backgroundColor: persona.accent }]}
            onPress={() => router.push('/(tabs)/coach' as any)}
            activeOpacity={0.85}
          >
            <MessageCircle size={16} color={persona.ink} />
            <Text style={[styles.ctaPrimaryText, { color: persona.ink }]}>Chat with {coach.initials}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaIcon} onPress={() => router.back()} activeOpacity={0.85}>
            <Send size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Variable-reward chest (always opens after summary) */}
      <RewardChestModal
        visible={chestOpen}
        persona={persona}
        onClose={handleChestClose}
      />

      {/* Auto-triggered pre-commit sheet (habit chain) — opens after chest */}
      <ImplementationIntentionSheet
        visible={intentionSheetOpen}
        onClose={() => setIntentionSheetOpen(false)}
        dateISO={tomorrowISO}
        persona={persona}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14, paddingBottom: 48 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tag: {
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6,
  },
  tagText: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.1 },

  headline: {
    fontFamily: Fonts.display, fontSize: 38, color: Colors.text,
    lineHeight: 40, letterSpacing: -1, marginBottom: 10,
  },
  subline: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },

  // Score grid
  scoreGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scoreCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12,
  },
  scoreCardLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, lineHeight: 14, minHeight: 28 },
  scoreCardValue: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginTop: 4 },
  scoreCardUnit: { fontSize: 10, color: Colors.textSecondary, fontFamily: Fonts.body },
  scoreCardDelta: { fontFamily: Fonts.bodyMedium, fontSize: 11, marginTop: 4 },

  // PR banner
  prBanner: {
    borderWidth: 1,
    borderRadius: 12, padding: 16, marginBottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  prBannerLeft: {},
  prBannerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prBannerLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2 },
  prBannerExercise: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text, marginTop: 4 },
  prBannerRight: { alignItems: 'flex-end' },
  prBannerNum: { fontFamily: Fonts.display, fontSize: 28 },
  prBannerUnit: { fontSize: 14, fontFamily: Fonts.body, color: Colors.textSecondary },
  prBannerDelta: { fontFamily: Fonts.display, fontSize: 14, color: Colors.good, marginTop: 2 },

  // Coach card
  coachCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  coachAvatar: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  coachInitials: { fontFamily: Fonts.display, fontSize: 12 },
  coachTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text },
  coachSubtitle: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, marginTop: 2 },
  coachBody: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20 },
  coachDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  coachTagLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, letterSpacing: 0.2, marginBottom: 4 },
  coachDetail: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20 },

  sectionLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.2, marginBottom: 8 },

  // Exercise list
  exerciseCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginBottom: 20,
  },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
  },
  exerciseRowBorder: { borderBottomWidth: 1, borderColor: Colors.border },
  exerciseName: { fontFamily: Fonts.bodySemi, fontSize: 13, color: Colors.text },
  exerciseMeta: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.1 },
  exerciseTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100,
    backgroundColor: 'transparent', borderWidth: 1,
  },
  exerciseTagText: { fontFamily: Fonts.bodyBold, fontSize: 10, letterSpacing: 0.1 },

  // XP badge
  xpBadge: {
    borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'center', marginBottom: 12,
  },
  xpBadgeText: { fontFamily: Fonts.displayMedium, fontSize: 13, letterSpacing: 0.2 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: 8 },
  ctaPrimary: {
    flex: 1, height: 54, borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaPrimaryText: { fontFamily: Fonts.displayMedium, fontSize: 14, letterSpacing: 0.2 },
  ctaIcon: {
    width: 56, height: 54, borderRadius: 100, borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
});
