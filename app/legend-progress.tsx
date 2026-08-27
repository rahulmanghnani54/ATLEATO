/**
 * /legend-progress — the XP ladder for the chosen coach's path.
 *
 * Bold Canvas: the crown carries the whole hero — the XP total as the oversized
 * numeral, the rank name on the accent line, and the run to the next rank as a
 * slim ledger track instead of a ring. The light body is two hairline-ruled
 * lists and nothing else: where XP comes from, and where the ladder goes next.
 *
 * The RANK colour, not the persona accent, is this screen's one accent — it is
 * the value that actually moves. The persona accent only stands in while the
 * rank is still unknown (loading / failed load), exactly as it did before.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CanvasScreen, Crown, Hairline, ListRow, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import {
  getLevel, getMilestones, XP_AWARDS,
  type LevelInfo, type LevelName,
} from '@/lib/legendProgression';

const BODY_PAD = 22; // matches Crown's own horizontal padding

/**
 * Rank colours resolved against one scheme's tokens. The crown is near-black in
 * BOTH schemes, so it always reads the DARK set — the light amber/blue tones go
 * muddy on ink, the same reason the persona tint is resolved dark up there.
 */
function levelColors(t: SemanticTokens): Record<LevelName, string> {
  return {
    Rookie:  t.textSecondary,
    Grinder: t.warning,
    Athlete: t.info,
    Elite:   t.success,
    Legend:  t.accent,
  };
}

