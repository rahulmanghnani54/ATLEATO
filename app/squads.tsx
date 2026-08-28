/**
 * /squads — Real multiplayer Squads (V2 plan §5 ADD #1: the moat).
 *
 * Backed by Supabase (migration 013):
 *   • 5 persona squads, one user at a time per squad
 *   • Real weekly volume leaderboard (top 20)
 *   • Anonymized handle ('Lifter #4821') — stable per (user, squad)
 *   • Realtime subscription on squad_members so leaderboard updates live
 *
 * Workouts call submitSquadVolume(totalVolumeKg) at end of session
 * (see app/post-workout.tsx).
 *
 * Bold Canvas: the crown carries the squad identity and the persona tint; the
 * light body holds the three stats and the leaderboard, which is a hairline-ruled
 * list rather than a bordered card. The squad's own colour is this screen's one
 * accent — it tints the crown, marks the LIVE badge and marks YOUR row, and is
 * spent nowhere else.
 */
import { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, RotateCw } from 'lucide-react-native';
import { BigStat, CanvasScreen, Crown, Hairline, Section, StatRow } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Fonts } from '@/constants/theme';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const BODY_PAD = 22; // matches Crown's own horizontal padding

// ---------------------------------------------------------------------------
// Static squad metadata (matches seed rows in migration 013)
// ---------------------------------------------------------------------------
interface SquadMeta {
  persona_key: string;
  name: string;
  description: string;
  tagline: string;
}

const SQUAD_META: SquadMeta[] = [
  { persona_key: 'sculptor',  name: 'The Sculptor Squad',  description: 'Aesthetic over numbers. PPL discipline.', tagline: 'Build the statue.' },
  { persona_key: 'monument',  name: 'The Monument Squad',  description: 'High volume. Pump the iron.',             tagline: 'Stay in motion.' },
  { persona_key: 'analyst',   name: 'The Analyst Squad',   description: 'Evidence-driven. RIR-tracked.',           tagline: 'Run the protocol.' },
  { persona_key: 'commander', name: 'The Commander Squad', description: 'Heavy raw intensity. No excuses.',        tagline: 'Answer the call.' },
  { persona_key: 'architect', name: 'The Architect Squad', description: 'Periodization. Volume landmarks.',        tagline: 'Grow by design.' },
];

const PROGRAM_TO_PERSONA: Record<string, string> = {
  cbum_evolved:         'sculptor',
  arnold_blueprint:     'monument',
  nippard_fundamentals: 'analyst',
  ct_strength:          'commander',
  dr_mike_mav:          'architect',
};

/**
 * A squad's colour as a token PAIR, because one hue cannot do both jobs on a
 * light page: `fill` paints the marker, `text` is the AA-safe tone the same
 * identity takes as type. Brand emerald (sculptor) is 2.54:1 on white, so its
 * marker carries the deep tone as a hairline — the marker is the only place
 * either accent is ever filled.
 */
interface SquadTone { fill: string; text: string }

function squadTone(personaKey: string, t: SemanticTokens): SquadTone {
  switch (personaKey) {
    case 'monument':  return { fill: t.warning,    text: t.warning };
    case 'analyst':   return { fill: t.info,       text: t.info };
    case 'commander': return { fill: t.danger,     text: t.danger };
    case 'architect': return { fill: t.accentText, text: t.accentText };
    default:          return { fill: t.accent,     text: t.accentText }; // sculptor
  }
}

// The crown is near-black in BOTH schemes, so its tint always resolves against
// the dark set — the light amber/blue tones go muddy on ink.
function crownTint(personaKey: string): string {
  return squadTone(personaKey, TOKENS.dark).fill;
}

