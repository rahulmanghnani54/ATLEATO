/**
 * /territory-leaderboard — global ranking by cells currently owned.
 * Anonymous handles; caller's own row pinned at the bottom if outside top 100.
 */
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  useTerritoryLeaderboard, type TerritoryLeaderRow,
} from '@/hooks/useTerritory';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export default function TerritoryLeaderboardScreen() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: rows = [], isLoading, refetch, isFetching } = useTerritoryLeaderboard(100);

  const me  = rows.find((r) => r.is_current_user);
  const top = rows.filter((r) => r.rank <= 100);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.close}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          🌍 {styleText(persona, 'TERRITORY')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={() => router.push('/territory-map' as any)}>
            <Text style={[styles.runLink, { color: persona.accent }]}>MAP</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/run' as any)}>
            <Text style={[styles.runLink, { color: persona.accent }]}>RUN →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.banner, { backgroundColor: persona.accentSoft, borderColor: persona.accent }]}>
        <Text style={[styles.bannerLabel, { color: persona.accent }]}>
          GLOBAL · CURRENT CELL OWNERSHIP
        </Text>
        <Text style={styles.bannerBody}>
          Ranked by how many 200×200m grid cells you currently own. Run
          through someone&rsquo;s cell to take it. Hold cells indefinitely
          until someone else runs through.
        </Text>
        {me && (
          <Text style={[styles.bannerYou, { color: persona.accent }]}>
            You: rank #{me.rank} · {me.cells_owned.toLocaleString()} cells
          </Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={persona.accent} style={{ marginTop: 24 }} />
      ) : top.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>
            No territories claimed yet. Be the first conqueror.
          </Text>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: persona.accent }]}
            onPress={() => router.push('/run' as any)}
            activeOpacity={0.85}
          >
            <Text style={[styles.startBtnText, { color: persona.ink }]}>
              ▶  START FIRST RUN
            </Text>
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

function Row({ row, accent }: { row: TerritoryLeaderRow; accent: string }) {
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
      </View>
      <Text style={styles.cells}>
        {row.cells_owned.toLocaleString()}<Text style={styles.unit}> cells</Text>
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
  close:   { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  runLink: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  title:   { fontFamily: Fonts.display, fontSize: 16, letterSpacing: 1 },

  banner: {
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    borderWidth: 1, borderRadius: 8,
  },
  bannerLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 6 },
  bannerBody:  { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 17 },
  bannerYou:   { fontFamily: Fonts.display, fontSize: 13, marginTop: 8, letterSpacing: 0.5 },

  emptyWrap: { paddingHorizontal: 24, marginTop: 40, alignItems: 'center', gap: 18 },
  empty:     { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  startBtn:  { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 100 },
  startBtnText: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 13, letterSpacing: 1 },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  sep: { height: 1, backgroundColor: Colors.border },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 4,
  },
  rank:   { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, width: 38 },
  handle: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text },
  cells:  { fontFamily: Fonts.display, fontSize: 16, color: Colors.text },
  unit:   { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },

  youBreak: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textTertiary, textAlign: 'center', paddingVertical: 8 },
});
