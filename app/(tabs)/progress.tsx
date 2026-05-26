import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { VolumeChart } from '@/components/progress/VolumeChart';
import { PhysiqueGallery } from '@/components/progress/PhysiqueGallery';
import { PhysiquePrivacyCard } from '@/components/progress/PhysiquePrivacyCard';
import { useWeeklyVolume, usePersonalRecords, useAchievements } from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { Colors, Fonts, Spacing } from '@/constants/theme';

function Epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

export default function Progress() {
  const router = useRouter();
  const { data: weeklyVolume = [], isLoading: volumeLoading } = useWeeklyVolume(8);
  const { data: prs = [], isLoading: prsLoading } = usePersonalRecords();
  const { data: achievements = [], isLoading: achievementsLoading } = useAchievements();

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'physique'>('stats');

  // ── Data-gating: don't generate a review when there's nothing to review ──
  // Current week's volume is the LAST entry in the weeklyVolume array (most recent week)
  const thisWeekVolume = weeklyVolume.length > 0 ? (weeklyVolume[weeklyVolume.length - 1]?.totalVolumeKg ?? 0) : 0;
  const hasAnyWorkoutThisWeek = thisWeekVolume > 0;

  // 0 = Sunday … 6 = Saturday. Reviews are most meaningful mid-week onward.
  const dayOfWeek = new Date().getDay();
  const dayLabel = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dayOfWeek];
  // Treat Mon-Tue (1-2) as "too early" for a meaningful review unless ≥2 workouts already in
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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Tab toggle + profile gear */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'stats' && styles.tabBtnActive]}
          onPress={() => setActiveTab('stats')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'stats' && styles.tabBtnTextActive]}>STATS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'physique' && styles.tabBtnActive]}
          onPress={() => setActiveTab('physique')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'physique' && styles.tabBtnTextActive]}>PHYSIQUE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => router.push('/profile' as any)}
        >
          <Text style={styles.profileBtnText}>⚙</Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'stats' ? (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.monoLabel}>WEEK {getWeekOfYear()} · {new Date().getFullYear()}</Text>
          <Text style={styles.headline}>YOUR{'\n'}GAINS.</Text>
        </View>

        {/* Volume chart */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>WEEKLY VOLUME</Text>
          {volumeLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <VolumeChart data={weeklyVolume} />
          )}
        </View>

        {/* AI Weekly Summary — gated on real data */}
        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <Text style={{ fontSize: 14 }}>✦</Text>
            <Text style={styles.aiLabel}>AI WEEKLY REVIEW</Text>
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
            style={[styles.summaryBtn, (summaryLoading || !canGenerateSummary) && { opacity: 0.4 }]}
            onPress={handleGetSummary}
            disabled={summaryLoading || !canGenerateSummary}
            activeOpacity={0.8}
          >
            {summaryLoading ? (
              <ActivityIndicator size="small" color={Colors.accentInk} />
            ) : (
              <Text style={styles.summaryBtnText}>
                {!canGenerateSummary
                  ? 'LOCKED — TRAIN MORE'
                  : summary
                    ? 'REFRESH SUMMARY'
                    : 'GENERATE SUMMARY'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Personal Records */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PERSONAL RECORDS</Text>
          {prsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
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
                  <Text style={styles.prWeight}>{pr.weightKg}kg × {pr.reps}</Text>
                  <Text style={styles.prEstimate}>~{pr.oneRepMaxKg ?? Epley1RM(pr.weightKg, pr.reps)}kg e1RM</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Achievements */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACHIEVEMENTS</Text>
          {achievementsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
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

        <View style={{ height: 24 }} />
      </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.monoLabel}>PHYSIQUE TIMELINE</Text>
            <Text style={styles.headline}>YOUR{'\n'}BODY.</Text>
          </View>
          <PhysiquePrivacyCard />
          <PhysiqueGallery />
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function getWeekOfYear() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14 },

  header: { marginBottom: 20 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 40, color: Colors.text, lineHeight: 38, letterSpacing: -1, marginTop: 6 },

  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 16, marginBottom: 12,
  },
  cardLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 14 },

  aiCard: {
    backgroundColor: 'rgba(91,140,255,0.06)', borderWidth: 1,
    borderColor: 'rgba(91,140,255,0.2)', borderRadius: 6, padding: 16, marginBottom: 12,
  },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.8 },
  summaryText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, marginBottom: 14 },
  summaryPrompt: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 },
  summaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 12, alignItems: 'center',
  },
  summaryBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accentInk, letterSpacing: 1 },

  emptyText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textTertiary, textAlign: 'center', paddingVertical: 16 },

  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  prRowFirst: { borderTopWidth: 0 },
  prName: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text },
  prDate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: 3 },
  prStats: { alignItems: 'flex-end' },
  prWeight: { fontFamily: Fonts.display, fontSize: 14, color: Colors.primary },
  prEstimate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.5, marginTop: 3 },

  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievementChip: {
    alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 4, padding: Spacing.sm, width: '30%',
    borderWidth: 1, borderColor: Colors.border,
  },
  achievementEmoji: { fontSize: 26, marginBottom: 4 },
  achievementLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.text, textAlign: 'center' },
  achievementDate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 2 },

  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  tabBtnTextActive: { color: Colors.primary },
  profileBtn: {
    marginLeft: 'auto', paddingVertical: 12, paddingHorizontal: 10,
  },
  profileBtnText: { fontSize: 18, color: Colors.textSecondary },
});
