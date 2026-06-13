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
  PROVIDER_DEFAULT, PROVIDER_GOOGLE, Polygon, Region,
} from 'react-native-maps';

// If a Google Maps API key is configured (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in
// .env.local + native key in app.json), use the premium Google tiles.
// Otherwise fall back to the system map provider so the screen works zero-config.
const HAS_GOOGLE_KEY = !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_PROVIDER = HAS_GOOGLE_KEY ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
import * as Location from 'expo-location';
import { useCellsInBbox, useMyTerritoryStats } from '@/hooks/useTerritory';
import { cellCorner } from '@/lib/territoryGrid';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';
import { canAccess } from '@/lib/featureGates';
import { ArrowLeft, Globe2, Flame, MapPin, X as XIcon, Play } from 'lucide-react-native';

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
  const [selected, setSelected] = useState<{ cellId: string; handle: string; mine: boolean; changes: number } | null>(null);
  const [heatmap, setHeatmap]   = useState(false);

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
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={18} color={Colors.textSecondary} />
          <Text style={styles.close}>Back</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Globe2 size={16} color={persona.accent} />
          <Text style={[styles.title, { color: persona.accent }]}>
            {styleText(persona, 'Conquest map')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/run' as any)} hitSlop={10}>
          <Text style={[styles.runLink, { color: persona.accent }]}>Run →</Text>
        </TouchableOpacity>
      </View>

      {/* Stats strip */}
      <View style={[styles.statsStrip, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}>
        <Stat label="Your cells" value={String(stats?.cells_owned ?? 0)} accent={persona.accent} />
        <Stat label="Rank"       value={stats?.rank ? `#${stats.rank}` : '—'} accent={persona.accent} />
        <Stat label="In view"    value={String(cells.length)} accent={persona.accent} />
      </View>

      <View style={styles.mapWrap}>
        {!HAS_GOOGLE_KEY ? (
          <NoMapPlaceholder
            persona={persona}
            cellsInView={cells.length}
            ownedInView={cells.filter((c) => c.is_current_user).length}
            onRun={() => router.push('/run' as any)}
          />
        ) : locating ? (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator color={persona.accent} />
            <Text style={styles.muted}>Locating you…</Text>
          </View>
        ) : !HAS_GOOGLE_KEY ? (
          // No Google Maps key configured — render a friendly placeholder
          // instead of a blank gray map. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
          // (and android.config.googleMaps.apiKey in app.json) to enable.
          <View style={[styles.mapPlaceholder, { padding: 28 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <MapPin size={16} color={persona.accent} />
              <Text style={[styles.muted, { fontSize: 14, color: persona.accent }]}>
                Territory
              </Text>
            </View>
            <Text style={[styles.muted, { textAlign: 'center', lineHeight: 20 }]}>
              Map unavailable — Google Maps API key not configured.{'\n'}
              Your run data still tracks cells; the live map activates with a key.
            </Text>
            {stats ? (
              <Text style={[styles.muted, { marginTop: 18, color: persona.accent, fontSize: 24, fontFamily: Fonts.display }]}>
                {stats.cells_owned ?? 0} cells owned
              </Text>
            ) : null}
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={MAP_PROVIDER}
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
                heatmap={heatmap}
                changeCount={c.change_count ?? 1}
                onPress={() => setSelected({
                  cellId: c.cell_id,
                  handle: c.is_current_user ? 'You' : c.anon_handle,
                  mine:   c.is_current_user,
                  changes: c.change_count ?? 1,
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

        {/* Heatmap toggle (LEGEND-tier, only meaningful when map is rendering) */}
        {HAS_GOOGLE_KEY && canAccess('territory_heatmap') && (
          <TouchableOpacity
            style={[styles.heatBtn, heatmap && { backgroundColor: persona.accent }]}
            onPress={() => setHeatmap((h) => !h)}
            activeOpacity={0.85}
          >
            <Flame size={14} color={heatmap ? persona.ink : '#fff'} fill={heatmap ? persona.ink : 'transparent'} />
            <Text style={[styles.heatBtnText, heatmap && { color: persona.ink }]}>
              {heatmap ? 'Heat on' : 'Heatmap'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selected cell info card */}
      {selected && (
        <View style={[styles.selCard, selected.mine && { borderColor: persona.accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selLabel}>Cell · {selected.cellId}</Text>
            <Text style={[styles.selOwner, { color: selected.mine ? persona.accent : Colors.text }]}>
              Owned by {selected.handle}
            </Text>
            {!selected.mine && (
              <Text style={styles.selHint}>
                Run through it to take it.{selected.changes > 1 ? ` Flipped ${selected.changes}× already.` : ''}
              </Text>
            )}
            {selected.mine && selected.changes > 1 && (
              <Text style={styles.selHint}>
                You wrestled this cell from {selected.changes - 1} other lifter{selected.changes - 1 === 1 ? '' : 's'}.
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.selClose} hitSlop={10}>
            <XIcon size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={persona.accent} label="You" />
        <LegendDot color="#ef4444" label="Others" />
      </View>

      {/* Territory Analytics — LEGEND tier */}
      {canAccess('territory_heatmap') && (
        <View style={[styles.analyticsPanel, { borderColor: persona.accent }]}>
          <Text style={[styles.analyticTitle, { color: persona.accent }]}>Territory analytics</Text>
          <View style={styles.analyticsGrid}>
            <View style={styles.analyticBox}>
              <Text style={[styles.analyticValue, { color: persona.accent }]}>{stats?.cells_owned ?? 0}</Text>
              <Text style={styles.analyticLabel}>Cells owned</Text>
            </View>
            <View style={styles.analyticDivider} />
            <View style={styles.analyticBox}>
              <Text style={[styles.analyticValue, { color: persona.accent }]}>
                {stats?.total_distance_m != null ? (stats.total_distance_m / 1000).toFixed(1) : '0'}
              </Text>
              <Text style={styles.analyticLabel}>Km conquered</Text>
            </View>
            <View style={styles.analyticDivider} />
            <View style={styles.analyticBox}>
              <Text style={[styles.analyticValue, { color: persona.accent }]}>{stats?.total_runs ?? 0}</Text>
              <Text style={styles.analyticLabel}>Runs made</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function CellPolygon({
  cellId, mine, accent, onPress, heatmap, changeCount,
}: {
  cellId: string; mine: boolean; accent: string; onPress: () => void;
  heatmap: boolean; changeCount: number;
}) {
  const sw = cellCorner(cellId);
  const ne = { lat: sw.lat + CELL_DEG, lon: sw.lon + CELL_DEG };
  const coordinates = [
    { latitude: sw.lat, longitude: sw.lon },
    { latitude: sw.lat, longitude: ne.lon },
    { latitude: ne.lat, longitude: ne.lon },
    { latitude: ne.lat, longitude: sw.lon },
  ];

  // Heatmap palette: cells that change hands a LOT glow hot. Caps at ~6 flips.
  const heatColor = (() => {
    if (!heatmap) return null;
    const t = Math.min(1, (changeCount - 1) / 5);
    // cool blue → yellow → red
    if (t < 0.5) {
      const blend = t * 2;
      const r = Math.round(70 + blend * (245 - 70));
      const g = Math.round(180 + blend * (200 - 180));
      const b = Math.round(255 - blend * 255);
      return `rgba(${r},${g},${b},0.45)`;
    } else {
      const blend = (t - 0.5) * 2;
      const r = 245;
      const g = Math.round(200 - blend * 200);
      const b = 0;
      return `rgba(${r},${g},${b},0.55)`;
    }
  })();

  const fill   = heatColor ?? (mine ? `${accent}66` : 'rgba(239,68,68,0.32)');
  const stroke = heatColor
    ? heatColor.replace(/[\d.]+\)/, '0.95)')
    : (mine ? accent : 'rgba(239,68,68,0.8)');

  return (
    <Polygon
      coordinates={coordinates}
      fillColor={fill}
      strokeColor={stroke}
      strokeWidth={mine && !heatmap ? 2 : 1}
      tappable
      onPress={onPress}
    />
  );
}

/**
 * NoMapPlaceholder — shown when Google Maps API key is not configured.
 * The territory game still works (you can run, claim cells, see your
 * stats + leaderboard), you just can't VIEW the map until a key is added.
 */
function NoMapPlaceholder({
  persona, cellsInView, ownedInView, onRun,
}: {
  persona: ReturnType<typeof personaFromProgramId>;
  cellsInView: number;
  ownedInView: number;
  onRun: () => void;
}) {
  return (
    <View style={[styles.noMapWrap, { borderColor: persona.accent }]}>
      <MapPin size={48} color={persona.accent} strokeWidth={1.5} />
      <Text style={[styles.noMapTitle, { color: persona.accent }]}>
        Map view needs setup
      </Text>
      <Text style={styles.noMapBody}>
        Add a free Google Maps API key in app.json to see the world map.
        The territory game works fine without it.
      </Text>

      <View style={styles.noMapStats}>
        <View style={styles.noMapStat}>
          <Text style={[styles.noMapStatNum, { color: persona.accent }]}>{ownedInView}</Text>
          <Text style={styles.noMapStatLabel}>Yours here</Text>
        </View>
        <View style={styles.noMapDivider} />
        <View style={styles.noMapStat}>
          <Text style={styles.noMapStatNum}>{cellsInView}</Text>
          <Text style={styles.noMapStatLabel}>Cells nearby</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.noMapBtn, { backgroundColor: persona.accent }]}
        onPress={onRun}
        activeOpacity={0.85}
      >
        <Play size={14} color={persona.ink} fill={persona.ink} />
        <Text style={[styles.noMapBtnText, { color: persona.ink }]}>Start run</Text>
      </TouchableOpacity>
    </View>
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
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  close:    { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  runLink:  { fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0.2 },
  titleWrap:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:    { fontFamily: Fonts.display, fontSize: 16, letterSpacing: -0.2 },

  statsStrip: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1,
  },
  stat:      { flex: 1, alignItems: 'center' },
  statLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2 },
  statValue: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 22, letterSpacing: -0.4, marginTop: 4 },

  mapWrap:   { flex: 1, marginHorizontal: 16, marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  muted: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.2 },

  fetchingPill: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100,
  },
  fetchingText: { color: '#fff', fontFamily: Fonts.body, fontSize: 11, letterSpacing: 0.2 },

  heatBtn: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: 'rgba(20,20,22,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  heatBtnText: {
    color: '#fff', fontFamily: Fonts.bodyBold, fontSize: 12, letterSpacing: 0.2,
  },

  // NoMapPlaceholder
  noMapWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 14,
  },
  noMapTitle: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 18, letterSpacing: -0.2 },
  noMapBody: {
    fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 17, paddingHorizontal: 12,
  },
  noMapStats: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6,
  },
  noMapStat: { alignItems: 'center' },
  noMapStatNum: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 32, color: Colors.text, letterSpacing: -0.8 },
  noMapStatLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, marginTop: 2 },
  noMapDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  noMapBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  noMapBtnText: { fontFamily: Fonts.displayMedium, fontSize: 14, letterSpacing: 0.2 },

  selCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  selLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2 },
  selOwner: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 15, marginTop: 4, letterSpacing: -0.2 },
  selHint:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  selClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  legend: {
    flexDirection: 'row', gap: 16, justifyContent: 'center',
    paddingBottom: 12,
  },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch:  { width: 12, height: 12, borderRadius: 2 },
  legendText:    { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2 },

  // Analytics panel (LEGEND tier)
  analyticsPanel: {
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderRadius: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  analyticTitle: {
    fontFamily: Fonts.displayMedium, fontSize: 13,
    letterSpacing: 0.2, marginBottom: 12, textAlign: 'center',
  },
  analyticsGrid: {
    flexDirection: 'row', alignItems: 'center',
  },
  analyticBox: {
    flex: 1, alignItems: 'center',
  },
  analyticValue: {
    fontFamily: Fonts.display, fontWeight: '800', fontSize: 28,
    letterSpacing: -0.6,
  },
  analyticLabel: {
    fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary,
    letterSpacing: 0.2, marginTop: 4,
  },
  analyticDivider: {
    width: 1, height: 40, backgroundColor: Colors.border,
  },
});
