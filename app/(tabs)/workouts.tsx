import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts, Spacing } from '@/constants/theme';

function getTodayWorkoutIndex(daysPerWeek: number): number | null {
  const dayOfWeek = new Date().getDay();
  const monBasedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  if (monBasedIndex >= daysPerWeek) return null;
  return monBasedIndex;
}

const COACH_COLORS: Record<string, string> = {
  cbum_evolved:       '#dfff1f',
  arnold_blueprint:   '#ffb13a',
  nippard_fundamentals: '#5b8cff',
  ct_fletcher_iron:   '#ff5b3a',
  dr_mike_mrd:        '#39e08a',
};

export default function Workouts() {
  const router = useRouter();
  const { profile, fetchProfile } = useAuthStore();
  const [switching, setSwitching] = useState(false);

  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const accentColor = COACH_COLORS[programId] ?? Colors.primary;

  const todayIndex = getTodayWorkoutIndex(program.daysPerWeek);
  const workoutIndex = todayIndex !== null ? todayIndex % program.schedule.length : 0;
  const todayWorkout = todayIndex !== null ? program.schedule[workoutIndex] : null;

  const handleSelectProgram = async (id: string) => {
    if (id === programId || switching) return;
    setSwitching(true);
    const { error } = await (supabase.from('profiles') as any)
      .update({ selected_program: id })
      .eq('id', profile?.id ?? '');
    if (error) {
      Alert.alert('Error', 'Could not switch program. Please try again.');
    } else {
      await fetchProfile(profile?.id ?? '');
    }
    setSwitching(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.monoLabel}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} · WEEK {getWeekOfYear()}
          </Text>
          <Text style={styles.headline}>
            {todayWorkout ? 'TRAIN\nTODAY.' : 'REST\nTODAY.'}
          </Text>
        </View>

        {/* Active program chip */}
        <View style={[styles.activeChip, { borderColor: accentColor }]}>
          <View style={[styles.activeChipDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.activeChipText, { color: accentColor }]}>
            {program.name.toUpperCase()} — ACTIVE
          </Text>
        </View>

        {/* Today's workout */}
        {todayWorkout ? (
          <View style={styles.todayCard}>
            <View style={styles.todayCardTop}>
              <View style={styles.todayMeta}>
                <Text style={styles.todayWorkoutName}>{todayWorkout.name.toUpperCase()}</Text>
                <Text style={styles.todayMuscles}>{todayWorkout.muscleGroups.join(' · ')}</Text>
              </View>
              <View style={styles.todayStats}>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: accentColor }]}>{todayWorkout.exercises.length}</Text>
                  <Text style={styles.statLabel}>EXER</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: accentColor }]}>{todayWorkout.estimatedMinutes}</Text>
                  <Text style={styles.statLabel}>MIN</Text>
                </View>
              </View>
            </View>

            <View style={styles.exerciseList}>
              {todayWorkout.exercises.slice(0, 5).map((ex, i) => (
                <View key={ex.name} style={styles.exerciseRow}>
                  <Text style={[styles.exerciseNum, { color: accentColor }]}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseSets}>{ex.sets}×{ex.reps}</Text>
                </View>
              ))}
              {todayWorkout.exercises.length > 5 && (
                <Text style={styles.moreExercises}>+{todayWorkout.exercises.length - 5} MORE</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: accentColor }]}
              onPress={() => router.push({
                pathname: '/workout-lobby',
                params: { programId, dayIndex: workoutIndex },
              } as any)}
              activeOpacity={0.85}
            >
              <Text style={[styles.startBtnText, { color: Colors.accentInk }]}>START WORKOUT</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>RECOVER &amp; GROW</Text>
            <Text style={styles.restSub}>Muscles build during rest. Light walk, stretching, or sleep.</Text>
          </View>
        )}

        {/* All Programs */}
        <Text style={styles.sectionLabel}>ALL PROGRAMS</Text>
        {Object.values(EXPERT_PROGRAMS).map((prog) => {
          const hue = COACH_COLORS[prog.id] ?? Colors.primary;
          const isActive = prog.id === programId;
          return (
            <TouchableOpacity
              key={prog.id}
              style={[styles.programCard, isActive && { borderColor: hue }]}
              onPress={() => handleSelectProgram(prog.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.programAccent, { backgroundColor: hue }]} />
              <View style={styles.programBody}>
                <View style={styles.programTopRow}>
                  <Text style={styles.programName}>{prog.name}</Text>
                  {isActive && (
                    <View style={[styles.activePill, { backgroundColor: hue + '22', borderColor: hue }]}>
                      <Text style={[styles.activePillText, { color: hue }]}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.programExpert}>{prog.expert}</Text>
                <View style={styles.programTagRow}>
                  <View style={styles.programTag}><Text style={styles.programTagText}>{prog.difficulty.toUpperCase()}</Text></View>
                  <View style={styles.programTag}><Text style={styles.programTagText}>{prog.daysPerWeek}D/WK</Text></View>
                  <View style={styles.programTag}><Text style={styles.programTagText}>{prog.focus.toUpperCase()}</Text></View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>
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

  header: { marginBottom: 16 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 40, color: Colors.text, lineHeight: 38, letterSpacing: -1, marginTop: 6 },

  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 2,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 16,
  },
  activeChipDot: { width: 6, height: 6, borderRadius: 3 },
  activeChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },

  todayCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, marginBottom: 24, overflow: 'hidden',
  },
  todayCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16 },
  todayMeta: { flex: 1 },
  todayWorkoutName: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: 0.2 },
  todayMuscles: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1, marginTop: 4 },
  todayStats: { flexDirection: 'row', gap: 12 },
  statBox: { alignItems: 'center' },
  statNum: { fontFamily: Fonts.display, fontSize: 22 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1 },

  exerciseList: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 16 },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseNum: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.5, width: 24 },
  exerciseName: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: Colors.text },
  exerciseSets: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
  moreExercises: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, textAlign: 'center', paddingVertical: 10 },

  startBtn: { margin: 16, borderRadius: 4, paddingVertical: 14, alignItems: 'center' },
  startBtnText: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 1 },

  restCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 24, marginBottom: 24, alignItems: 'center',
  },
  restTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginBottom: 8 },
  restSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 2, marginBottom: 10 },

  programCard: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, marginBottom: 8, overflow: 'hidden',
  },
  programAccent: { width: 3 },
  programBody: { flex: 1, padding: 14 },
  programTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  programName: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, flex: 1 },
  activePill: {
    borderWidth: 1, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2,
  },
  activePillText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1 },
  programExpert: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
  programTagRow: { flexDirection: 'row', gap: 6 },
  programTag: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 2,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  programTagText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.8 },
});