export default function LegendProgressScreen() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useAuthStore();
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  const accentColor = pa.accent;

  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'done'>('loading');
  const milestones = levelInfo ? getMilestones(levelInfo.xp) : [];

  // Explicit loading/error states: without them a failed RPC left this screen
  // permanently half-empty (header + label, no ring, no explanation).
  const load = useCallback(() => {
    setLoadState('loading');
    getLevel(persona.id)
      .then((info) => { setLevelInfo(info); setLoadState('done'); })
      .catch(() => setLoadState('error'));
  }, [persona.id]);

  useEffect(() => { load(); }, [load]);

  const bodyLevels = levelColors(tokens);
  const crownColor = levelInfo
    ? levelColors(TOKENS.dark)[levelInfo.level]
    : personaAccent(persona, 'dark').accent;

  const pct = levelInfo ? Math.round(levelInfo.progress * 100) : 0;
  const trackWidth: DimensionValue = `${pct}%`;

  // XP breakdown estimates (stored in a simple breakdown key if available, otherwise shown as guide)
  const XP_SOURCE_LABELS = [
    { label: 'WORKOUTS COMPLETED', icon: '🏋️', xpEach: XP_AWARDS.workout,          sub: `+${XP_AWARDS.workout} XP each` },
    { label: 'STREAK MILESTONES',  icon: '🔥', xpEach: XP_AWARDS.streak_milestone,  sub: `+${XP_AWARDS.streak_milestone} XP per 7 days` },
    { label: 'PERSONAL RECORDS',   icon: '🏆', xpEach: XP_AWARDS.pr,                sub: `+${XP_AWARDS.pr} XP per PR` },
  ];

  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      {/* ── CROWN — XP is the one hero numeral on this screen ── */}
      <Crown
        eyebrow={`LEGEND PROGRESS · ${persona.shortName} PATH`}
        title={levelInfo ? levelInfo.xp.toLocaleString() : '—'}
        accentLine={levelInfo ? `XP · ${levelInfo.level.toUpperCase()}` : undefined}
        meta={levelInfo ? levelInfo.persona_title.toUpperCase() : undefined}
        accent={crownColor}
        onBack={() => router.back()}
      >
        {levelInfo && levelInfo.level !== 'Legend' ? (
          <View style={styles.crownBlock}>
            <View style={styles.crownRow}>
              <Text style={styles.crownLabel}>NEXT LEVEL</Text>
              <Text style={styles.crownPct}>{pct}%</Text>
            </View>
            <View style={styles.crownTrack}>
              <View style={[styles.crownFill, { width: trackWidth, backgroundColor: crownColor }]} />
            </View>
            <Text style={styles.crownMeta}>
              {(levelInfo.nextThreshold - levelInfo.xp).toLocaleString()} XP to go
            </Text>
          </View>
        ) : null}

        {levelInfo && levelInfo.level === 'Legend' ? (
          <View style={styles.crownBlock}>
            <Text style={[styles.crownLabel, { color: crownColor }]}>👑 MAX RANK REACHED</Text>
            <Text style={styles.crownMeta}>You've reached the top. True legend status.</Text>
          </View>
        ) : null}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* ── Load failure — the retry is the only action, so it takes the fill ── */}
        {loadState === 'error' && !levelInfo ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Couldn't load your progress</Text>
            <Text style={styles.errorBody}>Check your connection and try again.</Text>
            <PressableScale
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry loading your progress"
              // The persona accent is under 3:1 on white, so the fill carries the
              // persona's deeper tone as its edge — same rule as the day cells.
              style={[styles.retryBtn, { backgroundColor: accentColor, borderColor: pa.accentText }]}
            >
              <Text style={[styles.retryText, { color: pa.ink }]}>RETRY</Text>
            </PressableScale>
          </View>
        ) : null}

        <Section label="How to earn XP">
          {XP_SOURCE_LABELS.map((src, i) => (
            <ListRow
              key={src.label}
              title={`${src.icon}  ${src.label}`}
              subtitle={src.sub}
              last={i === XP_SOURCE_LABELS.length - 1}
              right={<Text style={styles.xpAmount}>+{src.xpEach}</Text>}
            />
          ))}
        </Section>

        <Section label="Milestones">
          {milestones.length === 0 && loadState === 'loading' ? (
            /* Shaped like the four rank rows, so the ladder looks built while
               getLevel() resolves rather than flashing an empty column. */
            <View style={styles.loading}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={46} radius={0} />
              ))}
            </View>
          ) : (
            milestones.map((m, i) => {
              const rank = bodyLevels[m.level];
              // The Legend marker IS the brand accent, only 2.54:1 on white, so
              // it takes the accent hairline; the other ranks take a neutral one.
              const edge = m.level === 'Legend' ? tokens.accentLine : tokens.borderStrong;
              return (
                <View key={m.level}>
                  <View style={styles.milestoneRow}>
                    <View
                      style={[
                        styles.milestoneMark,
                        m.reached
                          ? { backgroundColor: rank, borderWidth: 1, borderColor: edge }
                          : { backgroundColor: tokens.border },
                      ]}
                    />
                    <View style={styles.milestoneText}>
                      <Text style={[styles.milestoneName, m.reached && { color: rank }]} numberOfLines={1}>
                        {m.level.toUpperCase()}
                      </Text>
                      <Text style={styles.milestoneSub} numberOfLines={1}>
                        {m.reached
                          ? '✓ Reached'
                          : `${m.xpNeeded.toLocaleString()} XP needed`}
                      </Text>
                    </View>
                    <View style={styles.milestoneValue}>
                      <Text style={[styles.milestoneThreshold, m.reached && { color: rank }]}>
                        {m.threshold.toLocaleString()}
                      </Text>
                      <Text style={styles.milestoneUnit}>XP</Text>
                    </View>
                  </View>
                  {i < milestones.length - 1 ? <Hairline /> : null}
                </View>
              );
            })
          )}
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown progress — a slim ledger track, square-cornered like the grids ──
  crownBlock: { marginTop: 22 },
  crownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  crownLabel: {
    flexShrink: 1,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  crownPct: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: t.crownText,
    fontVariant: ['tabular-nums'],
  },
  crownTrack: {
    height: 5,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: t.crownLine,
  },
  crownFill: { height: '100%' },
  crownMeta: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 9,
    color: t.crownTextDim,
  },

  // ── Load-failure state ──
  errorBox: { marginTop: 34 },
  errorTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 31,
    // -0.04em at 27px.
    letterSpacing: -1.08,
    color: t.text,
  },
  errorBody: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    color: t.textSecondary,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 20,
    height: 46,
    paddingHorizontal: 30,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  // ── XP sources ──
  xpAmount: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    letterSpacing: -1.08,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },

  // ── Milestones ──
  loading: { gap: 12 },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  milestoneMark: { width: 11, height: 11, borderRadius: 0 },
  milestoneText: { flex: 1, gap: 3 },
  milestoneName: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    letterSpacing: 0.6,
    color: t.textSecondary,
  },
  milestoneSub: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: t.textTertiary,
  },
  milestoneValue: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  milestoneThreshold: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 28,
    letterSpacing: -1.08,
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  milestoneUnit: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    color: t.textTertiary,
    paddingBottom: 4,
  },
});
