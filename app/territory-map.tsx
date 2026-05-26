/**
 * /territory-map — Live conquest map.
 *
 * Renders all currently-owned cells inside the visible viewport as colored
 * polygons over a native map:
 *   - your cells   = persona accent
 *   - other people = persona danger (red-ish, semi-transparent)
 *
 * The user's cells are drawn last so they sit on top of opponents'.
 * Centers on the user's current location on first load; falls back to a
 * sensible default (Mumbai) if location is denied.
 *
 * Performance:
 *  - We quantise the bbox in the hook so panning ~500m doesn't refetch.
 *  - We cap at 800 cells per query and render polygons (cheap on RN-maps).
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MapView, {
  PROVIDER_DEFAULT, Polygon, Marker, Region,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { useCellsInBbox, useMyTerritoryStats } from '@/hooks/useTerritory';
import { cellCorner } from '@/lib/territoryGrid';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

const CELL_DEG = 0.0018;

// Mumbai as fallback if location denied
const FALLBACK_REGION: Region = {
  latitude: 19.0760,
  longitude: 72.8777,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export default function TerritoryMapScreen() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: stats } = useMyTerritoryStats();

  const mapRef = useRef<MapView>(null);
  const [region, setRegion]   = useState<Region | null>(null);
  const [locating, setLocating] = useState(true);
  const [selected, setSelected] = useState<{ cellId: string; handle: string; mine: boolean } | null>(null);

  // Initial center on user location (graceful fallback)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') {
            setRegion(FALLBACK_REGION);
            setLocating(false);
            return;
          }
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        });
      } catch {
        setRegion(FALLBACK_REGION);
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  // Track current viewport bbox for the cells query
  const bbox = useMemo(() => {
    if (!region) return null;
    return {
      latMin: region.latitude  - region.latitudeDelta  / 2,
      latMax: region.latitude  + region.latitudeDelta  / 2,
      lonMin: region.longitude - region.longitudeDelta / 2,
      lonMax: region.longitude + region.longitudeDelta / 2,
    };
  }, [region]);

  const { data: cells = [], isFetching } = useCellsInBbox(bbox);

  // Render others first, then mine on top, so my cells are never occluded
  const orderedCells = useMemo(() => {
    const others = cells.filter((c) => !c.is_current_user);
    const mine   = cells.filter((c) =>  c.is_current_user);
    return [...others, ...mine];
  }, [cells]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.close}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          🌍 {styleText(persona, 'CONQUEST MAP')}
        </Text>
        <TouchableOpacity onPress={() => router.push('/run' as any)}>
          <Text style={[styles.runLink, { color: persona.accent }]}>RUN →</Text>
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={[styles.statsStrip, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}>
        <Stat label="YOUR CELLS" value={String(stats?.cells_owned ?? 0)} accent={persona.accent} />
        <Stat label="RANK"       value={stats?.rank ? `#${stats.rank}` : '—'} accent={persona.accent} />
        <Stat label="IN VIEW"    value={String(cells.length)} accent={persona.accent} />
      </View>

      <View style={styles.mapWrap}>
        {locating ? (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color={persona.accent} />
            <Text style={styles.muted}>Locating you…</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={StyleSheet.absoluteFill}
            initialRegion={region ?? FALLBACK_REGION}
            onRegionChangeComplete={setRegion}
            showsUserLocation
            showsMyLocationButton
            toolbarEnabled={false}
          >
            {orderedCells.map((c) => (
              <CellPolygon
                key={c.cell_id}
                cellId={c.cell_id}
                mine={c.is_current_user}
                accent={persona.accent}
                onPress={() => setSelected({
                  cellId: c.cell_id,
                  handle: c.is_current_user ? 'You' : c.anon_handle,
                  mine:   c.is_current_user,
                })}
              />
            ))}
          </MapView>
        )}
        {isFetching && !locating && (
          <View style={styles.fetchingPill}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.fetchingText}>loading cells…</Text>
          </View>
        )}
      </View>

      {/* Selected cell info card */}
      {selected && (
        <View style={[styles.selCard, selected.mine && { borderColor: persona.accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selLabel}>CELL · {selected.cellId}</Text>
            <Text style={[styles.selOwner, { color: selected.mine ? persona.accent : Colors.text }]}>
              Owned by {selected.handle}
            </Text>
            {!selected.mine && (
              <Text style={styles.selHint}>
                Run through it to take it.
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.selClose}>
            <Text style={styles.selCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={persona.accent} label="YOU" />
        <LegendDot color="#ef4444" label="OTHERS" />
      </View>
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function CellPolygon({
  cellId, mine, accent, onPress,
}: {
  cellId: string; mine: boolean; accent: string; onPress: () => void;
}) {
  const sw = cellCorner(cellId);
  const ne = { lat: sw.lat + CELL_DEG, lon: sw.lon + CELL_DEG };
  const coordinates = [
    { latitude: sw.lat, longitude: sw.lon },
    { latitude: sw.lat, longitude: ne.lon },
    { latitude: ne.lat, longitude: ne.lon },
    { latitude: ne.lat, longitude: sw.lon },
  ];
  return (
    <Polygon
      coordinates={coordinates}
      fillColor={mine ? `${accent}66` : 'rgba(239,68,68,0.32)'}
      strokeColor={mine ? accent : 'rgba(239,68,68,0.8)'}
      strokeWidth={mine ? 2 : 1}
      tappable
      onPress={onPress}
    />
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close:    { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  runLink:  { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  title:    { fontFamily: Fonts.display, fontSize: 16, letterSpacing: 1 },

  statsStrip: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1,
  },
  stat:      { flex: 1, alignItems: 'center' },
  statLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1.4 },
  statValue: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 22, letterSpacing: -0.4, marginTop: 4 },

  mapWrap:   { flex: 1, marginHorizontal: 16, marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  muted: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 1 },

  fetchingPill: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100,
  },
  fetchingText: { color: '#fff', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1 },

  selCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  selLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4 },
  selOwner: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 15, marginTop: 4, letterSpacing: -0.2 },
  selHint:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  selClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  selCloseText: { color: Colors.textSecondary, fontSize: 16 },

  legend: {
    flexDirection: 'row', gap: 16, justifyContent: 'center',
    paddingBottom: 12,
  },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch:  { width: 12, height: 12, borderRadius: 2 },
  legendText:    { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1 },
});
