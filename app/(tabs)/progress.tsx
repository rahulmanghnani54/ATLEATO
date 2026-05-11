import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/ui';
import { VolumeChart } from '@/components/progress/VolumeChart';
import { useWeeklyVolume, usePersonalRecords, useAchievements } from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { Colors, Spacing, Typography } from '@/constants/theme';

function Epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

export default function Progress() {
  const { data: weeklyVolume = [], isLoading: volumeLoading } = useWeeklyVolume(8);
  const { data: prs = [], isLoading: prsLoading } = usePersonalRecords();
  const { data: achievements = [], isLoading: achievementsLoading } = useAchievements();

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const handleGetSummary = async () => {
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Progress</Text>

        {/* Volume trend */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Volume (kg)</Text>
          {volumeLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <VolumeChart data={weeklyVolume} />
          )}
        </Card>

        {/* AI Weekly Summary */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>AI Weekly Review</Text>
          {summary ? (
            <Text style={styles.summaryText}>{summary}</Text>
          ) : (
            <Text style={styles.summaryPrompt}>Get a personalised AI analysis of your week.</Text>
          )}
          <TouchableOpacity
            style={[styles.summaryBtn, summaryLoading && styles.summaryBtnLoading]}
            onPress={handleGetSummary}
            disabled={summaryLoading}
          >
            {summaryLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.summaryBtnText}>{summary ? 'Refresh Summary' : 'Generate Summary ✨'}</Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* Personal Records */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          {prsLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : prs.length === 0 ? (
            <Text style={styles.emptyText}>Complete workouts to set personal records.</Text>
          ) : (
            prs.slice(0, 10).map((pr) => (
              <View key={pr.id} style={styles.prRow}>
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
        </Card>

        {/* Achievements */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          {achievementsLoading ? (
            <ActivityIndicator color={Colors.primary} />
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
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  title: { ...Typography.h1 },
  section: { padding: Spacing.md },
  sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
  emptyText: { ...Typography.caption, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing.md },
  summaryText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },
  summaryPrompt: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.md },
  summaryBtn: {
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  summaryBtnLoading: { opacity: 0.7 },
  summaryBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  prName: { ...Typography.bodyMedium },
  prDate: { ...Typography.caption, color: Colors.textTertiary, marginTop: 2 },
  prStats: { alignItems: 'flex-end' },
  prWeight: { ...Typography.bodyMedium, color: Colors.primary },
  prEstimate: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievementChip: {
    alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 8, padding: Spacing.sm, width: '30%',
    borderWidth: 1, borderColor: Colors.border,
  },
  achievementEmoji: { fontSize: 28, marginBottom: 4 },
  achievementLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center' },
  achievementDate: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, marginTop: 2 },
});
