/**
 * Post-Workout — the payoff moment right after training.
 *
 * Bold Canvas: the dark <Crown> IS the reward. It carries the score headline,
 * the session summary line and the hero volume numeral that ticks up on
 * arrival; the XP award lands there too, as a pill on the same dark block. The
 * light body below holds the detail — intensity + time-under-tension as a
 * StatRow, the PR banner, the coach breakdown, and the exercise manifest as
 * borderless rows. The single accent fill on the light page is the chat CTA.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { MessageCircle, Send, Trophy, X as XIcon, Zap } from 'lucide-react-native';
import {
  BigStat, CanvasScreen, Crown, Hairline, ListRow, Section, StatRow,
} from '@/components/ui/canvas';
import { CountUp, PressableScale } from '@/components/ui/motion';
import { ImplementationIntentionSheet } from '@/components/dashboard/ImplementationIntentionSheet';
import { RewardChestModal } from '@/components/dashboard/RewardChestModal';
import { Fonts, Spacing } from '@/constants/theme';
import { getPersona, personaAccent, type PersonaId } from '@/lib/personaTheme';
import { getTomorrowIntention } from '@/lib/implementationIntention';
import { addXP } from '@/lib/legendProgression';
import { supabase } from '@/lib/supabase';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = Spacing.heroPad;

type ExerciseResult = {
  name: string;
  sets: string;
  volume: string;
  tag: string;
  tagColor: string;
};

/** Route params arrive as strings; a junk value must not render as "NaN". */
function numOrText(raw: string): number | string {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * The crown's hero numeral. CountUp only animates on a CHANGE, so a value that
 * mounts at its final number would sit still — it renders 0 for one frame
 * first, except under reduce-motion where it mounts settled.
 */
function CrownNumber({
  value,
  color,
  size = 66,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return (
    <CountUp
      value={settled ? value : 0}
      decimals={Number.isInteger(value) ? 0 : 1}
      style={{
        fontFamily: Fonts.displayBold,
        fontVariant: ['tabular-nums'],
        fontSize: size,
        lineHeight: size * 1.02,
        letterSpacing: size * -0.045,
        color,
      }}
    />
  );
}

export default function PostWorkout() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
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

  // The body sits on the light page; the crown is dark in BOTH schemes, so it
  // takes the dark-tuned persona triplet regardless of the active scheme.
  const pa = personaAccent(persona, scheme);
  const pc = personaAccent(persona, 'dark');

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
    hue: pa.accent,
    ink: pa.ink,
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
      // A PR wears the coach's own hue; the rest read as plain status.
      const colorFor = (tag: string) =>
        tag === 'PR'        ? pa.accentText
      : tag === 'COMPLETED' ? tokens.success
      : tag === 'PARTIAL'   ? tokens.warning
      :                       tokens.textSecondary;
      return raw.map((e) => ({ ...e, tagColor: colorFor(e.tag) }));
    } catch {
      return [];
    }
  })();

  const volumeValue = numOrText(volume);

  return (
    <>
      <CanvasScreen tabBar={false} bottomSpace={36}>
        <Crown
          eyebrow={`Session complete · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          title="That was"
          accentLine={`a ${score}/10.`}
          meta={`${sessionName} — ${durationLabel} · The Sculptor Method, Week 3`}
          accent={pc.accent}
          right={
            <PressableScale
              onPress={() => router.back()}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              style={[styles.close, { borderColor: tokens.crownLine }]}
            >
              <XIcon size={19} color={tokens.crownText} />
            </PressableScale>
          }
        >
          {/* The hero: everything you moved, in one numeral. */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>
              Total volume
              <Text style={{ color: pc.accent }}>{'  ·  +12%'}</Text>
            </Text>
            <View style={styles.heroRow}>
              {typeof volumeValue === 'number' ? (
                <CrownNumber value={volumeValue} color={tokens.crownText} />
              ) : (
                <Text style={styles.heroFallback} numberOfLines={1}>{volumeValue}</Text>
              )}
              <Text style={styles.heroUnit}>k kg</Text>
            </View>
          </View>

          {/* XP Award Badge */}
          {xpBadge && (
            <View style={[styles.xpPill, { borderColor: tokens.crownLine }]}>
              <Zap size={11} color={pc.accent} fill={pc.accent} />
              <Text style={[styles.xpPillText, { color: pc.accent }]} numberOfLines={1}>{xpBadge}</Text>
            </View>
          )}
        </Crown>

        <View style={styles.body}>
          {/* Score grid */}
          <StatRow style={styles.stats}>
            <View>
              <BigStat value={numOrText(avgRpe)} unit="avg RPE" label="Intensity" />
              <Text style={styles.delta}>on tgt</Text>
            </View>
            <View>
              <BigStat value={numOrText(tut)} unit="min" label="Time under tension" />
              <Text style={styles.delta}>+3m</Text>
            </View>
          </StatRow>

          {/* PR banner (if applicable) */}
          {hasPR && (
            <PressableScale
              haptic="medium"
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Personal record, ${prExercise}, ${prNewRM} kilograms`}
              style={styles.prBanner}
              onPress={() => router.push({
                pathname: '/pr-celebration',
                params: {
                  exercise: prExercise, newRM: prNewRM, prevRM: prPrevRM,
                  weight: prWeight, reps: prReps, rpe: prRpe, coachId,
                },
              } as any)}
            >
              <View style={styles.prLeft}>
                <View style={styles.prLabelRow}>
                  <Trophy size={11} color={pa.accentText} />
                  <Text style={[styles.prLabel, { color: pa.accentText }]} numberOfLines={1}>
                    Personal record
                  </Text>
                </View>
                <Text style={styles.prExercise} numberOfLines={2}>{prExercise}</Text>
              </View>
              <View style={styles.prRight}>
                <Text style={[styles.prNum, { color: pa.accentText }]} numberOfLines={1}>
                  {prNewRM}<Text style={styles.prUnit}> kg</Text>
                </Text>
                <Text style={styles.prDelta} numberOfLines={1}>
                  +{(parseFloat(prNewRM) - parseFloat(prPrevRM)).toFixed(1)} kg ↑
                </Text>
              </View>
            </PressableScale>
          )}

          {/* Coach breakdown */}
          <Section
            label="Coach breakdown"
            right={<Text style={styles.poweredBy}>Powered by AI</Text>}
          >
            <View style={styles.coachHead}>
              <View style={[styles.coachAvatar, { backgroundColor: coach.hue, borderColor: pa.accentText }]}>
                <Text style={[styles.coachInitials, { color: coach.ink }]}>{coach.initials}</Text>
              </View>
              <Text style={styles.coachName} numberOfLines={2}>{coach.name}</Text>
            </View>
            <Text style={styles.coachBody}>{breakdown.body}</Text>

            <Hairline style={styles.coachRule} />
            <Text style={[styles.coachTag, { color: tokens.success }]}>Win of the session</Text>
            <Text style={styles.coachDetail}>{breakdown.win}</Text>

            <Hairline style={styles.coachRule} />
            <Text style={[styles.coachTag, { color: tokens.warning }]}>Fix next week</Text>
            <Text style={styles.coachDetail}>{breakdown.fix}</Text>
          </Section>

          {/* Per-exercise list */}
          <Section
            label="Exercises"
            right={<Text style={styles.count}>{`${exercises.length}`}</Text>}
          >
            <Hairline />
            {exercises.length === 0 ? (
              <Text style={styles.empty}>No exercise detail recorded</Text>
            ) : (
              exercises.map((e, i) => (
                <ListRow
                  key={i}
                  title={e.name}
                  subtitle={`${e.sets} · ${e.volume}`}
                  last={i === exercises.length - 1}
                  right={
                    <View style={[styles.tag, { borderColor: e.tagColor }]}>
                      <Text style={[styles.tagText, { color: e.tagColor }]} numberOfLines={1}>
                        {e.tag}
                      </Text>
                    </View>
                  }
                />
              ))
            )}
            <Hairline />
          </Section>

          {/* CTAs */}
          <View style={styles.ctaRow}>
            {/* PressableScale wraps its target in a content-sized Animated.View,
                so the flex that lets the primary claim the row has to live on
                this cell — on the button itself it is silently inert. */}
            <View style={styles.ctaFill}>
              <PressableScale
                haptic="heavy"
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${coach.initials}`}
                // A persona fill on a light page needs a boundary of its own; the
                // text-safe tone of the same hue is what makes the control legible.
                style={[styles.ctaPrimary, { backgroundColor: coach.hue, borderColor: pa.accentText }]}
                onPress={() => router.push('/(tabs)/coach' as any)}
              >
                <MessageCircle size={16} color={coach.ink} />
                <Text style={[styles.ctaPrimaryText, { color: coach.ink }]} numberOfLines={1}>
                  Chat with {coach.initials}
                </Text>
              </PressableScale>
            </View>
            <PressableScale
              haptic="light"
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={styles.ctaIcon}
              onPress={() => router.back()}
            >
              <Send size={18} color={tokens.text} />
            </PressableScale>
          </View>
        </View>
      </CanvasScreen>

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
    </>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown ──────────────────────────────────────────────────────────────────
  close: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  hero: { marginTop: 26 },
  heroLabel: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: t.crownTextDim,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 },
  heroFallback: {
    fontFamily: Fonts.displayBold, fontSize: 66, lineHeight: 67,
    letterSpacing: -2.97, color: t.crownText,
  },
  heroUnit: {
    fontFamily: Fonts.bodySemi, fontSize: 13, color: t.crownTextDim, paddingBottom: 10,
  },
  xpPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    marginTop: 20,
  },
  xpPillText: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.3,
    textTransform: 'uppercase',
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats: { marginTop: 30 },
  delta: {
    fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.3,
    textTransform: 'uppercase', color: t.success, marginTop: 7,
  },

  // ── PR banner ──────────────────────────────────────────────────────────────
  prBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14,
    backgroundColor: t.surfaceAlt, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 18,
    marginTop: 30,
  },
  prLeft: { flex: 1, gap: 6 },
  prLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prLabel: {
    fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.4,
    textTransform: 'uppercase', flexShrink: 1,
  },
  prExercise: {
    fontFamily: Fonts.displayBold, fontSize: 17, letterSpacing: -0.5, color: t.text,
  },
  prRight: { alignItems: 'flex-end' },
  prNum: {
    fontFamily: Fonts.displayBold, fontSize: 34, lineHeight: 35, letterSpacing: -1.53,
    fontVariant: ['tabular-nums'],
  },
  prUnit: { fontFamily: Fonts.bodySemi, fontSize: 13, color: t.textTertiary },
  prDelta: {
    fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.2,
    textTransform: 'uppercase', color: t.success, marginTop: 5,
  },

  // ── Coach breakdown ────────────────────────────────────────────────────────
  poweredBy: {
    fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.3,
    textTransform: 'uppercase', color: t.textTertiary,
  },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  coachAvatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontFamily: Fonts.displayBold, fontSize: 13, letterSpacing: -0.2 },
  coachName: {
    flex: 1, fontFamily: Fonts.displayBold, fontSize: 19, letterSpacing: -0.7, color: t.text,
  },
  coachBody: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 22, color: t.text },
  coachRule: { marginVertical: 18 },
  coachTag: {
    fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.4,
    textTransform: 'uppercase', marginBottom: 7,
  },
  coachDetail: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 22, color: t.text },

  // ── Exercise manifest ──────────────────────────────────────────────────────
  count: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.3,
    color: t.textTertiary, fontVariant: ['tabular-nums'],
  },
  empty: {
    fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.3,
    textTransform: 'uppercase', color: t.textTertiary, paddingVertical: 20,
  },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: {
    fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.3,
    textTransform: 'uppercase',
  },

  // ── CTAs ───────────────────────────────────────────────────────────────────
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 38 },
  ctaFill: { flex: 1 },
  ctaPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    borderRadius: 27, borderWidth: 1, paddingVertical: 20,
  },
  ctaPrimaryText: { fontFamily: Fonts.displayBold, fontSize: 15, letterSpacing: -0.3 },
  ctaIcon: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: t.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
});
