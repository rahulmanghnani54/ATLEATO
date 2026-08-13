/**
 * /streak-calendar — full-screen month-by-month chain view.
 *
 * Scrolls back through the user's training history. Each month is a grid
 * with day-numbers; cells are colored by training status (trained / frozen /
 * missed / future). Legend at the top.
 *
 * Bold Canvas, Editorial treatment: the crown carries the streak numeral as the
 * one hero, and the light body is nothing but hairline-ruled month grids. The
 * cards are gone — a calendar is already a grid, so boxing it was chrome on top
 * of chrome. Day cells are square-cornered (radius 0) so the grid reads as a
 * printed ledger rather than a row of pills.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTrainedDates } from '@/hooks/useChainCalendar';
import { buildMonth, type CalendarMonth, type CalendarDay } from '@/lib/chainCalendar';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const MONTHS_BACK = 6;
const BODY_PAD = 22; // matches Crown's own horizontal padding

/** The persona colours a day cell needs, resolved once per render at the top. */
interface CellPalette {
  /** Fill for a trained day. */
  accent: string;
  /** Text ON that fill. */
  ink: string;
  /** Deeper tone at the fill's edge — the brand accent is under 3:1 on white. */
  line: string;
}

export default function StreakCalendarScreen() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is a dark block in BOTH schemes, so its tint always takes the
  // persona's dark-tuned accent — the light triplet goes muddy on near-black.
  const crownTint = personaAccent(persona, 'dark').accent;
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

  const palette: CellPalette = { accent: pa.accent, ink: pa.ink, line: pa.accentText };

  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      {/* ── CROWN — the streak numeral is the one hero on this screen ── */}
      <Crown
        eyebrow={`THE CHAIN · LAST ${MONTHS_BACK} MONTHS`}
        title={String(totalTrained)}
        accentLine={styleText(persona, `of ${totalElapsed} days trained.`)}
        meta={
          totalElapsed > 0
            ? `${Math.round((totalTrained / totalElapsed) * 100)}% adherence`
            : 'Start your first chain today'
        }
        accent={crownTint}
        onBack={() => router.back()}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* ── LEGEND — the key to the grid below, no box around it ── */}
        <View style={styles.legend}>
          <LegendKey color={pa.accent} line={pa.accentText} label="Trained" />
          <LegendKey color={tokens.info} label="Frozen" />
          <LegendKey color={tokens.border} line={tokens.borderStrong} label="Missed" />
        </View>
        <Hairline />

        <Section label="Month by month">
          {months.length === 0 ? (
            /* Shaped like two real month blocks, so the page looks built while
               buildMonth() resolves rather than flashing an empty column. */
            <View style={styles.loading}>
              {[0, 1].map((i) => (
                <View key={i} style={styles.loadingMonth}>
                  <Skeleton height={26} width="46%" radius={0} />
                  <Skeleton height={9} width="22%" radius={0} />
                  <Skeleton height={140} radius={0} />
                </View>
              ))}
            </View>
          ) : (
            months.map((month, i) => (
              <MonthGrid
                key={month.monthLabel}
                month={month}
                palette={palette}
                first={i === 0}
              />
            ))
          )}
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );
}

function LegendKey({ color, line, label }: { color: string; line?: string; label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: color },
          line ? { borderWidth: 1, borderColor: line } : null,
        ]}
      />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function MonthGrid({
  month,
  palette,
  first,
}: {
  month: CalendarMonth;
  palette: CellPalette;
  first: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // 'MAY 2026' → a big month name with the year receding beside it.
  const [monthName, ...yearParts] = month.monthLabel.split(' ');
  const monthYear = yearParts.join(' ');

  return (
    <View style={[styles.month, first && styles.monthFirst]}>
      <View style={styles.monthHead}>
        <Text style={styles.monthName} numberOfLines={1}>
          {monthName}
          {monthYear ? <Text style={styles.monthYear}>{`  ${monthYear}`}</Text> : null}
        </Text>
        <Text style={styles.monthMeta}>
          {month.trainedCount}/{month.totalElapsedDays || month.weeks.flat().filter((c) => c.dateISO).length} days
        </Text>
      </View>
      <Hairline style={styles.monthRule} />

      <View style={styles.dowHeader}>
        {dowLabels.map((d, i) => (
          <Text key={i} style={styles.dowText}>{d}</Text>
        ))}
      </View>
      {month.weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => (
            <DayCell key={ci} cell={cell} palette={palette} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({ cell, palette }: { cell: CalendarDay; palette: CellPalette }) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (cell.status === 'empty') return <View style={styles.dayCell} />;

  // 'missed' and 'rest' both fall through to the muted plate, as before.
  let bg: string = tokens.border;
  let txt: string = tokens.textTertiary;
  let edge: string | null = null;
  if (cell.status === 'trained') { bg = palette.accent; txt = palette.ink; edge = palette.line; }
  else if (cell.status === 'frozen') { bg = tokens.info; txt = tokens.bg; }
  else if (cell.status === 'future') { bg = 'transparent'; txt = tokens.textTertiary; }

  return (
    <View style={[
      styles.dayCell,
      { backgroundColor: bg },
      edge ? { borderWidth: 1, borderColor: edge } : null,
      // Today is the anchor of the whole grid: a neutral-ink ring reads on the
      // accent fill and on the muted plate alike, in both schemes.
      cell.isToday && { borderWidth: 2, borderColor: tokens.text },
    ]}>
      <Text style={[styles.dayText, cell.isToday && styles.dayTextToday, { color: txt }]}>
        {cell.status === 'frozen' ? '🧊' : cell.day}
      </Text>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: 26,
    marginBottom: 22,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 11, height: 11, borderRadius: 0 },
  legendLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  loading: { gap: 34 },
  loadingMonth: { gap: 12 },

  month: { marginTop: 34 },
  monthFirst: { marginTop: 0 },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthName: {
    flexShrink: 1,
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 31,
    // -0.04em at 27px.
    letterSpacing: -1.08,
    color: t.text,
  },
  monthYear: {
    fontFamily: Fonts.legacyMono,
    fontSize: 11,
    letterSpacing: 1.4,
    color: t.textTertiary,
  },
  monthMeta: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  monthRule: { marginTop: 12, marginBottom: 14 },

  dowHeader: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.6,
    color: t.textTertiary,
  },

  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  dayTextToday: { fontFamily: Fonts.bodyBold },
});