// ---------------------------------------------------------------------------
// Types from RPCs
// ---------------------------------------------------------------------------
interface MySquadRow {
  squad_id: string;
  persona_key: string;
  name: string;
  accent_color: string;
  member_count: number;
  weekly_volume_kg: number;
  anon_handle: string;
}
interface LeaderRow {
  anon_handle: string;
  weekly_volume_kg: number;
  is_current_user: boolean;
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k kg`;
  return `${v} kg`;
}

/** Same text as formatVolume, split so BigStat can drop the unit off the numeral. */
function volumeParts(v: number): { value: string; unit: string } {
  return v >= 1000 ? { value: `${(v / 1000).toFixed(1)}k`, unit: 'kg' } : { value: `${v}`, unit: 'kg' };
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SquadsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const profile = useAuthStore((s) => s.profile);
  const suggestedPersona = PROGRAM_TO_PERSONA[profile?.selected_program ?? ''] ?? 'sculptor';

  const [mySquad, setMySquad] = useState<MySquadRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch user's current squad + leaderboard
  const refresh = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // BUG-FIX (squads keeps loading): the RPCs could hang on flaky networks,
      // leaving the spinner spinning forever. Race against a 10s timeout so we
      // always resolve, and surface failures with a Retry button instead of
      // an infinite loader.
      const rpcs = Promise.all([
        supabase.rpc('my_squad'),
        (supabase.rpc as any)('squad_leaderboard', { p_limit: 20 }),
      ]);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check your connection.')), 10_000),
      );
      const [mine, lb] = (await Promise.race([rpcs, timeout])) as any;
      // A Supabase RPC error (missing function, RLS denial, bad arg) returns
      // { data:null, error }. Swallowing it made squads render as a permanent
      // empty "join a squad" state — surface it so the real cause is visible.
      if (mine?.error) throw mine.error;
      if (lb?.error) throw lb.error;
      const row = (mine?.data as MySquadRow[] | null)?.[0] ?? null;
      setMySquad(row);
      setLeaderboard((lb?.data as LeaderRow[] | null) ?? []);
    } catch (e: any) {
      if (__DEV__) console.warn('Squad fetch failed:', e?.message);
      setFetchError(e?.message ?? 'Could not load squads — pull to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Live update: when ANY squadmate's row updates, refresh the leaderboard
  useEffect(() => {
    if (!mySquad?.squad_id) return;
    const channel = supabase
      .channel(`squad-${mySquad.squad_id}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'squad_members', filter: `squad_id=eq.${mySquad.squad_id}` },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mySquad?.squad_id, refresh]);

  const handleJoin = async (personaKey: string) => {
    setJoining(true);
    try {
      const { error } = await (supabase.rpc as any)('join_squad', { p_persona_key: personaKey });
      if (error) throw error;
      await refresh();
    } catch (e: any) {
      Alert.alert('Could not join squad', e?.message ?? 'Try again in a moment.');
    } finally {
      setJoining(false);
    }
  };

  // Error state — show retry instead of infinite spinner
  if (!loading && fetchError) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={40}>
        <Crown
          eyebrow="SQUADS"
          title="Squad"
          accent={crownTint(suggestedPersona)}
          onBack={() => router.back()}
        />
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Couldn't load squads</Text>
            <Text style={styles.errorBody}>{fetchError}</Text>
            <PressableScale
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Retry loading squads"
              style={styles.retryBtn}
            >
              <Text style={styles.retryTxt}>RETRY</Text>
            </PressableScale>
          </View>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  if (loading) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={40}>
        <Crown
          eyebrow="SQUADS"
          title="Squad"
          accent={crownTint(suggestedPersona)}
          onBack={() => router.back()}
        />
        {/* Shaped like the stat row and the leaderboard beneath it, so the page
            looks built while the RPCs resolve rather than flashing a spinner. */}
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <View style={styles.statSkeletons}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.statSkeletonCell}>
                <Skeleton height={28} radius={0} width="80%" />
                <Skeleton height={8} radius={0} width="60%" />
              </View>
            ))}
          </View>
          <Section label="Week leaderboard">
            <View style={styles.rowSkeletons}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={40} radius={0} />
              ))}
            </View>
          </Section>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  // Not in a squad yet → pick one
  if (!mySquad) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={40}>
        <Crown
          eyebrow="SQUADS"
          title="Join a"
          accentLine="squad."
          meta={
            'Pick a squad. Your weekly training volume contributes to the squad leaderboard. ' +
            'One squad at a time — switch any time.'
          }
          accent={crownTint(suggestedPersona)}
          onBack={() => router.back()}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Choose your squad">
            {SQUAD_META.map((s, i) => {
              const tone = squadTone(s.persona_key, tokens);
              return (
                <View key={s.persona_key}>
                  <PressableScale
                    onPress={() => handleJoin(s.persona_key)}
                    disabled={joining}
                    haptic="light"
                    scaleTo={0.98}
                    accessibilityRole="button"
                    accessibilityLabel={`Join ${s.name}. ${s.description}`}
                    style={styles.joinRow}
                  >
                    <View
                      style={[styles.joinMark, { backgroundColor: tone.fill, borderColor: tone.text }]}
                    />
                    <View style={styles.joinText}>
                      <View style={styles.joinHead}>
                        <Text style={styles.joinName} numberOfLines={2}>{s.name}</Text>
                        {s.persona_key === suggestedPersona ? (
                          <View style={[styles.suggestChip, { borderColor: tone.text }]}>
                            <Text style={[styles.suggestTxt, { color: tone.text }]}>SUGGESTED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.joinDesc}>{s.description}</Text>
                      <Text style={[styles.joinTag, { color: tone.text }]} numberOfLines={1}>
                        {s.tagline}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={tokens.textTertiary} />
                  </PressableScale>
                  {i < SQUAD_META.length - 1 ? <Hairline /> : null}
                </View>
              );
            })}
          </Section>

          {joining ? (
            <View style={styles.joiningRow}>
              <ActivityIndicator size="small" color={tokens.accent} />
              <Text style={styles.joiningTxt}>JOINING SQUAD…</Text>
            </View>
          ) : null}
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  // In a squad → show real leaderboard
  const tone = squadTone(mySquad.persona_key, tokens);
  const week = volumeParts(mySquad.weekly_volume_kg);

  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      <Crown
        eyebrow="YOUR SQUAD"
        title={mySquad.name}
        accent={crownTint(mySquad.persona_key)}
        onBack={() => router.back()}
        right={
          <PressableScale
            onPress={refresh}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Refresh leaderboard"
            hitSlop={12}
            style={styles.refreshBtn}
          >
            <RotateCw size={18} color={tokens.crownText} />
          </PressableScale>
        }
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <StatRow style={styles.stats}>
          <BigStat size={27} value={mySquad.member_count} label="MEMBERS" />
          <BigStat size={27} value={week.value} unit={week.unit} label="YOUR WEEK" />
          <BigStat size={27} value={mySquad.anon_handle.replace('Lifter #', '#')} label="YOUR HANDLE" />
        </StatRow>

        {/* Live leaderboard */}
        <Section
          label="Week leaderboard"
          right={<Text style={[styles.lbLive, { color: tone.text }]}>LIVE</Text>}
        >
          {leaderboard.length === 0 ? (
            <Text style={styles.lbEmpty}>No volume logged this week yet. Be the first.</Text>
          ) : (
            leaderboard.map((row, i) => {
              const rank = i + 1;
              const isTop = rank === 1;
              const youOnTop = row.is_current_user;
              return (
                <View key={`${row.anon_handle}-${i}`}>
                  <View style={[styles.lbRow, youOnTop && styles.lbRowYou]}>
                    <Text style={[styles.lbRank, isTop && styles.lbRankTop]}>#{rank}</Text>
                    <Text
                      style={[styles.lbName, youOnTop && { color: tone.text }]}
                      numberOfLines={1}
                    >
                      {row.anon_handle}{youOnTop ? '  (you)' : ''}
                    </Text>
                    <Text
                      style={[
                        styles.lbVol,
                        isTop && styles.lbVolTop,
                        youOnTop && { color: tone.text },
                      ]}
                    >
                      {formatVolume(row.weekly_volume_kg)}
                    </Text>
                  </View>
                  {i < leaderboard.length - 1 ? <Hairline /> : null}
                </View>
              );
            })
          )}
        </Section>

        {/* Switch squad CTA */}
        <PressableScale
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Switch squad"
          style={styles.switchBtn}
          onPress={() => {
            Alert.alert(
              'Switch squad?',
              'Your weekly volume in the current squad will reset to 0 in the new squad.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Switch',
                  onPress: () => setMySquad(null),
                },
              ],
            );
          }}
        >
          <Text style={styles.switchTxt}>SWITCH SQUAD</Text>
        </PressableScale>

        <Text style={styles.disclaim}>
          Volume = total weight × reps × sets across all workouts this week.
          Updates the moment squadmates finish a session. Resets every Monday 00:00 UTC.
        </Text>
      </SafeAreaView>
    </CanvasScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  refreshBtn: {
    padding: 9,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: t.crownLine,
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
    color: t.danger,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 23,
    backgroundColor: t.accent,
    // Brand emerald is 2.54:1 on white, so the fill's boundary is what makes the
    // control identifiable (SC 1.4.11).
    borderWidth: 1,
    borderColor: t.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryTxt: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: t.accentInk,
  },

  // ── Loading skeletons ──
  statSkeletons: { flexDirection: 'row', gap: 14, marginTop: 34 },
  statSkeletonCell: { flex: 1, gap: 9 },
  rowSkeletons: { gap: 12 },

  // ── Join list ──
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  joinMark: { width: 11, height: 11, borderRadius: 0, borderWidth: 1 },
  joinText: { flex: 1, gap: 4 },
  joinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  joinName: {
    flexShrink: 1,
    fontFamily: Fonts.displayBold,
    fontSize: 19,
    lineHeight: 23,
    // -0.03em at 19px.
    letterSpacing: -0.57,
    color: t.text,
  },
  joinDesc: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.textSecondary,
  },
  joinTag: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  suggestChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  suggestTxt: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  joiningRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 10,
  },
  joiningTxt: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: t.textTertiary,
  },

  // ── Active squad ──
  stats: { marginTop: 30 },

  // ── Leaderboard ──
  lbLive: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
  },
  lbEmpty: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: 22,
    color: t.textTertiary,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  // Bold Canvas has no card fills, so YOUR row is a full-bleed neutral plate
  // that runs past the body inset — the accent is carried by the type, not a tint.
  lbRowYou: {
    backgroundColor: t.surfaceAlt,
    marginHorizontal: -BODY_PAD,
    paddingHorizontal: BODY_PAD,
  },
  lbRank: {
    width: 28,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: t.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  lbRankTop: { color: t.text },
  lbName: {
    flex: 1,
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
  },
  lbVol: {
    fontFamily: Fonts.displayMedium,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  lbVolTop: { color: t.text },

  // ── Footer ──
  switchBtn: {
    marginTop: 34,
    paddingVertical: 17,
    borderRadius: 26,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTxt: {
    fontFamily: Fonts.legacyMono,
    fontSize: 10,
    letterSpacing: 1.8,
    color: t.textSecondary,
  },
  disclaim: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 22,
    paddingHorizontal: 12,
    color: t.textTertiary,
  },
});
