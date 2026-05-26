/**
 * /streak-calendar — full-screen month-by-month chain view.
 *
 * Scrolls back through the user's training history. Each month is a grid
 * with day-numbers; cells are colored by training status (trained / frozen /
 * missed / future). Legend at the top.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTrainedDates } from '@/hooks/useChainCalendar';
import { buildMonth, type CalendarMonth, type CalendarDay } from '@/lib/chainCalendar';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

const MONTHS_BACK = 6;

export default function StreakCalendarScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: trainedDates } = useTrainedDates(MONTHS_BACK * 31 + 7);

  const [months, setMonths] = useState<CalendarMonth[]>([]);

  // Build last MONTHS_BACK months (current → past)
  const monthAnchors = useMemo(() => {
    const now = new Date();
    const arr: Array<{ y: number; m: number }> = [];
    for (let i = 0; i < MONTHS_BACK; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return arr;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const built = await Promise.all(
        monthAnchors.map((a) =>
          buildMonth(a.y, a.m, trainedDates ?? new Set()),
        ),
      );
      if (alive) setMonths(built);
    })();
    return () => { alive = false; };
  }, [trainedDates, monthAnchors]);

  const totalTrained = months.reduce((s, m) => s + m.trainedCount, 0);
  const totalElapsed = months.reduce((s, m) => s + m.totalElapsedDays, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.close}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          {styleText(persona, 'THE CHAIN')}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.summary, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}>
          <Text style={[styles.summaryNum, { color: persona.accent }]}>
            {totalTrained}<Text style={styles.summaryDenom}>/{totalElapsed}</Text>
          </Text>
          <Text style={styles.summaryLabel}>
            DAYS TRAINED · LAST {MONTHS_BACK} MONTHS
          </Text>
          <Text style={styles.summarySub}>
            {totalElapsed > 0
              ? `${Math.round((totalTrained / totalElapsed) * 100)}% adherence`
              : 'Start your first chain today'}
          </Text>
        </View>

        <View style={styles.legend}>
          <LegendDot color={persona.accent} label="TRAINED" />
          <LegendDot color="#5DD3FA" label="FROZEN" />
          <LegendDot color="rgba(255,255,255,0.06)" label="MISSED" border />
        </View>

        {months.map((month) => (
          <MonthGrid key={month.monthLabel} month={month} accent={persona.accent} />
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function LegendDot({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, border && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function MonthGrid({ month, accent }: { month: CalendarMonth; accent: string }) {
  const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View style={styles.monthCard}>
      <View style={styles.monthHead}>
        <Text style={styles.monthLabel}>{month.monthLabel}</Text>
        <Text style={styles.monthMeta}>
          {month.trainedCount}/{month.totalElapsedDays || month.weeks.flat().filter((c) => c.dateISO).length} days
        </Text>
      </View>
      <View style={styles.dowHeader}>
        {dowLabels.map((d, i) => (
          <Text key={i} style={styles.dowText}>{d}</Text>
        ))}
      </View>
      {month.weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => (
            <DayCell key={ci} cell={cell} accent={accent} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({ cell, accent }: { cell: CalendarDay; accent: string }) {
  if (cell.status === 'empty') return <View style={styles.dayCell} />;
  let bg: string = 'rgba(255,255,255,0.04)';
  let txt: string = Colors.textTertiary;
  if (cell.status === 'trained') { bg = accent; txt = Colors.background; }
  else if (cell.status === 'frozen') { bg = '#5DD3FA'; txt = '#0a1f2c'; }
  else if (cell.status === 'future') { bg = 'transparent'; txt = Colors.textTertiary; }

  return (
    <View style={[
      styles.dayCell,
      { backgroundColor: bg },
      cell.isToday && { borderWidth: 1.5, borderColor: accent },
    ]}>
      <Text style={[styles.dayText, { color: txt }]}>
        {cell.status === 'frozen' ? '🧊' : cell.day}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 16, letterSpacing: 1 },

  scroll: { padding: 16, paddingTop: 4 },

  summary: { borderWidth: 1, borderRadius: 8, padding: 18, alignItems: 'center', marginBottom: 16 },
  summaryNum: { fontFamily: Fonts.display, fontSize: 48, letterSpacing: -1 },
  summaryDenom: { fontFamily: Fonts.body, fontSize: 18, color: Colors.textSecondary },
  summaryLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.6, marginTop: 4 },
  summarySub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, marginTop: 6 },

  legend: { flexDirection: 'row', gap: 14, marginBottom: 16, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 2 },
  legendLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1 },

  monthCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 1 },
  monthMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },

  dowHeader: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  dowText: { flex: 1, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1 },

  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  dayCell: {
    flex: 1, aspectRatio: 1, borderRadius: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  dayText: { fontFamily: Fonts.mono, fontSize: 10 },
});
