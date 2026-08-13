/**
 * Progress Tab — Bold Canvas (migrated from Direction C, 2026-08-13)
 *
 * Editorial treatment for a screen that is pure data:
 *   Crown      — the headline achievement (8-week volume) as the hero numeral,
 *                the coach's colour living in the accent line + radial tint.
 *   StatRow    — sessions / PRs / badges, receding under the crown.
 *   Toggle     — STATS | PHYSIQUE (mono, hairline-ruled — no pill chrome).
 *   Sections   — volume chart, AI weekly review, PR list, achievements.
 *
 * The volume chart is drawn here rather than via components/progress/VolumeChart
 * because that component paints from the light-locked legacy `Colors` shim and
 * cannot follow the scheme. Same data source, same empty copy, token colours.
 *
 * Settings moved from the bottom AnchorCTA into the crown's top-right slot: a
 * floating pill would have fought the floating tab bar for the same edge.
 *
 * v0 backup at progress-v0.tsx.bak.
 */
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Line, Rect } from 'react-native-svg';
import { Award, Settings, Sparkles, Trophy } from 'lucide-react-native';

import { PhysiqueGallery } from '@/components/progress/PhysiqueGallery';
import { PhysiquePrivacyCard } from '@/components/progress/PhysiquePrivacyCard';
import { BigStat, CanvasScreen, Crown, Hairline, ListRow, Section, StatRow } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import {
  useAchievements,
  usePersonalRecords,
  useWeeklyVolume,
  type WeeklyVolume,
} from '@/hooks/useProgressStats';
import { getWeeklySummary, type WeeklySummaryResponse } from '@/lib/api/edgeFunctions';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { Fonts } from '@/constants/theme';

const CHART_HEIGHT = 132;
const BODY_PAD = 22; // matches Crown's own horizontal padding

function Epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

function getWeekOfYear() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

