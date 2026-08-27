/**
 * My Avatar — the identity screen, Bold Canvas.
 *
 * The crown carries the whole identity: the state title, its description, the
 * pulsing avatar orb as the hero, and the motivation line as a pull-quote. The
 * light body holds the three stats that drive it, each with its milestone bar.
 *
 * The avatar engine hands back raw hexes for its energy ladder; those are
 * remapped onto semantic tokens here so the orb reads correctly on the dark
 * crown AND the bars read correctly on the light body. Every stat, milestone,
 * conditional and the share sheet behave exactly as before.
 */
import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak } from '@/hooks/useDashboardStats';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { getAvatarState, getNextAvatarMilestones, type AvatarState, type EnergyLevel } from '@/lib/avatarEngine';
import { getLevel, type LevelInfo } from '@/lib/legendProgression';
import { BigStat, CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

/**
 * The engine's ENERGY_COLORS are fixed hexes tuned for a dark-only screen —
 * the lime and the slate both fail on a white page. The ladder is preserved as
 * a token key per level instead, so each state keeps a distinct hue and stays
 * legible on whichever surface it lands on. Warming/legend resolve to the same
 * emerald in a given scheme, which is harmless: a user is never both.
 */
const ENERGY_TONE: Record<EnergyLevel, keyof SemanticTokens> = {
  dormant: 'textTertiary',
  warming: 'success',
  active: 'warning',
  fire: 'danger',
  legend: 'accentText',
};

// ─── Animated glow orb ────────────────────────────────────────────────────────

function GlowAvatar({ emoji, tone }: { emoji: string; tone: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={styles.orbWrap} pointerEvents="none">
      {/* Outer glow ring — breathes so the identity feels alive, not printed. */}
      <Animated.View
        style={[
          styles.orbRing,
          { borderColor: tone, shadowColor: tone, transform: [{ scale: pulse }] },
        ]}
      />
      {/* Soft halo behind the disc, so the ring reads as light rather than outline. */}
      <View style={[styles.orbHalo, { backgroundColor: tone }]} />
      <View style={[styles.orbDisc, { borderColor: tone }]}>
        <Text style={styles.orbEmoji}>{emoji}</Text>
      </View>
    </View>
  );
}

// ─── Milestone bar ────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 1;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyAvatarScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { data: streak = 0 } = useWorkoutStreak();
  const persona = personaFromProgramId(profile?.selected_program);
  const { scheme, tokens } = useTheme();
  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so anything on it resolves dark.
  const crownPa = personaAccent(persona, 'dark');
  const styles = useThemedStyles(makeStyles);

  const [avatarState, setAvatarState] = useState<AvatarState | null>(null);
  const [levelInfo,   setLevelInfo]   = useState<LevelInfo | null>(null);

  // total_workouts stored in profile (or default 0)
  const totalWorkouts = (profile as any)?.total_workouts ?? 0;

  useEffect(() => {
    const stats = {
      streak: streak ?? 0,
      totalWorkouts,
      xp: levelInfo?.xp ?? 0,
      weightKg:     profile?.weight_kg ?? undefined,
      goalWeightKg: (profile as any)?.goal_weight_kg ?? undefined,
    };
    setAvatarState(getAvatarState(stats));
  }, [streak, totalWorkouts, levelInfo, profile]);

  useEffect(() => {
    getLevel(persona.id).then(setLevelInfo);
  }, [persona.id]);

  const milestones = avatarState
    ? getNextAvatarMilestones({ streak: streak ?? 0, totalWorkouts, xp: levelInfo?.xp ?? 0 })
    : null;

  const handleShare = async () => {
    if (!avatarState) return;
    try {
      await Share.share({
        message: `I'm a "${avatarState.title}" on Evulto 💪\n${streak}-day streak · ${totalWorkouts} workouts · ${levelInfo?.persona_title ?? ''}\n\nJoin me: evulto.com`,
        title: 'My Evulto Avatar',
      });
    } catch (e: any) {
      if (e.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not open the share sheet.');
      }
    }
  };

  // Derived state lands one frame after mount — hold the shape rather than the page.
  if (!avatarState) {
    return (
      <CanvasScreen tabBar={false} topInset bottomSpace={28} contentStyle={styles.body}>
        <View style={styles.loadingHero}>
          <Skeleton width={172} height={172} radius={86} />
        </View>
        <Skeleton height={30} width="70%" radius={8} style={styles.loadingLine} />
        <Skeleton height={16} width="90%" radius={8} style={styles.loadingLine} />
        {/* Radius 20, not the dated 12-14 band — these plates stand in for the
            stat blocks that follow, so they have to read as the same object. */}
        <Section label="Stats driving your avatar">
          <Skeleton height={54} radius={20} />
          <Skeleton height={54} radius={20} style={styles.loadingLine} />
          <Skeleton height={54} radius={20} style={styles.loadingLine} />
        </Section>
      </CanvasScreen>
    );
  }

  const crownTone = TOKENS.dark[ENERGY_TONE[avatarState.energyLevel]];
  const bodyTone  = tokens[ENERGY_TONE[avatarState.energyLevel]];

  return (
    <CanvasScreen tabBar={false} bottomSpace={28}>
      <Crown
        eyebrow="My avatar"
        title={avatarState.title.toUpperCase()}
        meta={avatarState.description}
        accent={crownPa.accent}
        onBack={() => router.back()}
        right={
          <View style={[styles.energyPill, { borderColor: crownTone }]}>
            <Text style={[styles.energyPillText, { color: crownTone }]} numberOfLines={1}>
              {avatarState.energyLevel.toUpperCase()} ENERGY
            </Text>
          </View>
        }
      >
        {/* The hero: the avatar itself, large and centred on the dark block. */}
        <GlowAvatar emoji={avatarState.emoji} tone={crownTone} />

        <Text style={styles.motivation}>"{avatarState.motivationLine}"</Text>
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="Stats driving your avatar">
          {/* Streak */}
          <View style={styles.statBlock}>
            <View style={styles.statHead}>
              <BigStat value={streak ?? 0} unit="days" label="Streak" size={38} style={styles.statFill} />
              <Text style={styles.statGlyph}>{avatarState.emoji}</Text>
            </View>
            {milestones && milestones.streakNeeded > 0 && (
              <>
                <ProgressBar
                  value={streak ?? 0}
                  max={milestones.nextStreakMilestone}
                  color={bodyTone}
                />
                <Text style={styles.statHint}>
                  {milestones.streakNeeded} more day{milestones.streakNeeded !== 1 ? 's' : ''} → next avatar upgrade
                </Text>
              </>
            )}
          </View>

          <Hairline />

          {/* Total workouts */}
          <View style={styles.statBlock}>
            <View style={styles.statHead}>
              <BigStat value={totalWorkouts} unit="sessions" label="Total workouts" size={38} style={styles.statFill} />
              <Text style={styles.statGlyph}>🏋️</Text>
            </View>
            {milestones && milestones.workoutsNeeded > 0 && (
              <>
                <ProgressBar
                  value={totalWorkouts}
                  max={milestones.nextWorkoutMilestone}
                  color={pa.accentText}
                />
                <Text style={styles.statHint}>
                  {milestones.workoutsNeeded} more → "{
                    totalWorkouts < 10 ? 'Building Foundation' :
                    totalWorkouts < 30 ? 'Athletic Build' : 'Elite Physique'
                  }" stage
                </Text>
              </>
            )}
          </View>

          <Hairline />

          {/* XP Level */}
          <View style={styles.statBlock}>
            <View style={styles.statHead}>
              <BigStat
                value={levelInfo?.xp ?? 0}
                unit="XP"
                label={`XP level · ${levelInfo?.level ?? 'Rookie'}`}
                size={38}
                style={styles.statFill}
              />
              <Text style={styles.statGlyph}>⚡</Text>
            </View>
            {levelInfo && levelInfo.level !== 'Legend' && (
              <>
                <ProgressBar value={levelInfo.progress * 100} max={100} color={pa.accentText} />
                <Text style={styles.statHint}>
                  {(levelInfo.nextThreshold - levelInfo.xp).toLocaleString()} XP to {
                    levelInfo.level === 'Rookie'  ? 'Grinder' :
                    levelInfo.level === 'Grinder' ? 'Athlete' :
                    levelInfo.level === 'Athlete' ? 'Elite'   : 'Legend'
                  }
                </Text>
              </>
            )}
          </View>
        </Section>

        {/* The one accent spend on the light body. */}
        <PressableScale
          onPress={handleShare}
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel="Share my progress"
          style={[styles.cta, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        >
          <Text style={[styles.ctaText, { color: pa.ink }]}>Share my progress</Text>
        </PressableScale>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Loading shell ──────────────────────────────────────────────────────────
  loadingHero: { alignItems: 'center', marginTop: 34, marginBottom: 26 },
  loadingLine: { marginTop: 12 },

  // ── Crown ──────────────────────────────────────────────────────────────────
  energyPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  energyPillText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
  },

  orbWrap: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  orbRing: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1.5,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  orbHalo: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    opacity: 0.14,
  },
  orbDisc: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbEmoji: { fontSize: 68 },

  motivation: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 24,
    letterSpacing: -0.2,
    fontStyle: 'italic',
    textAlign: 'center',
    color: t.crownText,
    marginTop: 24,
    paddingHorizontal: 6,
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statBlock: { paddingVertical: 16 },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statFill: { flex: 1 },
  statGlyph: { fontSize: 26 },
  statHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: t.textTertiary,
    marginTop: 8,
  },

  progressTrack: {
    height: 4,
    backgroundColor: t.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  // ── Action ─────────────────────────────────────────────────────────────────
  cta: {
    borderRadius: 26,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 34,
  },
  ctaText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
