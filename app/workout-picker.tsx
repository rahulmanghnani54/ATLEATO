/**
 * /workout-picker — "What do you want to train today?"
 *
 * Lands here when the user taps START WORKOUT on Home or in the StreakNudge.
 * Shows:
 *   1. Today's RECOMMENDED workout (per the program schedule)
 *   2. All OTHER days from the same program (so they can swap on the fly)
 *   3. "Custom — pick exercises yourself" → routes to the EXERCISES library
 *
 * Tapping any card → /workout-lobby with the chosen dayIndex.
 *
 * Lives outside the (tabs) group so the tab bar doesn't render —
 * lighter, more focused decision UI.
 */
import { useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

function getTodayProgramDayIndex(): number {
  const dow = new Date().getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

export default function WorkoutPicker() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const programId = profile?.selected_program ?? 'cbum_evolved';
  const program   = EXPERT_PROGRAMS[programId] ?? EXPERT_PROGRAMS.cbum_evolved;
  const persona   = personaFromProgramId(programId);

  const todayIdx = getTodayProgramDayIndex();
  const todayDay = program.schedule.find((d) => d.day === todayIdx) ?? null;

  // All days other than today's recommended
  const otherDays = useMemo(() =>
    program.schedule
      .filter((d) => d.day !== todayIdx)
      .sort((a, b) => a.day - b.day),
    [program, todayIdx],
  );

  const goTo = (dayIndex: number) => {
    router.replace({
      pathname: '/workout-lobby',
      params: { programId, dayIndex: String(dayIndex) },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.close}>← cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          {styleText(persona, 'WHAT TO TRAIN')}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>
          Pick a workout. Today's plan is recommended — swap any time.
        </Text>

        {/* Recommended — today */}
        {todayDay ? (
          <>
            <Text style={[styles.sectionLabel, { color: persona.accent }]}>RECOMMENDED · TODAY</Text>
            <TouchableOpacity
              style={[styles.recCard, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}
              onPress={() => goTo(todayDay.day)}
              activeOpacity={0.85}
            >
              <View style={[styles.recRibbon, { backgroundColor: persona.accent }]}>
                <Text style={[styles.recRibbonText, { color: persona.ink }]}>★ FOLLOW THE PLAN</Text>
              </View>
              <Text style={styles.recName}>{todayDay.name.toUpperCase()}</Text>
              <Text style={styles.recMeta}>
                {todayDay.muscleGroups.join(' · ')} · {todayDay.estimatedMinutes} min · {todayDay.exercises.length} lifts
              </Text>
              <Text style={[styles.recFocus, { color: persona.accent }]}>
                {todayDay.focus}
              </Text>
              <View style={[styles.recBtn, { backgroundColor: persona.accent }]}>
                <Text style={[styles.recBtnText, { color: persona.ink }]}>▶  START THIS</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.restCard}>
            <Text style={styles.restEmoji}>🛌</Text>
            <Text style={styles.restTitle}>Today is a rest day.</Text>
            <Text style={styles.restSub}>Recovery is when muscle grows. But pick another day below if you want to push.</Text>
          </View>
        )}

        {/* Other days from the program */}
        <Text style={styles.sectionLabel}>OR PICK ANOTHER DAY</Text>
        {otherDays.map((d) => (
          <TouchableOpacity
            key={d.day}
            style={styles.dayCard}
            onPress={() => goTo(d.day)}
            activeOpacity={0.85}
          >
            <View style={styles.dayLeft}>
              <Text style={[styles.dayNum, { color: persona.accent }]}>
                {String(d.day + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.dayLabel}>DAY</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayName}>{d.name.toUpperCase()}</Text>
              <Text style={styles.dayMeta}>
                {d.muscleGroups.join(' · ')} · {d.estimatedMinutes} min
              </Text>
            </View>
            <Text style={styles.dayArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {/* Custom: route to library */}
        <Text style={styles.sectionLabel}>OR BUILD YOUR OWN</Text>
        <TouchableOpacity
          style={styles.customCard}
          onPress={() => router.replace('/(tabs)/workouts' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.customEmoji}>🛠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.customTitle}>Pick exercises yourself</Text>
            <Text style={styles.customSub}>Browse the full exercise library and build a session.</Text>
          </View>
          <Text style={styles.dayArrow}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 1.4 },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  sub:    { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginBottom: 24, lineHeight: 19 },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.8,
    color: Colors.textTertiary, marginBottom: 10, marginTop: 16,
  },

  // Recommended (today) card
  recCard: {
    borderWidth: 1.5, borderRadius: 14, padding: 20, marginBottom: 4,
    position: 'relative', overflow: 'hidden',
  },
  recRibbon: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 4, marginBottom: 12,
  },
  recRibbonText: { fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  recName: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 32, color: Colors.text, letterSpacing: -0.8 },
  recMeta: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, marginTop: 8, letterSpacing: 0.6 },
  recFocus: { fontFamily: Fonts.body, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  recBtn: {
    marginTop: 18, paddingVertical: 14, borderRadius: 100, alignItems: 'center',
  },
  recBtnText: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 13, letterSpacing: 1 },

  // Rest day card
  restCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 20, alignItems: 'center',
  },
  restEmoji: { fontSize: 36 },
  restTitle: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 18, color: Colors.text, marginTop: 8 },
  restSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 17 },

  // Other day cards
  dayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  dayLeft: {
    alignItems: 'center', justifyContent: 'center',
    width: 50, paddingVertical: 6,
    borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dayNum: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 18 },
  dayLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1.2, marginTop: 2 },
  dayName: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 16, color: Colors.text, letterSpacing: -0.2 },
  dayMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: 4, letterSpacing: 0.6 },
  dayArrow: { fontFamily: Fonts.display, fontSize: 20, color: Colors.textSecondary },

  // Custom card
  customCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  customEmoji: { fontSize: 28 },
  customTitle: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 15, color: Colors.text },
  customSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
});
