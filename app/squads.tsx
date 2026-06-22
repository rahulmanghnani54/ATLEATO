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
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Static squad metadata (matches seed rows in migration 013)
// ---------------------------------------------------------------------------
interface SquadMeta {
  persona_key: string;
  name: string;
  description: string;
  accent: string;
  tagline: string;
}

const SQUAD_META: SquadMeta[] = [
  { persona_key: 'sculptor',  name: 'The Sculptor Squad',  accent: '#dfff1f', description: 'Aesthetic over numbers. PPL discipline.', tagline: 'Build the statue.' },
  { persona_key: 'monument',  name: 'The Monument Squad',  accent: '#f5b942', description: 'High volume. Pump the iron.',             tagline: 'Stay in motion.' },
  { persona_key: 'analyst',   name: 'The Analyst Squad',   accent: '#5DD3FA', description: 'Evidence-driven. RIR-tracked.',           tagline: 'Run the protocol.' },
  { persona_key: 'commander', name: 'The Commander Squad', accent: '#ef4444', description: 'Heavy raw intensity. No excuses.',        tagline: 'Answer the call.' },
  { persona_key: 'architect', name: 'The Architect Squad', accent: '#7be38c', description: 'Periodization. Volume landmarks.',         tagline: 'Grow by design.' },
];

