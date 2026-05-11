import { View, Text, ScrollView, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card, Tag, Button } from '@/components/ui';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

export default function Workouts() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;

  // Get today's workout (cycle through schedule by day of week)
  const dayIndex = new Date().getDay(); // 0=Sun ... 6=Sat
  const workoutIndex = ((dayIndex === 0 ? 6 : dayIndex - 1)) % program.schedule.length;
  const todayWorkout = program.schedule[workoutIndex];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Workouts</Text>

        {/* Active program */}
        <Card style={[styles.activeCard, { borderLeftColor: program.color, borderLeftWidth: 4 }] as ViewStyle}>
          <View style={styles.programHeader}>
            <Text style={styles.programEmoji}>{program.emoji}</Text>
            <View style={styles.programInfo}>
              <Text style={styles.programName}>{program.name}</Text>
              <Text style={styles.programExpert}>{program.expert}</Text>
            </View>
            <View style={styles.programStats}>
              <Text style={styles.stat}>{program.daysPerWeek}d/wk</Text>
              <Tag label={program.difficulty} color={Colors.primary} bgColor={Colors.primaryLight} />
            </View>
          </View>
        </Card>

        {/* Today's workout */}
        <Text style={styles.sectionTitle}>Today — {todayWorkout.name}</Text>
        <Card style={styles.todayCard}>
          <View style={styles.workoutMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{todayWorkout.muscleGroups.join(', ')}</Text>
              <Text style={styles.metaLabel}>Muscles</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{todayWorkout.exercises.length}</Text>
              <Text style={styles.metaLabel}>Exercises</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>~{todayWorkout.estimatedMinutes}m</Text>
              <Text style={styles.metaLabel}>Est. Time</Text>
            </View>
          </View>

          {/* Exercise preview */}
          {todayWorkout.exercises.slice(0, 4).map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseSets}>{ex.sets} × {ex.reps}</Text>
            </View>
          ))}
          {todayWorkout.exercises.length > 4 && (
            <Text style={styles.moreExercises}>+{todayWorkout.exercises.length - 4} more exercises</Text>
          )}

          <Button
            label="Start Workout 💪"
            onPress={() => router.push({
              pathname: '/workout-session',
              params: { programId, dayIndex: workoutIndex },
            } as any)}
            fullWidth
            style={styles.startBtn}
          />
        </Card>

        {/* Browse programs */}
        <Text style={styles.sectionTitle}>All Programs</Text>
        {Object.values(EXPERT_PROGRAMS).map((prog) => (
          <Card key={prog.id} style={[styles.programCard, prog.id === programId && styles.programCardActive] as ViewStyle} onPress={() => {}}>
            <View style={styles.programRow}>
              <View style={[styles.programBadge, { backgroundColor: prog.color }]}>
                <Text style={styles.programBadgeEmoji}>{prog.emoji}</Text>
              </View>
              <View style={styles.programCardBody}>
                <Text style={styles.programCardName}>{prog.name}</Text>
                <Text style={styles.programCardExpert}>{prog.expert}</Text>
                <View style={styles.programTags}>
                  <Tag label={prog.difficulty} color="#6b7280" bgColor="#f3f4f6" />
                  <Tag label={`${prog.daysPerWeek}d/wk`} color="#6b7280" bgColor="#f3f4f6" />
                </View>
              </View>
              {prog.id === programId && <Text style={styles.activeBadge}>Active</Text>}
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  title: { ...Typography.h1 },
  activeCard: { padding: Spacing.md },
  programHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  programEmoji: { fontSize: 32 },
  programInfo: { flex: 1 },
  programName: { ...Typography.bodyMedium },
  programExpert: { ...Typography.caption, color: Colors.primary },
  programStats: { alignItems: 'flex-end', gap: 4 },
  stat: { ...Typography.caption, color: Colors.textSecondary },
  sectionTitle: { ...Typography.h3 },
  todayCard: { padding: Spacing.md },
  workoutMeta: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  metaItem: { alignItems: 'center' },
  metaValue: { ...Typography.bodyMedium, color: Colors.primary },
  metaLabel: { ...Typography.caption },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exerciseName: { ...Typography.body, flex: 1 },
  exerciseSets: { ...Typography.caption, color: Colors.textSecondary },
  moreExercises: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', paddingTop: 8 },
  startBtn: { marginTop: Spacing.md },
  programCard: { padding: Spacing.md },
  programCardActive: { borderWidth: 2, borderColor: Colors.primary },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  programBadge: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  programBadgeEmoji: { fontSize: 20 },
  programCardBody: { flex: 1 },
  programCardName: { ...Typography.bodyMedium },
  programCardExpert: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 4 },
  programTags: { flexDirection: 'row', gap: 4 },
  activeBadge: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.primary },
});
