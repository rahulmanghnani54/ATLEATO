import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import {
  getLevel, getMilestones, XP_AWARDS,
  type LevelInfo, type LevelName,
} from '@/lib/legendProgression';

// ─── XP Ring (SVG circle) ────────────────────────────────────────────────────

const RING_SIZE = 180;
const STROKE = 12;
const R = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

function XPRing({
  progress, color, xp, levelTitle,
}: {
  progress: number; color: string; xp: number; levelTitle: string;
}) {
  const strokeDash = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        {/* Track */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          stroke={Colors.border}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          strokeWidth={STROKE}
          stroke={color}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringXP, { color }]}>{xp.toLocaleString()}</Text>
        <Text style={styles.ringXPLabel}>XP</Text>
        <Text style={styles.ringLevel}>{levelTitle}</Text>
      </View>
    </View>
  );
}

// ─── Level color map ──────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<LevelName, string> = {
  Rookie:  Colors.textSecondary,
  Grinder: Colors.warning,
  Athlete: Colors.info,
  Elite:   Colors.success,
  Legend:  Colors.primary,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LegendProgressScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const persona = personaFromProgramId(profile?.selected_program);
  const accentColor = persona.accent;

  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const milestones = levelInfo ? getMilestones(levelInfo.xp) : [];

  useEffect(() => {
    getLevel(persona.id).then(setLevelInfo);
  }, [persona.id]);

  const xpColor = levelInfo ? LEVEL_COLORS[levelInfo.level] : accentColor;

  // XP breakdown estimates (stored in a simple breakdown key if available, otherwise shown as guide)
  const XP_SOURCE_LABELS = [
    { label: 'WORKOUTS COMPLETED', icon: '🏋️', xpEach: XP_AWARDS.workout,          sub: `+${XP_AWARDS.workout} XP each` },
    { label: 'STREAK MILESTONES',  icon: '🔥', xpEach: XP_AWARDS.streak_milestone,  sub: `+${XP_AWARDS.streak_milestone} XP per 7 days` },
    { label: 'PERSONAL RECORDS',   icon: '🏆', xpEach: XP_AWARDS.pr,                sub: `+${XP_AWARDS.pr} XP per PR` },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LEGEND PROGRESS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Persona label */}
        <Text style={[styles.personaLabel, { color: accentColor }]}>
          {persona.shortName} PATH
        </Text>

        {/* XP Ring */}
        {levelInfo && (
          <>
            <View style={styles.ringRow}>
              <XPRing
                progress={levelInfo.progress}
                color={xpColor}
                xp={levelInfo.xp}
                levelTitle={levelInfo.level}
              />
            </View>

            {/* Persona title */}
            <Text style={[styles.personaTitle, { color: xpColor }]}>
              {levelInfo.persona_title.toUpperCase()}
            </Text>

            {/* XP to next level */}
            {levelInfo.level !== 'Legend' && (
              <View style={styles.nextLevelCard}>
                <Text style={styles.nextLevelLabel}>NEXT LEVEL</Text>
                <Text style={styles.nextLevelXP}>
                  {(levelInfo.nextThreshold - levelInfo.xp).toLocaleString()} XP to go
                </Text>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.round(levelInfo.progress * 100)}%` as any, backgroundColor: xpColor },
                    ]}
                  />
                </View>
                <Text style={styles.progressPct}>{Math.round(levelInfo.progress * 100)}%</Text>
              </View>
            )}

            {levelInfo.level === 'Legend' && (
              <View style={[styles.nextLevelCard, { borderColor: `${Colors.primary}55` }]}>
                <Text style={[styles.nextLevelLabel, { color: Colors.primary }]}>👑 MAX RANK REACHED</Text>
                <Text style={styles.nextLevelXP}>You've reached the top. True legend status.</Text>
              </View>
            )}
          </>
        )}

        {/* XP Sources */}
        <Text style={styles.sectionLabel}>HOW TO EARN XP</Text>
        <View style={styles.card}>
          {XP_SOURCE_LABELS.map((src, i) => (
            <View key={src.label} style={[styles.xpRow, i < XP_SOURCE_LABELS.length - 1 && styles.rowDivider]}>
              <Text style={styles.xpIcon}>{src.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.xpLabel}>{src.label}</Text>
                <Text style={styles.xpSub}>{src.sub}</Text>
              </View>
              <Text style={[styles.xpAmount, { color: xpColor }]}>+{src.xpEach}</Text>
            </View>
          ))}
        </View>

        {/* Milestones timeline */}
        <Text style={styles.sectionLabel}>MILESTONES</Text>
        <View style={styles.card}>
          {milestones.map((m, i) => (
            <View key={m.level} style={[styles.milestoneRow, i < milestones.length - 1 && styles.rowDivider]}>
              <View style={[
                styles.milestoneDot,
                { backgroundColor: m.reached ? LEVEL_COLORS[m.level] : Colors.raised },
                m.reached && { shadowColor: LEVEL_COLORS[m.level], shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
              ]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.milestoneName, m.reached && { color: LEVEL_COLORS[m.level] }]}>
                  {m.level.toUpperCase()}
                </Text>
                <Text style={styles.milestoneXP}>
                  {m.reached
                    ? '✓ Reached'
                    : `${m.xpNeeded.toLocaleString()} XP needed`}
                </Text>
              </View>
              <Text style={[styles.milestoneThreshold, m.reached && { color: LEVEL_COLORS[m.level] }]}>
                {m.threshold.toLocaleString()} XP
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 32 },
  backText:    { fontSize: 22, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },

  personaLabel: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 2, textAlign: 'center', marginTop: 20,
  },

  ringRow: { alignItems: 'center', marginTop: 12, marginBottom: 8 },
  ringWrap: {
    width: 180, height: 180,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  ringCenter: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
  },
  ringXP: { fontFamily: Fonts.display, fontSize: 34, letterSpacing: -1 },
  ringXPLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: -4 },
  ringLevel:   { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1.2, marginTop: 4 },

  personaTitle: {
    fontFamily: Fonts.display, fontSize: 22, textAlign: 'center',
    letterSpacing: -0.5, marginBottom: 20,
  },

  nextLevelCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16, marginBottom: 24,
  },
  nextLevelLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginBottom: 4 },
  nextLevelXP:    { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text, marginBottom: 12 },
  progressBarTrack: {
    height: 6, backgroundColor: Colors.raised, borderRadius: 3, overflow: 'hidden', marginBottom: 6,
  },
  progressBarFill: { height: '100%', borderRadius: 3 },
  progressPct: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, textAlign: 'right' },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginBottom: 10, marginTop: 4,
  },
  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, overflow: 'hidden', marginBottom: 24,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },

  xpRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  xpIcon:   { fontSize: 20 },
  xpLabel:  { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text },
  xpSub:    { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.4 },
  xpAmount: { fontFamily: Fonts.display, fontSize: 16 },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  milestoneDot: { width: 12, height: 12, borderRadius: 6 },
  milestoneName: { fontFamily: Fonts.display, fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.5 },
  milestoneXP:   { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.4 },
  milestoneThreshold: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary },
});