const PROGRAM_TO_PERSONA: Record<string, string> = {
  cbum_evolved:         'sculptor',
  arnold_blueprint:     'monument',
  nippard_fundamentals: 'analyst',
  ct_strength:          'commander',
  dr_mike_mav:          'architect',
};

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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SquadsScreen() {
  const router = useRouter();
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
      const [{ data: squadData }, { data: lbData }] = (await Promise.race([rpcs, timeout])) as any;
      const row = (squadData as MySquadRow[] | null)?.[0] ?? null;
      setMySquad(row);
      setLeaderboard((lbData as LeaderRow[] | null) ?? []);
    } catch (e: any) {
      console.warn('Squad fetch failed:', e?.message);
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={[styles.loadingTxt, { color: Colors.error, marginBottom: 14, textAlign: 'center', paddingHorizontal: 24 }]}>
            {fetchError}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: Radius.md }}
          >
            <Text style={{ fontFamily: Fonts.display, color: Colors.ink, fontSize: 13, letterSpacing: 1 }}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingTxt}>Loading squad…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not in a squad yet → pick one
  if (!mySquad) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>JOIN A SQUAD</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.intro}>
            Pick a squad. Your weekly training volume contributes to the squad leaderboard.
            One squad at a time — switch any time.
          </Text>
          {SQUAD_META.map((s) => (
            <TouchableOpacity
              key={s.persona_key}
              style={[styles.joinCard, { borderColor: s.accent }]}
              onPress={() => handleJoin(s.persona_key)}
              disabled={joining}
              activeOpacity={0.8}
            >
              <View style={[styles.joinAccentBar, { backgroundColor: s.accent }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.joinHead}>
                  <Text style={[styles.joinName, { color: s.accent }]}>{s.name.toUpperCase()}</Text>
                  {s.persona_key === suggestedPersona ? (
                    <View style={[styles.suggestChip, { borderColor: s.accent }]}>
                      <Text style={[styles.suggestTxt, { color: s.accent }]}>SUGGESTED</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.joinDesc}>{s.description}</Text>
                <Text style={[styles.joinTag, { color: s.accent }]}>{s.tagline}</Text>
              </View>
              <Text style={[styles.joinArrow, { color: s.accent }]}>→</Text>
            </TouchableOpacity>
          ))}
          {joining ? (
            <View style={styles.joiningRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.joiningTxt}>Joining squad…</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // In a squad → show real leaderboard
  const accent = mySquad.accent_color;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SQUAD</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Text style={[styles.refreshTxt, { color: accent }]}>↻</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Squad header card */}
        <View style={[styles.squadCard, { borderColor: accent }]}>
          <View style={[styles.squadAccentBar, { backgroundColor: accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.squadName, { color: accent }]}>{mySquad.name.toUpperCase()}</Text>
            <View style={styles.squadStats}>
              <View style={styles.statBlock}>
                <Text style={[styles.statNum, { color: accent }]}>{mySquad.member_count.toLocaleString()}</Text>
                <Text style={styles.statLbl}>MEMBERS</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={[styles.statNum, { color: accent }]}>{formatVolume(mySquad.weekly_volume_kg)}</Text>
                <Text style={styles.statLbl}>YOUR WEEK</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={[styles.statNum, { color: accent }]}>{mySquad.anon_handle.replace('Lifter #', '#')}</Text>
                <Text style={styles.statLbl}>YOUR HANDLE</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Live leaderboard */}
        <View style={styles.leaderboard}>
          <View style={styles.lbHead}>
            <Text style={styles.lbTitle}>● WEEK LEADERBOARD</Text>
            <Text style={[styles.lbLive, { color: accent }]}>LIVE</Text>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={styles.lbEmpty}>No volume logged this week yet. Be the first.</Text>
          ) : (
            leaderboard.map((row, i) => {
              const rank = i + 1;
              const isTop = rank === 1;
              const youOnTop = row.is_current_user;
              return (
                <View key={`${row.anon_handle}-${i}`}
                      style={[styles.lbRow, youOnTop && { backgroundColor: `${accent}14` }]}>
                  <Text style={[styles.lbRank, isTop && { color: accent }]}>#{rank}</Text>
                  <Text style={[styles.lbName, youOnTop && { color: accent, fontWeight: '700' }]}>
                    {row.anon_handle}{youOnTop ? '  (you)' : ''}
                  </Text>
                  <Text style={[styles.lbVol, isTop && { color: accent }]}>{formatVolume(row.weekly_volume_kg)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Switch squad CTA */}
        <TouchableOpacity
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
        </TouchableOpacity>

        <Text style={styles.disclaim}>
          Volume = total weight × reps × sets across all workouts this week.
          Updates the moment squadmates finish a session. Resets every Monday 00:00 UTC.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { marginTop: 12, color: Colors.textSecondary, fontFamily: Fonts.body, fontSize: 13 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 2, color: Colors.text },
  refreshBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  refreshTxt: { fontSize: 22 },

  scroll: { padding: Spacing.md, paddingBottom: 80 },
  intro: { color: Colors.textSecondary, fontSize: 13, marginBottom: 18, lineHeight: 18, fontFamily: Fonts.body },

  // Join cards
  joinCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: Radius.lg, padding: 16, marginBottom: 10,
    backgroundColor: Colors.surface,
  },
  joinAccentBar: { width: 4, height: '100%', borderRadius: 2, marginRight: 14 },
  joinHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  joinName: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 1 },
  joinDesc: { color: Colors.textSecondary, fontSize: 12, marginBottom: 4, fontFamily: Fonts.body },
  joinTag: { fontSize: 11, fontFamily: Fonts.mono, letterSpacing: 1, textTransform: 'uppercase' },
  joinArrow: { fontSize: 22, marginLeft: 10 },
  suggestChip: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  suggestTxt: { fontSize: 8, fontFamily: Fonts.mono, letterSpacing: 1.5 },
  joiningRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18, gap: 8 },
  joiningTxt: { color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.body },

  // Active-squad card
  squadCard: {
    flexDirection: 'row', borderWidth: 1.5, borderRadius: Radius.lg,
    padding: 18, marginBottom: 18, backgroundColor: Colors.surface,
  },
  squadAccentBar: { width: 4, borderRadius: 2, marginRight: 14 },
  squadName: { fontFamily: Fonts.display, fontSize: 18, letterSpacing: 1, marginBottom: 14 },
  squadStats: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  statBlock: { minWidth: 70 },
  statNum: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 22 },
  statLbl: { fontSize: 9, fontFamily: Fonts.mono, letterSpacing: 1.2, color: Colors.textTertiary, marginTop: 4, textTransform: 'uppercase' },

  // Leaderboard
  leaderboard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: 14, marginBottom: 14,
  },
  lbHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  lbTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.5 },
  lbLive: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 2 },
  lbEmpty: { color: Colors.textTertiary, fontSize: 12, textAlign: 'center', padding: 14, fontFamily: Fonts.body },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: Radius.sm },
  lbRank: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, width: 30, letterSpacing: 0.5 },
  lbName: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text, flex: 1 },
  lbVol: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 },

  switchBtn: {
    backgroundColor: Colors.raised, borderRadius: Radius.lg,
    paddingVertical: 14, alignItems: 'center', marginBottom: 18,
  },
  switchTxt: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 2 },

  disclaim: { color: Colors.textTertiary, fontSize: 10.5, lineHeight: 16, textAlign: 'center', fontFamily: Fonts.body, paddingHorizontal: 12 },
});
