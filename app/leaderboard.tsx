/**
 * /leaderboard — full global weekly leaderboard.
 *
 * Anonymous handles (Lifter #1234). User's own row is highlighted in the
 * persona accent and stays pinned at the bottom if they're outside the top.
 */
import { useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { canAccess } from '@/lib/featureGates';
import { useGlobalLeaderboard, type LeaderboardRow } from '@/hooks/useGlobalLeaderboard';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export default function LeaderboardScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!canAccess('reward_chests')) {
      router.replace('/paywall?feature=reward_chests' as any);
    }
  }, []);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: rows = [], isLoading, refetch, isFetching, isError } = useGlobalLeaderboard(100);

  const me = rows.find((r) => r.is_current_user);
  const top = rows.filter((r) => r.rank <= 100);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.close}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          {styleText(persona, 'WEEKLY LEADERBOARD')}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={[styles.banner, { backgroundColor: persona.accentSoft, borderColor: persona.accent }]}>
        <Text style={[styles.bannerLabel, { color: persona.accent }]}>GLOBAL · THIS WEEK · ANONYMOUS</Text>
        <Text style={styles.bannerBody}>
          Ranked by total weight moved (kg) Monday → Sunday. Names hidden — only
          your "Lifter #" handle is shown. Resets every Monday at midnight.
        </Text>
        {me && (
          <Text style={[styles.bannerYou, { color: persona.accent }]}>
            You are ranked #{me.rank} · {me.volume_kg.toLocaleString()} kg
          </Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={persona.accent} style={{ marginTop: 24 }} />
      ) : isError ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Couldn't load the leaderboard</Text>
          <Text style={styles.empty}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: persona.accent }]}
            onPress={() => refetch()}
            activeOpacity={0.85}
          >
            <Text style={[styles.emptyBtnText, { color: persona.ink }]}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : top.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>Fresh board — resets every Monday</Text>
          <Text style={styles.empty}>
            No lifts logged yet this week. One workout puts you at #1.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: persona.accent }]}
            onPress={() => router.push('/(tabs)/workouts' as any)}
            activeOpacity={0.85}
          >
            <Text style={[styles.emptyBtnText, { color: persona.ink }]}>LOG TODAY'S WORKOUT →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={top}
          keyExtractor={(r) => String(r.rank)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Row row={item} accent={persona.accent} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshing={isFetching}
          onRefresh={refetch}
          ListFooterComponent={
            me && me.rank > 100 ? (
              <View>
                <View style={styles.sep} />
                <Text style={styles.youBreak}>· · ·</Text>
                <View style={styles.sep} />
                <Row row={me} accent={persona.accent} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ row, accent }: { row: LeaderboardRow; accent: string }) {
  const medal =
    row.rank === 1 ? '🥇' :
    row.rank === 2 ? '🥈' :
    row.rank === 3 ? '🥉' : `#${row.rank}`;
  return (
    <View style={[styles.row, row.is_current_user && { backgroundColor: `${accent}1a` }]}>
      <Text style={[styles.rank, row.rank <= 3 && { fontSize: 18 }]}>{medal}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.handle,
          row.is_current_user && { color: accent, fontFamily: Fonts.bodySemi },
        ]}>
          {row.is_current_user ? 'You' : row.anon_handle}
        </Text>
        <Text style={styles.meta}>{row.sessions} session{row.sessions === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.volume}>
        {row.volume_kg.toLocaleString()}<Text style={styles.unit}> kg</Text>
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

  banner: {
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    borderWidth: 1, borderRadius: 8,
  },
  bannerLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 6 },
  bannerBody:  { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 17 },
  bannerYou:   { fontFamily: Fonts.display, fontSize: 13, marginTop: 8, letterSpacing: 0.5 },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  sep: { height: 1, backgroundColor: Colors.border },
  empty: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  emptyWrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 32, gap: 8 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontFamily: Fonts.displayMedium, fontSize: 16, color: Colors.text, textAlign: 'center' },
  emptyBtn: { marginTop: 12, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 8 },
  emptyBtnText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 4,
  },
  rank:   { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, width: 38 },
  handle: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text },
  meta:   { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.8 },
  volume: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
  unit:   { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },

  youBreak: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textTertiary, textAlign: 'center', paddingVertical: 8 },
});
