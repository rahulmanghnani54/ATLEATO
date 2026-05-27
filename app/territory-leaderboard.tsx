/**
 * /territory-leaderboard — global ranking by cells currently owned.
 * Anonymous handles; caller's own row pinned at the bottom if outside top 100.
 */
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import {
  useTerritoryLeaderboard, useNearbyLeaderboard,
  type TerritoryLeaderRow,
} from '@/hooks/useTerritory';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

const NEARBY_RADIUS_DEG = 0.09; // ~10km

export default function TerritoryLeaderboardScreen() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const [tab, setTab] = useState<'global' | 'nearby'>('global');

  const { data: rows = [], isLoading, refetch, isFetching } = useTerritoryLeaderboard(100);

  // Nearby tab: only fetch location + nearby cells when user opens that tab
  const [nearbyBbox, setNearbyBbox] = useState<{ latMin: number; latMax: number; lonMin: number; lonMax: number } | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== 'nearby' || nearbyBbox) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setNearbyError('Location permission required for nearby leaderboard.');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setNearbyBbox({
          latMin: loc.coords.latitude  - NEARBY_RADIUS_DEG,
          latMax: loc.coords.latitude  + NEARBY_RADIUS_DEG,
          lonMin: loc.coords.longitude - NEARBY_RADIUS_DEG,
          lonMax: loc.coords.longitude + NEARBY_RADIUS_DEG,
        });
      } catch (e: any) {
        setNearbyError(e?.message ?? 'Could not get your location.');
      }
    })();
  }, [tab, nearbyBbox]);
  const { data: nearbyRows = [], isLoading: nearbyLoading } = useNearbyLeaderboard(nearbyBbox);

  const sourceRows = tab === 'global' ? rows : nearbyRows;
  const loading    = tab === 'global' ? isLoading : nearbyLoading;
  const me  = sourceRows.find((r) => r.is_current_user);
  const top = sourceRows.filter((r) => r.rank <= 100);

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

      {/* Tab switcher: Global / Nearby */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'global' && { backgroundColor: persona.accent }]}
          onPress={() => setTab('global')}
        >
          <Text style={[styles.tabText, tab === 'global' && { color: persona.ink }]}>
            🌍 GLOBAL
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'nearby' && { backgroundColor: persona.accent }]}
          onPress={() => setTab('nearby')}
        >
          <Text style={[styles.tabText, tab === 'nearby' && { color: persona.ink }]}>
            📍 NEARBY
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.banner, { backgroundColor: persona.accentSoft, borderColor: persona.accent }]}>
        <Text style={[styles.bannerLabel, { color: persona.accent }]}>
          {tab === 'global' ? 'GLOBAL · CURRENT CELL OWNERSHIP' : 'NEARBY · ~10KM RADIUS'}
        </Text>
        <Text style={styles.bannerBody}>
          {tab === 'global'
            ? 'Ranked by how many 200×200m grid cells you currently own anywhere in the world.'
            : 'Ranked by cells owned within ~10km of your current location. Beat your local rivals.'}
        </Text>
        {tab === 'nearby' && nearbyError && (
          <Text style={[styles.bannerBody, { color: Colors.danger, marginTop: 6 }]}>{nearbyError}</Text>
        )}
        {me && (
          <Text style={[styles.bannerYou, { color: persona.accent }]}>
            You: rank #{me.rank} · {me.cells_owned.toLocaleString()} cells
          </Text>
        )}
      </View>

      {loading ? (
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

  // Tab switcher
  tabBar: {
    flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 12,
    padding: 4, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 100, alignItems: 'center',
  },
  tabText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1.4, fontWeight: '700' },

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
