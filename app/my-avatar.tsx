import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak } from '@/hooks/useDashboardStats';
import { personaFromProgramId } from '@/lib/personaTheme';
import { getAvatarState, getNextAvatarMilestones, type AvatarState } from '@/lib/avatarEngine';
import { getLevel, type LevelInfo } from '@/lib/legendProgression';

// ─── Animated glow ring ───────────────────────────────────────────────────────

function GlowAvatar({ state, accentColor }: { state: AvatarState; accentColor: string }) {
  const pulse = useRef(new Animated.Value(1)).current;

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

  const glowColor = state.color;

  return (
    <View style={styles.avatarContainer}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            borderColor: glowColor,
            shadowColor: glowColor,
            transform: [{ scale: pulse }],
          },
        ]}
      />
      {/* Inner circle */}
      <View style={[styles.avatarCircle, { borderColor: glowColor }]}>
        <Text style={styles.avatarEmoji}>{state.emoji}</Text>
      </View>
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 1;
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
        message: `I'm a "${avatarState.title}" on Atleato 💪\n${streak}-day streak · ${totalWorkouts} workouts · ${levelInfo?.persona_title ?? ''}\n\nJoin me: atleato.com`,
        title: 'My Atleato Avatar',
      });
    } catch (e: any) {
      if (e.message !== 'User did not share') {
        Alert.alert('Share failed', 'Could not open the share sheet.');
      }
    }
  };

  if (!avatarState) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MY AVATAR</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Stage banner */}
        <Text style={[styles.stageBanner, { color: persona.accent }]}>
          {avatarState.energyLevel.toUpperCase()} ENERGY
        </Text>

        {/* Animated avatar */}
        <GlowAvatar state={avatarState} accentColor={persona.accent} />

        {/* Title + description */}
        <Text style={styles.avatarTitle}>{avatarState.title.toUpperCase()}</Text>
        <Text style={styles.avatarDesc}>{avatarState.description}</Text>

        {/* Motivation line */}
        <View style={[styles.motivationCard, { borderColor: `${avatarState.color}44` }]}>
          <Text style={[styles.motivationText, { color: avatarState.color }]}>
            "{avatarState.motivationLine}"
          </Text>
        </View>

        {/* Stats driving the avatar */}
        <Text style={styles.sectionLabel}>STATS DRIVING YOUR AVATAR</Text>
        <View style={styles.card}>
          {/* Streak */}
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statName}>STREAK</Text>
              <Text style={styles.statValue}>
                {streak ?? 0}<Text style={styles.statUnit}> days</Text>
              </Text>
              {milestones && milestones.streakNeeded > 0 && (
                <>
                  <ProgressBar
                    value={streak ?? 0}
                    max={milestones.nextStreakMilestone}
                    color={avatarState.color}
                  />
                  <Text style={styles.statHint}>
                    {milestones.streakNeeded} more day{milestones.streakNeeded !== 1 ? 's' : ''} → next avatar upgrade
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.statEmoji}>{avatarState.emoji}</Text>
          </View>

          <View style={styles.rowDivider} />

          {/* Total workouts */}
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statName}>TOTAL WORKOUTS</Text>
              <Text style={styles.statValue}>
                {totalWorkouts}<Text style={styles.statUnit}> sessions</Text>
              </Text>
              {milestones && milestones.workoutsNeeded > 0 && (
                <>
                  <ProgressBar
                    value={totalWorkouts}
                    max={milestones.nextWorkoutMilestone}
                    color={persona.accent}
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
            <Text style={styles.statEmoji}>🏋️</Text>
          </View>

          <View style={styles.rowDivider} />

          {/* XP Level */}
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statName}>XP LEVEL</Text>
              <Text style={styles.statValue}>
                {levelInfo?.xp.toLocaleString() ?? '0'}<Text style={styles.statUnit}> XP · {levelInfo?.level ?? 'Rookie'}</Text>
              </Text>
              {levelInfo && levelInfo.level !== 'Legend' && (
                <>
                  <ProgressBar value={levelInfo.progress * 100} max={100} color={persona.accent} />
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
            <Text style={styles.statEmoji}>⚡</Text>
          </View>
        </View>

        {/* Share button */}
        <TouchableOpacity style={[styles.shareBtn, { borderColor: persona.accent }]} onPress={handleShare} activeOpacity={0.8}>
          <Text style={[styles.shareBtnText, { color: persona.accent }]}>SHARE MY PROGRESS</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 48, alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 32 },
  backText:    { fontSize: 22, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },

  stageBanner: {
    fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.4, marginTop: 20, marginBottom: 12,
  },

  avatarContainer: {
    width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  glowRing: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  avatarCircle: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 2,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 58 },

  avatarTitle: {
    fontFamily: Fonts.display, fontSize: 24, color: Colors.text,
    letterSpacing: -0.5, textAlign: 'center', marginBottom: 8,
  },
  avatarDesc: {
    fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 21, marginBottom: 16, paddingHorizontal: 16,
  },

  motivationCard: {
    width: '100%', backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 8, padding: 16, marginBottom: 24,
  },
  motivationText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 22, fontStyle: 'italic', textAlign: 'center' },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginBottom: 10, alignSelf: 'flex-start',
  },
  card: {
    width: '100%', backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 8, overflow: 'hidden', marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
  },
  statName: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, marginBottom: 4 },
  statValue: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginBottom: 8 },
  statUnit:  { fontSize: 11, fontFamily: Fonts.body, color: Colors.textSecondary },
  statEmoji: { fontSize: 28 },
  statHint:  { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 4, letterSpacing: 0.4 },

  progressTrack: { height: 5, backgroundColor: Colors.raised, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  progressFill:  { height: '100%', borderRadius: 3 },

  rowDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },

  shareBtn: {
    width: '100%', borderWidth: 1, borderRadius: 8,
    paddingVertical: 14, alignItems: 'center',
  },
  shareBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 0.8 },
});
