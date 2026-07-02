/**
 * Progress Tab — Direction C (migrated 2026-06-13)
 *
 * Last tab of Phase 1. Structure:
 *   HeroBlock — persona gradient, "Week N · YYYY", "Your gains."
 *   3-up Stat row — total volume / PR count / achievements
 *   Toggle: STATS | PHYSIQUE
 *     STATS:    VolumeChart, AI weekly review card, PR list, Achievements grid
 *     PHYSIQUE: PhysiquePrivacyCard + PhysiqueGallery
 *   AnchorCTA — "OPEN SETTINGS →" (replaces the gear glyph)
 *
 * v0 backup at progress-v0.tsx.bak.
 */
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Trophy, Award } from 'lucide-react-native';

import { VolumeChart } from '@/components/progress/VolumeChart';
import { PhysiqueGallery } from '@/components/progress/PhysiqueGallery';
import { PhysiquePrivacyCard } from '@/components/progress/PhysiquePrivacyCard';
import { useWeeklyVolume, usePersonalRecords, useAchievements } from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import { HeroBlock, Stat, AnchorCTA } from '@/components/ui/c';
import { Colors, Spacing, Radius, Typography, Fonts } from '@/constants/theme';

function Epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

function getWeekOfYear() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export default function Progress() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: weeklyVolume = [], isLoading: volumeLoading } = useWeeklyVolume(8);
  const { data: prs = [], isLoading: prsLoading } = usePersonalRecords();
  const { data: achievements = [], isLoading: achievementsLoading } = useAchievements();

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'physique'>('stats');

  const thisWeekVolume = weeklyVolume.length > 0
    ? (weeklyVolume[weeklyVolume.length - 1]?.totalVolumeKg ?? 0) : 0;
  const hasAnyWorkoutThisWeek = thisWeekVolume > 0;
  const dayOfWeek = new Date().getDay();
  const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
  const tooEarlyInWeek = dayOfWeek >= 1 && dayOfWeek <= 2 && thisWeekVolume < 1000;
  const canGenerateSummary = hasAnyWorkoutThisWeek && !tooEarlyInWeek;

  const handleGetSummary = async () => {
    if (!canGenerateSummary) return;
    setSummaryLoading(true);
    try {
      const res: WeeklySummaryResponse = await getWeeklySummary();
      setSummary(res.summary);
    } catch {
      setSummary("Couldn't load your summary right now. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // Headline volume value for the stat row
  const totalVolumeKg = weeklyVolume.reduce((n, w) => n + (w.totalVolumeKg ?? 0), 0);
  const totalDisplay = totalVolumeKg >= 1000
    ? `${(totalVolumeKg / 1000).toFixed(1)}k`
    : String(Math.round(totalVolumeKg));

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO ─────────────────────────────────────────── */}
        <HeroBlock
          accent={persona.accent}
          day={`WEEK ${getWeekOfYear()} · ${new Date().getFullYear()}`}
          name={'Your\ngains.'}
        />

        {/* ── 2. STATS ────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <Stat
            value={totalDisplay}
            label="8-wk kg"
            accent
            accentColor={persona.accent}
          />
          <Stat value={String(prs.length)} label="PRs" />
          <Stat value={String(achievements.length)} label="Badges" />
        </View>

        {/* ── 3. TOGGLE ───────────────────────────────────────── */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stats' && { borderBottomColor: persona.accent }]}
            onPress={() => setActiveTab('stats')}
          >
            <Text style={[styles.tabText, activeTab === 'stats' && { color: persona.accent }]}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'physique' && { borderBottomColor: persona.accent }]}
            onPress={() => setActiveTab('physique')}
          >
            <Text style={[styles.tabText, activeTab === 'physique' && { color: persona.accent }]}>Physique</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4a. STATS VIEW ──────────────────────────────────── */}
        {activeTab === 'stats' && (
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            {/* Volume chart */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Weekly volume</Text>
              {volumeLoading ? (
                <ActivityIndicator color={persona.accent} style={{ marginVertical: 24 }} />
              ) : (
                <VolumeChart data={weeklyVolume} />
              )}
            </View>

            {/* AI Weekly Summary */}
            <View style={[styles.aiCard, { borderColor: persona.accent + '33' }]}>
              <View style={styles.aiCardHeader}>
                <Sparkles size={16} color={persona.accent} />
                <Text style={[styles.aiLabel, { color: persona.accent }]}>AI weekly review</Text>
              </View>
              {summary ? (
                <Text style={styles.summaryText}>{summary}</Text>
              ) : !hasAnyWorkoutThisWeek ? (
                <Text style={styles.summaryPrompt}>
                  No workouts logged this week yet. Train at least once to unlock your AI review.
                </Text>
              ) : tooEarlyInWeek ? (
                <Text style={styles.summaryPrompt}>
                  It&apos;s only {dayLabel} — too early for a meaningful weekly review.
                  Come back from Wednesday onwards, or after 2+ workouts.
                </Text>
              ) : (
                <Text style={styles.summaryPrompt}>
                  Get a personalised AI analysis of your training week.
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.summaryBtn,
                  { backgroundColor: persona.accent },
                  (summaryLoading || !canGenerateSummary) && { opacity: 0.4 },
                ]}
                onPress={handleGetSummary}
                disabled={summaryLoading || !canGenerateSummary}
                activeOpacity={0.8}
              >
                {summaryLoading ? (
                  <ActivityIndicator size="small" color={persona.ink} />
                ) : (
                  <Text style={[styles.summaryBtnText, { color: persona.ink }]}>
                    {!canGenerateSummary
                      ? 'Locked — train more'
                      : summary ? 'Refresh summary' : 'Generate summary'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Personal Records */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Trophy size={16} color={persona.accent} />
                <Text style={styles.cardLabel}>Personal records</Text>
              </View>
              {prsLoading ? (
                <ActivityIndicator color={persona.accent} style={{ marginVertical: 16 }} />
              ) : prs.length === 0 ? (
                <Text style={styles.emptyText}>Complete workouts to set personal records.</Text>
              ) : (
                prs.slice(0, 10).map((pr, i) => (
                  <View key={pr.id} style={[styles.prRow, i === 0 && styles.prRowFirst]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prName}>{pr.exerciseName}</Text>
                      <Text style={styles.prDate}>
                        {new Date(pr.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.prStats}>
                      <Text style={[styles.prWeight, { color: persona.accent }]}>
                        {pr.weightKg}kg × {pr.reps}
                      </Text>
                      <Text style={styles.prEstimate}>
                        ~{pr.oneRepMaxKg ?? Epley1RM(pr.weightKg, pr.reps)}kg e1RM
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Achievements */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Award size={16} color={persona.accent} />
                <Text style={styles.cardLabel}>Achievements</Text>
              </View>
              {achievementsLoading ? (
                <ActivityIndicator color={persona.accent} style={{ marginVertical: 16 }} />
              ) : achievements.length === 0 ? (
                <Text style={styles.emptyText}>Start training to unlock achievements!</Text>
              ) : (
                <View style={styles.achievementsGrid}>
                  {achievements.map((a) => (
                    <View key={a.id} style={styles.achievementChip}>
                      <Text style={styles.achievementEmoji}>{a.emoji}</Text>
                      <Text style={styles.achievementLabel}>{a.label}</Text>
                      <Text style={styles.achievementDate}>
                        {new Date(a.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </SafeAreaView>
        )}

        {/* ── 4b. PHYSIQUE VIEW ───────────────────────────────── */}
        {activeTab === 'physique' && (
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            <PhysiquePrivacyCard />
            <PhysiqueGallery />
          </SafeAreaView>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── 5. ANCHOR CTA ───────────────────────────────────── */}
      <AnchorCTA
        label="OPEN SETTINGS →"
        accent={persona.accent}
        accentInk={persona.ink}
        onPress={() => router.push('/profile' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingTop: Spacing.md - 2,
    marginBottom: Spacing.sm + 2,
  },

  toggle: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm + 2,
  },
  tab: {
    paddingVertical: Spacing.sm + 2,
    marginRight: Spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { ...Typography.cardTitle, color: Colors.textSecondary },

  body: {
    paddingHorizontal: Spacing.md + 2,
    paddingTop: Spacing.xs,
  },

  card: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm + 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardLabel: { ...Typography.sectionTitle, fontSize: 15 },

  // AI weekly review card — same surface as card but with persona-tinted border
  aiCard: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm + 2,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  aiLabel: { ...Typography.sectionTitle, fontSize: 15 },
  summaryText: { ...Typography.cardMeta, color: Colors.text, lineHeight: 20, marginBottom: 14 },
  summaryPrompt: { ...Typography.cardMeta, lineHeight: 20, marginBottom: 14 },
  summaryBtn: {
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryBtnText: { fontFamily: Fonts.displayMedium, fontSize: 13, letterSpacing: 0.2 },

  emptyText: { ...Typography.cardMeta, textAlign: 'center', paddingVertical: 16 },

  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  prRowFirst: { borderTopWidth: 0 },
  prName: { ...Typography.cardTitle, fontSize: 13 },
  prDate: { ...Typography.cardMeta, fontSize: 11, marginTop: 3 },
  prStats: { alignItems: 'flex-end' },
  prWeight: { fontFamily: Fonts.display, fontSize: 14 },
  prEstimate: { ...Typography.cardMeta, fontSize: 11, marginTop: 3 },

  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievementChip: {
    alignItems: 'center', backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.sm, width: '30%',
  },
  achievementEmoji: { fontSize: 26, marginBottom: 4 },
  achievementLabel: { ...Typography.cardMeta, color: Colors.text, fontSize: 11, textAlign: 'center' },
  achievementDate: { ...Typography.cardMeta, fontSize: 10, marginTop: 2 },
});