export default function Progress() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  // The crown is a dark block in BOTH schemes, so its tint always takes the
  // persona's dark-tuned accent — the light triplet is tuned against white and
  // both the glow and the accent line go muddy on near-black.
  const crownTint = personaAccent(persona, 'dark').accent;
  const { data: weeklyVolume = [], isLoading: volumeLoading } = useWeeklyVolume(8);
  const { data: prs = [], isLoading: prsLoading } = usePersonalRecords();
  const { data: achievements = [], isLoading: achievementsLoading } = useAchievements();

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'physique'>('stats');

  const thisWeekVolume = weeklyVolume.length > 0
    ? (weeklyVolume[weeklyVolume.length - 1]?.totalVolumeKg ?? 0) : 0;
  const hasAnyWorkoutThisWeek = thisWeekVolume > 0;
  const dayOfWeek = new Date().getDay();
  const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
  const tooEarlyInWeek = dayOfWeek >= 1 && dayOfWeek <= 2 && thisWeekVolume < 1000;
  const canGenerateSummary = hasAnyWorkoutThisWeek && !tooEarlyInWeek;
  const summaryBlocked = summaryLoading || !canGenerateSummary;

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

  // Headline volume value — now the crown's hero numeral
  const totalVolumeKg = weeklyVolume.reduce((n, w) => n + (w.totalVolumeKg ?? 0), 0);
  const totalDisplay = totalVolumeKg >= 1000
    ? `${(totalVolumeKg / 1000).toFixed(1)}k`
    : String(Math.round(totalVolumeKg));
  const sessions = weeklyVolume.reduce((n, w) => n + (w.workoutCount ?? 0), 0);

  const lastWeek = weeklyVolume[weeklyVolume.length - 1];
  const crownMeta = volumeLoading
    ? 'Reading the last eight weeks…'
    : lastWeek
      ? `${lastWeek.weekLabel} · ${Math.round(lastWeek.totalVolumeKg).toLocaleString()}kg across ${lastWeek.workoutCount} session${lastWeek.workoutCount !== 1 ? 's' : ''}`
      : 'Nothing logged yet. Your first session starts the chart.';

  return (
    <CanvasScreen>
      {/* ── 1. CROWN — the headline achievement ─────────────── */}
      <Crown
        eyebrow={`WEEK ${getWeekOfYear()} · ${new Date().getFullYear()}`}
        title={`${totalDisplay} kg`}
        accentLine="lifted in 8 weeks."
        meta={crownMeta}
        pills={[
          `${prs.length} PR${prs.length === 1 ? '' : 's'}`,
          `${achievements.length} badge${achievements.length === 1 ? '' : 's'}`,
          persona.shortName,
        ]}
        accent={crownTint}
        right={
          <PressableScale
            onPress={() => router.push('/profile' as any)}
            haptic="light"
            scaleTo={0.96}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={[styles.crownPill, { borderColor: tokens.crownLine }]}
          >
            <Settings size={13} color={tokens.crownText} />
            <Text style={[styles.crownPillText, { color: tokens.crownText }]}>Settings</Text>
          </PressableScale>
        }
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* ── 2. STATS ──────────────────────────────────────── */}
        {/* 30, not 34: at 34 these three sat within 4px of the crown's 38px hero
            and read as four equal headlines instead of one hero plus support. */}
        <StatRow style={styles.statRow}>
          <BigStat value={sessions} label="Sessions · 8 wk" size={30} />
          <BigStat value={prs.length} label="Personal records" size={30} />
          <BigStat value={achievements.length} label="Badges" size={30} />
        </StatRow>

        {/* ── 3. TOGGLE ─────────────────────────────────────── */}
        <View style={styles.toggle}>
          {(['stats', 'physique'] as const).map((tab) => (
            <PressableScale
              key={tab}
              onPress={() => setActiveTab(tab)}
              haptic="light"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === tab }}
              style={[
                styles.tab,
                activeTab === tab && { borderBottomColor: tokens.text },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? tokens.text : tokens.textTertiary },
                ]}
              >
                {tab}
              </Text>
            </PressableScale>
          ))}
        </View>
        <Hairline />

        {/* ── 4a. STATS VIEW ────────────────────────────────── */}
        {activeTab === 'stats' && (
          <View>
            {/* Volume chart */}
            <Section label="Weekly volume">
              {volumeLoading ? (
                <Skeleton
                  height={CHART_HEIGHT + 26}
                  radius={22}
                  style={{ backgroundColor: tokens.surfaceAlt }}
                />
              ) : (
                <VolumeBars data={weeklyVolume} width={width - BODY_PAD * 2} />
              )}
            </Section>

            {/* AI Weekly Summary */}
            <Section
              label="AI weekly review"
              right={<Sparkles size={13} color={tokens.textTertiary} />}
            >
              <View style={styles.aiBlock}>
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
                <PressableScale
                  onPress={handleGetSummary}
                  disabled={summaryBlocked}
                  haptic="medium"
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: summaryBlocked }}
                  // The accent fill needs a hairline of its own text-safe tone —
                  // the brand green is under 3:1 on a light page without it.
                  style={[styles.cta, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
                >
                  {summaryLoading ? (
                    // A button spinner, not a content-loading state — a skeleton
                    // here would read as a missing control.
                    <ActivityIndicator size="small" color={pa.ink} />
                  ) : (
                    <Text style={[styles.ctaText, { color: pa.ink }]}>
                      {!canGenerateSummary
                        ? 'Locked — train more'
                        : summary ? 'Refresh summary' : 'Generate summary'}
                    </Text>
                  )}
                </PressableScale>
              </View>
            </Section>

            {/* Personal Records */}
            <Section
              label="Personal records"
              right={<Trophy size={13} color={tokens.textTertiary} />}
            >
              {prsLoading ? (
                <View style={styles.skeletonStack}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton
                      key={i}
                      height={54}
                      radius={20}
                      style={{ backgroundColor: tokens.surfaceAlt }}
                    />
                  ))}
                </View>
              ) : prs.length === 0 ? (
                <Text style={styles.emptyText}>Complete workouts to set personal records.</Text>
              ) : (
                prs.slice(0, 10).map((pr, i, arr) => (
                  <ListRow
                    key={pr.id}
                    title={pr.exerciseName}
                    subtitle={new Date(pr.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    last={i === arr.length - 1}
                    right={
                      <View style={styles.prStats}>
                        <Text style={styles.prWeight}>
                          {pr.weightKg}kg × {pr.reps}
                        </Text>
                        <Text style={styles.prEstimate}>
                          ~{pr.oneRepMaxKg ?? Epley1RM(pr.weightKg, pr.reps)}kg e1RM
                        </Text>
                      </View>
                    }
                  />
                ))
              )}
            </Section>

            {/* Achievements */}
            <Section
              label="Achievements"
              right={<Award size={13} color={tokens.textTertiary} />}
            >
              {achievementsLoading ? (
                <View style={styles.achievementsGrid}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton
                      key={i}
                      height={104}
                      radius={22}
                      width="31.5%"
                      style={{ backgroundColor: tokens.surfaceAlt }}
                    />
                  ))}
                </View>
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
            </Section>
          </View>
        )}

        {/* ── 4b. PHYSIQUE VIEW ─────────────────────────────── */}
        {activeTab === 'physique' && (
          <Section label="Physique">
            <PhysiquePrivacyCard />
            <PhysiqueGallery />
          </Section>
        )}
      </SafeAreaView>
    </CanvasScreen>
  );
}

