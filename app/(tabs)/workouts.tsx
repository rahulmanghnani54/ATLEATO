/**
 * Workouts Tab — Direction C (migrated 2026-06-12)
 *
 * Structure:
 *   HeroBlock — persona gradient + Day-of-week / week-of-year + "TRAIN" or "REST"
 *   3-up Stat row — program name / sessions per week / today's status
 *   Toggle: TODAY | EXERCISES
 *     TODAY:     RowCards for each exercise in today's session
 *     EXERCISES: Muscle-group accordion (preserved from v0)
 *   AnchorCTA — "START TODAY'S WORKOUT" or "PICK A WORKOUT"
 *
 * v0 backup at workouts-v0.tsx.bak.
 */
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronRight, Dumbbell, Library } from 'lucide-react-native';

import { EXPERT_PROGRAMS } from '@/constants/experts';
import { EXERCISE_LIBRARY, type MuscleGroup } from '@/constants/exerciseLibrary';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { personaFromProgramId } from '@/lib/personaTheme';
import { HeroBlock, Stat, RowCard, AnchorCTA } from '@/components/ui/c';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTodayWorkoutIndex(daysPerWeek: number): number | null {
  const dow = new Date().getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return idx >= daysPerWeek ? null : idx;
}

function weekOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}

// ─── Muscle-group accordion (preserved from v0 but restyled) ─────────────────
function MuscleGroupRow({ group, accent }: { group: MuscleGroup; accent: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.groupCard}>
      <TouchableOpacity
        style={styles.groupHead}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.8}
      >
        <Text style={styles.groupName}>{group.name}</Text>
        {open ? <ChevronDown size={18} color={Colors.textSecondary} /> : <ChevronRight size={18} color={Colors.textSecondary} />}
      </TouchableOpacity>
      {open && (
        <View style={styles.groupBody}>
          {group.exercises.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              style={styles.groupExRow}
              onPress={() =>
                router.push({
                  pathname: '/form-coach' as any,
                  params: { exerciseName: ex.name, persona: 'cbum' },
                })
              }
            >
              <Text style={styles.groupExName}>{ex.name}</Text>
              <Text style={[styles.groupExTag, { color: accent }]}>Form check ›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function Workouts() {
  const router = useRouter();
  const { profile, fetchProfile } = useAuthStore();
  const [switching, setSwitching] = useState(false);
  const [section, setSection] = useState<'today' | 'library'>('today');

  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona = personaFromProgramId(programId);

  const todayIdx = getTodayWorkoutIndex(program.daysPerWeek);
  const todayWorkout = todayIdx !== null ? program.schedule[todayIdx % program.schedule.length] : null;
  const isRest = todayWorkout == null;

  const handleSwitchProgram = async (id: string) => {
    if (id === programId || switching) return;
    setSwitching(true);
    const { error } = await (supabase.from('profiles') as any)
      .update({ selected_program: id })
      .eq('id', profile?.id ?? '');
    if (error) Alert.alert('Error', 'Could not switch program. Try again.');
    else await fetchProfile(profile?.id ?? '');
    setSwitching(false);
  };

  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'short' });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO ──────────────────────────────────────────── */}
        <HeroBlock
          accent={persona.accent}
          day={`${weekday.toUpperCase()} · WEEK ${weekOfYear()}`}
          name={isRest ? 'Rest day.' : `Train\n${todayWorkout!.name}.`}
        />

        {/* ── 2. STATS ────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <Stat
            value={String(program.daysPerWeek)}
            label="Days/week"
            accent
            accentColor={persona.accent}
          />
          <Stat
            value={String(program.schedule.length)}
            label="Sessions"
          />
          <Stat
            value={isRest ? '—' : `${todayWorkout!.exercises.length}`}
            label={isRest ? 'Today' : 'Exercises'}
          />
        </View>

        {/* ── 3. SECTION TOGGLE ───────────────────────────────── */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.tab, section === 'today' && { borderBottomColor: persona.accent }]}
            onPress={() => setSection('today')}
          >
            <Text style={[styles.tabText, section === 'today' && { color: persona.accent }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, section === 'library' && { borderBottomColor: persona.accent }]}
            onPress={() => setSection('library')}
          >
            <Text style={[styles.tabText, section === 'library' && { color: persona.accent }]}>Exercises</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4a. TODAY view ──────────────────────────────────── */}
        {section === 'today' && (
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            {isRest ? (
              <View style={styles.restCard}>
                <Text style={styles.restEmoji}>·</Text>
                <Text style={styles.restTitle}>Recovery day.</Text>
                <Text style={styles.restMeta}>
                  {persona.shortName} schedules rest after {program.daysPerWeek - 1} training days.
                  Hydrate, walk, sleep early.
                </Text>
              </View>
            ) : (
              todayWorkout.exercises.map((ex, i) => (
                <RowCard
                  key={`${ex.name}-${i}`}
                  icon={<Dumbbell size={22} color={persona.accent} />}
                  iconTintColor={persona.accent}
                  title={ex.name}
                  meta={`${ex.sets} sets · ${ex.reps} · ${ex.restSeconds}s rest`}
                  onPress={() =>
                    router.push({
                      pathname: '/form-coach' as any,
                      params: { exerciseName: ex.name, persona: persona.id },
                    })
                  }
                />
              ))
            )}
          </SafeAreaView>
        )}

        {/* ── 4b. EXERCISES library view ──────────────────────── */}
        {section === 'library' && (
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            <RowCard
              icon={<Library size={22} color={persona.accent} />}
              iconTintColor={persona.accent}
              title="Full exercise library"
              meta={`${EXERCISE_LIBRARY.reduce((n, g) => n + g.exercises.length, 0)} exercises across ${EXERCISE_LIBRARY.length} muscle groups`}
            />
            {EXERCISE_LIBRARY.map((g) => (
              <MuscleGroupRow key={g.id} group={g} accent={persona.accent} />
            ))}
          </SafeAreaView>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── 5. ANCHOR CTA ───────────────────────────────────── */}
      <AnchorCTA
        label={isRest ? 'PICK A WORKOUT →' : `${persona.workoutCTA} →`}
        accent={persona.accent}
        accentInk={persona.ink}
        onPress={() => router.push((isRest ? '/workout-picker' : '/workout-lobby') as any)}
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

  // Rest day
  restCard: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  restEmoji: { fontSize: 48, color: Colors.textTertiary, marginBottom: Spacing.sm },
  restTitle: { ...Typography.sectionTitle, marginBottom: Spacing.xs + 1 },
  restMeta: { ...Typography.cardMeta, textAlign: 'center', lineHeight: 19 },

  // Exercise library accordion
  groupCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm + 2,
    overflow: 'hidden',
  },
  groupHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md - 2,
  },
  groupName: { ...Typography.cardTitle },
  groupBody: { paddingHorizontal: Spacing.md - 2, paddingBottom: Spacing.sm + 2 },
  groupExRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  groupExName: { ...Typography.cardMeta, color: Colors.text },
  groupExTag: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
