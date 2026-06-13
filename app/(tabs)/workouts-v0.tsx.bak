import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { EXERCISE_LIBRARY, type MuscleGroup } from '@/constants/exerciseLibrary';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/theme';
import { personaFromProgramId } from '@/lib/personaTheme';
import { GlassScreen } from '@/components/ui';

function getTodayWorkoutIndex(daysPerWeek: number): number | null {
  const dayOfWeek = new Date().getDay();
  const monBasedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  if (monBasedIndex >= daysPerWeek) return null;
  return monBasedIndex;
}

const COACH_COLORS: Record<string, string> = {
  cbum_evolved:         '#dfff1f',
  arnold_blueprint:     '#ffb13a',
  nippard_fundamentals: '#5b8cff',
  ct_fletcher_iron:     '#ff5b3a',
  dr_mike_mrd:          '#39e08a',
};

// ── Muscle-group accordion row ────────────────────────────────────────────────
function MuscleGroupRow({
  group,
  programId,
}: {
  group: MuscleGroup;
  programId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accentColor = COACH_COLORS[programId] ?? Colors.primary;

  return (
    <View style={styles.groupCard}>
      {/* Header */}
      <TouchableOpacity
        style={styles.groupHeader}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
      >
        <Text style={styles.groupEmoji}>{group.emoji}</Text>
        <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
        <Text style={styles.groupCount}>{group.exercises.length} exercises</Text>
        <Text style={[styles.groupChevron, open && styles.groupChevronOpen]}>›</Text>
      </TouchableOpacity>

      {/* Exercise list */}
      {open && (
        <View style={styles.exerciseList}>
          {group.exercises.map((ex, i) => (
            <View
              key={ex.name}
              style={[
                styles.exerciseRow,
                i === group.exercises.length - 1 && styles.exerciseRowLast,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>{ex.sets} sets · {ex.reps}</Text>
                {ex.tips[0] && (
                  <Text style={styles.exerciseTip} numberOfLines={1}>
                    {ex.tips[0]}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.formBtn, { backgroundColor: accentColor + '18', borderColor: accentColor + '55' }]}
                onPress={() =>
                  router.push({
                    pathname: '/form-coach',
                    params: { exerciseName: ex.name, persona: programId },
                  } as any)
                }
              >
                <Text style={[styles.formBtnText, { color: accentColor }]}>📷 FORM</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Workouts() {
  const router = useRouter();
  const { profile, fetchProfile } = useAuthStore();
  const [switching, setSwitching] = useState(false);
  const [activeSection, setActiveSection] = useState<'today' | 'library'>('today');

  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);
  const accentColor = persona.accent;

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
    <GlassScreen persona={persona}>

      {/* ── Top toggle: TODAY  |  LIBRARY ── */}
      <View style={styles.sectionToggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeSection === 'today' && { borderBottomColor: accentColor }]}
          onPress={() => setActiveSection('today')}
        >
          <Text style={[styles.toggleBtnText, activeSection === 'today' && { color: accentColor }]}>
            TODAY
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, activeSection === 'library' && { borderBottomColor: accentColor }]}
          onPress={() => setActiveSection('library')}
        >
          <Text style={[styles.toggleBtnText, activeSection === 'library' && { color: accentColor }]}>
            EXERCISES
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ══════════════════ TODAY section ══════════════════ */}
        {activeSection === 'today' && (
          <>
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

            {/* Today's workout card */}
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

                {/* Exercise rows with FORM shortcut */}
                <View style={styles.exListBordered}>
                  {todayWorkout.exercises.slice(0, 5).map((ex, i) => (
                    <View key={ex.name} style={styles.exRow}>
                      <Text style={[styles.exNum, { color: accentColor }]}>{String(i + 1).padStart(2, '0')}</Text>
                      <Text style={styles.exName}>{ex.name}</Text>
                      <Text style={styles.exSets}>{ex.sets}×{ex.reps}</Text>
                      <TouchableOpacity
                        style={styles.formShortcut}
                        onPress={() =>
                          router.push({
                            pathname: '/form-coach',
                            params: { exerciseName: ex.name, persona: programId },
                          } as any)
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.formShortcutText, { color: accentColor }]}>📷</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {todayWorkout.exercises.length > 5 && (
                    <Text style={styles.moreExercises}>+{todayWorkout.exercises.length - 5} MORE</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.startBtn, { backgroundColor: accentColor }]}
                  onPress={() =>
                    router.push('/workout-picker' as any)
                  }
                  activeOpacity={0.85}
                >
                  <Text style={[styles.startBtnText, { color: Colors.accentInk }]}>START WORKOUT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.restCard}>
                <Text style={styles.restTitle}>RECOVER &amp; GROW</Text>
                <Text style={styles.restSub}>Muscles build during rest. Light walk, stretching, or sleep.</Text>
                <TouchableOpacity
                  style={styles.browseBtn}
                  onPress={() => setActiveSection('library')}
                >
                  <Text style={styles.browseBtnText}>BROWSE EXERCISES →</Text>
                </TouchableOpacity>
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
          </>
        )}

        {/* ══════════════════ EXERCISE LIBRARY section ══════════════════ */}
        {activeSection === 'library' && (
          <>
            <View style={styles.header}>
              <Text style={styles.monoLabel}>TAP A MUSCLE GROUP TO EXPAND</Text>
              <Text style={styles.headline}>EXERCISE{'\n'}LIBRARY.</Text>
            </View>
            {EXERCISE_LIBRARY.map((group) => (
              <MuscleGroupRow key={group.id} group={group} programId={programId} />
            ))}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </GlassScreen>
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

  // ── Section toggle ──────────────────────────────────────────────────────────
  sectionToggle: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
  },
  toggleBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  toggleBtnText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.textTertiary,
    letterSpacing: 1.4,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: { marginBottom: 16 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 40, color: Colors.text, lineHeight: 38, letterSpacing: -1, marginTop: 6 },

  // ── Active program chip ─────────────────────────────────────────────────────
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 2,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 16,
  },
  activeChipDot: { width: 6, height: 6, borderRadius: 3 },
  activeChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },

  // ── Today card ──────────────────────────────────────────────────────────────
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

  exListBordered: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 16 },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exNum: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.5, width: 24 },
  exName: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: Colors.text },
  exSets: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
  formShortcut: { paddingLeft: 8 },
  formShortcutText: { fontSize: 16 },
  moreExercises: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, textAlign: 'center', paddingVertical: 10 },

  startBtn: { margin: 16, borderRadius: 4, paddingVertical: 14, alignItems: 'center' },
  startBtnText: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 1 },

  // ── Rest card ───────────────────────────────────────────────────────────────
  restCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 24, marginBottom: 24, alignItems: 'center',
  },
  restTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginBottom: 8 },
  restSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  browseBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 10 },
  browseBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1 },

  // ── Programs ────────────────────────────────────────────────────────────────
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
  activePill: { borderWidth: 1, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  activePillText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1 },
  programExpert: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
  programTagRow: { flexDirection: 'row', gap: 6 },
  programTag: { borderWidth: 1, borderColor: Colors.border, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  programTagText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.8 },

  // ── Exercise Library accordion ───────────────────────────────────────────────
  groupCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, marginBottom: 8, overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  groupEmoji: { fontSize: 18 },
  groupLabel: { fontFamily: Fonts.display, fontSize: 15, color: Colors.text, flex: 1, letterSpacing: 0.3 },
  groupCount: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1 },
  groupChevron: { fontSize: 20, color: Colors.textSecondary, transform: [{ rotate: '0deg' }] },
  groupChevronOpen: { transform: [{ rotate: '90deg' }] },

  exerciseList: { borderTopWidth: 1, borderTopColor: Colors.border },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exerciseRowLast: { borderBottomWidth: 0 },
  exerciseName: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text, marginBottom: 2 },
  exerciseMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.6 },
  exerciseTip: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary, marginTop: 2, fontStyle: 'italic' },
  formBtn: {
    borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  formBtnText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.8 },
});