/**
 * VolumeBars — the same weekly-volume data, drawn Bold Canvas: no gridlines, no
 * per-bar labels, the current week emphasised in full ink while the history sits
 * back at the border tone.
 */
function VolumeBars({ data, width }: { data: WeeklyVolume[]; width: number }) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.emptyText}>Complete workouts to see your volume chart</Text>
      </View>
    );
  }

  const gap = 7;
  const maxVolume = Math.max(...data.map((d) => d.totalVolumeKg), 1);
  const barWidth = (width - gap * (data.length - 1)) / Math.max(data.length, 1);
  const last = data[data.length - 1];

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT + 1}>
        {data.map((d, i) => {
          const barHeight = Math.max((d.totalVolumeKg / maxVolume) * CHART_HEIGHT, 3);
          const isLast = i === data.length - 1;
          return (
            <Rect
              key={d.weekStart}
              x={i * (barWidth + gap)}
              y={CHART_HEIGHT - barHeight}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill={isLast ? tokens.text : tokens.borderStrong}
            />
          );
        })}
        <Line
          x1={0} y1={CHART_HEIGHT}
          x2={width} y2={CHART_HEIGHT}
          stroke={tokens.border} strokeWidth={1}
        />
      </Svg>
      <View style={styles.chartLegend}>
        <Text style={styles.chartAxis}>
          {data[0]?.weekLabel} — {last?.weekLabel}
        </Text>
        <Text style={styles.chartValue}>
          {Math.round(last?.totalVolumeKg ?? 0).toLocaleString()}kg · {last?.workoutCount} session
          {last?.workoutCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  crownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  crownPillText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  statRow: { marginTop: 26, marginBottom: 30 },

  toggle: { flexDirection: 'row', gap: 26 },
  tab: {
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },

  // No border: the AI review is the one filled block on the page.
  aiBlock: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 26,
    padding: 20,
  },
  summaryText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: t.text,
    marginBottom: 18,
  },
  summaryPrompt: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: t.textSecondary,
    marginBottom: 18,
  },
  cta: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.textTertiary,
    textAlign: 'center',
    paddingVertical: 20,
  },

  skeletonStack: { gap: 10 },

  prStats: { alignItems: 'flex-end', gap: 3 },
  prWeight: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  prEstimate: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  chartEmpty: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  chartAxis: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  chartValue: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },

  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achievementChip: {
    width: '31.5%',
    alignItems: 'center',
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  achievementEmoji: { fontSize: 28, marginBottom: 8 },
  achievementLabel: {
    fontFamily: Fonts.bodySemi,
    fontSize: 11,
    lineHeight: 15,
    color: t.text,
    textAlign: 'center',
  },
  achievementDate: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 5,
  },
});
