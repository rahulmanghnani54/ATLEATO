/**
 * ChainCalendarCard — compact 6-week strip on home (Seinfeld method)
 *
 * Each cell is one day, colored by status:
 *   trained = persona accent  (filled square)
 *   frozen  = pale blue tint  (🧊 saved this day)
 *   missed  = dark            (broken chain)
 *   future  = ghost           (not happened yet)
 *
 * Tap → opens /streak-calendar full-screen view.
 */
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTrainedDates } from '@/hooks/useChainCalendar';
import { buildCompactStrip, type CalendarDay } from '@/lib/chainCalendar';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

const WEEKS = 6;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function ChainCalendarCard({ persona }: { persona: PersonaTheme }) {
  const router = useRouter();
  const { data: trainedDates } = useTrainedDates(WEEKS * 7 + 7);
  const [cells, setCells] = useState<CalendarDay[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await buildCompactStrip(trainedDates ?? new Set(), WEEKS);
      if (alive) setCells(c);
    })();
    return () => { alive = false; };
  }, [trainedDates]);

  // Group cells into 7 columns × WEEKS rows (Mon–Sun rows)
  // cells is currently row-major Mon..Sun for each week, ordered oldest→newest
  const weekRows: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7));

  const trainedCount = cells.filter((c) => c.status === 'trained').length;
  const frozenCount  = cells.filter((c) => c.status === 'frozen').length;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: persona.accent }]}
      onPress={() => router.push('/streak-calendar' as any)}
      activeOpacity={0.85}
    >
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: persona.accent }]}>
          ✦ {styleText(persona, 'DON’T BREAK THE CHAIN')}
        </Text>
        <Text style={styles.headRight}>{trainedCount}/{WEEKS * 7} DAYS</Text>
      </View>

      <View style={styles.gridRow}>
        {/* Day-of-week labels (left rail) */}
        <View style={styles.dowCol}>
          {DAY_LABELS.map((d, i) => (
            <Text key={i} style={styles.dowLabel}>{d}</Text>
          ))}
        </View>

        {/* The grid — each week is a column of 7 cells */}
        <View style={styles.weekGrid}>
          {weekRows.map((week, wi) => (
            <View key={wi} style={styles.weekCol}>
              {week.map((cell, ci) => (
                <View key={ci} style={[
                  styles.cell,
                  cellStyle(cell, persona),
                  cell.isToday && { borderWidth: 1.5, borderColor: persona.accent },
                ]} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.foot}>
        {trainedCount === WEEKS * 7
          ? '🔥 PERFECT CHAIN — unbroken.'
          : frozenCount > 0
          ? `${trainedCount} trained · ${frozenCount} frozen — tap to view full calendar`
          : `${trainedCount} of the last ${WEEKS * 7} days — tap to view full calendar`}
      </Text>
    </TouchableOpacity>
  );
}

function cellStyle(cell: CalendarDay, persona: PersonaTheme) {
  switch (cell.status) {
    case 'trained': return { backgroundColor: persona.accent };
    case 'frozen':  return { backgroundColor: '#5DD3FA', opacity: 0.65 };
    case 'missed':  return { backgroundColor: 'rgba(255,255,255,0.06)' };
    case 'future':  return { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' };
    case 'rest':    return { backgroundColor: 'rgba(255,255,255,0.10)' };
    default:        return { backgroundColor: 'transparent' };
  }
}

const CELL = 16;
const GAP  = 3;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  label:    { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  headRight:{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },

  gridRow: { flexDirection: 'row', gap: 6 },
  dowCol:  { justifyContent: 'space-between', paddingVertical: 1 },
  dowLabel:{ fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, height: CELL, lineHeight: CELL, width: 10 },

  weekGrid: { flexDirection: 'row', gap: GAP, flex: 1 },
  weekCol:  { gap: GAP, flex: 1 },
  cell:     { width: '100%', height: CELL, borderRadius: 2 },

  foot: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.8, marginTop: 12 },
});
