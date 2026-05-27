/**
 * /run — Live run tracker for territory conquest
 *
 * Flow:
 *   READY → user grants location → tap START
 *   ↓
 *   TRACKING → live distance + cells claimed counter, "STOP" button
 *   ↓
 *   FINISHED → summary screen → "POST RUN" submits to Supabase
 *
 * GPS is sampled every 3 seconds while tracking. Each waypoint is rolled
 * into the cells-touched set in-memory. On stop, we send the unique cell
 * IDs + total distance to the `claim_cells` RPC.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, {
  PROVIDER_DEFAULT, PROVIDER_GOOGLE, Polyline, Polygon, Region,
} from 'react-native-maps';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';
import {
  cellIdForPoint, cellCorner, distanceMeters, type LatLon,
} from '@/lib/territoryGrid';
import { claimCells } from '@/hooks/useTerritory';

const CELL_DEG = 0.0018;
const HAS_GOOGLE_KEY = !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_PROVIDER   = HAS_GOOGLE_KEY ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

type Phase = 'ready' | 'requesting' | 'tracking' | 'finished';

export default function RunScreen() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const [phase, setPhase]               = useState<Phase>('ready');
  const [permError, setPermError]       = useState<string | null>(null);
  const [distanceM, setDistanceM]       = useState(0);
  const [elapsedSec, setElapsedSec]     = useState(0);
  const [cellsTouched, setCellsTouched] = useState(0);
  const [submitting, setSubmitting]     = useState(false);

  // Live map state — mirrors trackRef/cellsRef so the map can render them
  const [route, setRoute]       = useState<LatLon[]>([]);
  const [cellList, setCellList] = useState<string[]>([]);
  const [currentPos, setCurrentPos] = useState<LatLon | null>(null);

  // Refs so the GPS callback doesn't re-create on every state change
  const trackRef     = useRef<LatLon[]>([]);
  const cellsRef     = useRef<Set<string>>(new Set());
  const startedAtRef = useRef<number>(0);
  const distanceRef  = useRef<number>(0);
  const subRef       = useRef<Location.LocationSubscription | null>(null);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef       = useRef<MapView>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop watching + clear interval
      subRef.current?.remove();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const requestAndStart = async () => {
    setPhase('requesting');
    setPermError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermError('Location permission is required to track your run.');
        setPhase('ready');
        return;
      }

      // Reset counters
      trackRef.current  = [];
      cellsRef.current  = new Set();
      distanceRef.current = 0;
      setDistanceM(0);
      setCellsTouched(0);
      setElapsedSec(0);
      setRoute([]);
      setCellList([]);
      setCurrentPos(null);
      startedAtRef.current = Date.now();

      // Seed the map at the user's first known position so the camera doesn't
      // start in the middle of the ocean while waiting for the first GPS fix.
      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const fp = { lat: first.coords.latitude, lon: first.coords.longitude };
        setCurrentPos(fp);
      } catch {/* best effort */}

      // Begin GPS watch (3s cadence, accept fixes within 5m for new sample)
      subRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => {
          const p: LatLon = { lat: loc.coords.latitude, lon: loc.coords.longitude };
          const prev = trackRef.current[trackRef.current.length - 1];
          if (prev) distanceRef.current += distanceMeters(prev, p);
          trackRef.current.push(p);
          cellsRef.current.add(cellIdForPoint(p));
          setDistanceM(distanceRef.current);
          setCellsTouched(cellsRef.current.size);
          // Mirror to state so the map re-renders the live route
          setRoute([...trackRef.current]);
          setCellList(Array.from(cellsRef.current));
          setCurrentPos(p);
          // Keep camera following the user
          mapRef.current?.animateCamera(
            { center: { latitude: p.lat, longitude: p.lon } },
            { duration: 500 },
          );
        },
      );

      // Elapsed timer
      tickRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);

      setPhase('tracking');
    } catch (e: any) {
      setPermError(e?.message ?? 'Could not start location.');
      setPhase('ready');
    }
  };

  const stopRun = () => {
    subRef.current?.remove(); subRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    setPhase('finished');
  };

  const submitRun = async () => {
    setSubmitting(true);
    try {
      const cellIds = Array.from(cellsRef.current);
      const result = await claimCells(cellIds, distanceRef.current);
      Alert.alert(
        '🏁 Run posted',
        `Claimed ${result.cells_new} new cell${result.cells_new === 1 ? '' : 's'}.` +
        (result.cells_stolen > 0
          ? `\nStole ${result.cells_stolen} from other lifters. 👑`
          : ''),
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Could not post run', e?.message ?? 'Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const km     = (distanceM / 1000).toFixed(2);
  const pace   = distanceM > 50
    ? formatPace(elapsedSec / (distanceM / 1000))
    : '—';
  const mmss   = formatTime(elapsedSec);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} disabled={phase === 'tracking'}>
          <Text style={[styles.close, phase === 'tracking' && { opacity: 0.3 }]}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          {styleText(persona, 'TERRITORY RUN')}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.body}>
        {phase === 'ready' && (
          <View style={styles.center}>
            <Text style={styles.hero}>🌍</Text>
            <Text style={styles.headline}>
              Conquer the streets.
            </Text>
            <Text style={styles.tagline}>
              Run anywhere — every 200×200m cell you touch becomes yours.
              Lose it the moment someone else runs through it.
            </Text>
            {permError && <Text style={styles.errorMsg}>{permError}</Text>}
            <TouchableOpacity
              style={[styles.bigBtn, { backgroundColor: persona.accent }]}
              onPress={requestAndStart}
              activeOpacity={0.85}
            >
              <Text style={[styles.bigBtnText, { color: persona.ink }]}>
                ▶  START RUN
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'requesting' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={persona.accent} />
            <Text style={styles.tagline}>Getting your location…</Text>
          </View>
        )}

        {phase === 'tracking' && (
          <View style={styles.tracking}>
            {/* Live route map — top half of viewport (only if map available) */}
            {HAS_GOOGLE_KEY ? (
              <View style={styles.mapWrap}>
                {currentPos ? (
                  <MapView
                    ref={mapRef}
                    provider={MAP_PROVIDER}
                    style={StyleSheet.absoluteFill}
                    initialRegion={{
                      latitude: currentPos.lat,
                      longitude: currentPos.lon,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    }}
                    showsUserLocation
                    showsMyLocationButton={false}
                    followsUserLocation
                    toolbarEnabled={false}
                  >
                    {route.length > 1 && (
                      <Polyline
                        coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
                        strokeColor={persona.accent}
                        strokeWidth={5}
                        lineCap="round"
                        lineJoin="round"
                      />
                    )}
                    {cellList.map((cid) => (
                      <CellSquare key={cid} cellId={cid} accent={persona.accent} />
                    ))}
                  </MapView>
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator color={persona.accent} />
                    <Text style={styles.muted}>Locking onto GPS…</Text>
                  </View>
                )}
              </View>
            ) : (
              /* No Google Maps key — show a big live "cells claimed" hero */
              <View style={[styles.bigClaimHero, { borderColor: persona.accent }]}>
                <Text style={styles.statLabel}>CELLS CLAIMED · LIVE</Text>
                <Text style={[styles.bigClaimNum, { color: persona.accent }]}>{cellsTouched}</Text>
                <Text style={styles.bigClaimSub}>
                  {currentPos ? '📡 GPS locked · keep moving' : '📡 Locking onto GPS…'}
                </Text>
                <Text style={styles.bigClaimHint}>
                  Live map needs a Google Maps API key in app.json.
                </Text>
              </View>
            )}

            {/* Compact stats row */}
            <View style={styles.compactStats}>
              <View style={styles.compactStat}>
                <Text style={styles.statLabel}>CELLS</Text>
                <Text style={[styles.compactBig, { color: persona.accent }]}>{cellsTouched}</Text>
              </View>
              <View style={styles.compactStat}>
                <Text style={styles.statLabel}>KM</Text>
                <Text style={styles.compactBig}>{km}</Text>
              </View>
              <View style={styles.compactStat}>
                <Text style={styles.statLabel}>TIME</Text>
                <Text style={styles.compactBig}>{mmss}</Text>
              </View>
              <View style={styles.compactStat}>
                <Text style={styles.statLabel}>PACE</Text>
                <Text style={styles.compactBig}>{pace}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.bigBtn, styles.stopBtn]}
              onPress={stopRun}
              activeOpacity={0.85}
            >
              <Text style={styles.bigBtnText}>■  STOP RUN</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'finished' && (
          <View style={styles.tracking}>
            {/* Full route review map (only if Google Maps configured) */}
            {HAS_GOOGLE_KEY && route.length > 1 && currentPos && (
              <View style={styles.mapWrap}>
                <MapView
                  provider={MAP_PROVIDER}
                  style={StyleSheet.absoluteFill}
                  initialRegion={fitRegion(route)}
                  showsUserLocation={false}
                  toolbarEnabled={false}
                  scrollEnabled
                  zoomEnabled
                >
                  <Polyline
                    coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
                    strokeColor={persona.accent}
                    strokeWidth={5}
                    lineCap="round"
                  />
                  {cellList.map((cid) => (
                    <CellSquare key={cid} cellId={cid} accent={persona.accent} />
                  ))}
                </MapView>
              </View>
            )}

            <Text style={styles.finishHead}>
              {cellsTouched > 0 ? "🏁 Run complete." : "🏁 Run too short."}
            </Text>
            <View style={[styles.statBlock, { borderColor: persona.accent }]}>
              <Text style={styles.statLabel}>CELLS TO CLAIM</Text>
              <Text style={[styles.statBigNum, { color: persona.accent }]}>{cellsTouched}</Text>
              <Text style={styles.finishMeta}>
                {km} km · {mmss} · pace {pace}/km
              </Text>
            </View>

            {cellsTouched > 0 ? (
              <TouchableOpacity
                style={[styles.bigBtn, { backgroundColor: persona.accent }]}
                onPress={submitRun}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color={persona.ink} />
                  : <Text style={[styles.bigBtnText, { color: persona.ink }]}>POST RUN  →</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.bigBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => setPhase('ready')}
              >
                <Text style={[styles.bigBtnText, { color: Colors.text }]}>TRY AGAIN</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Cell square overlay — shows a single grid cell as a colored polygon. */
function CellSquare({ cellId, accent }: { cellId: string; accent: string }) {
  const sw = cellCorner(cellId);
  const ne = { lat: sw.lat + CELL_DEG, lon: sw.lon + CELL_DEG };
  return (
    <Polygon
      coordinates={[
        { latitude: sw.lat, longitude: sw.lon },
        { latitude: sw.lat, longitude: ne.lon },
        { latitude: ne.lat, longitude: ne.lon },
        { latitude: ne.lat, longitude: sw.lon },
      ]}
      fillColor={`${accent}55`}
      strokeColor={accent}
      strokeWidth={1.5}
    />
  );
}

/** Compute a region that fits the entire route, with some padding. */
function fitRegion(track: LatLon[]): Region {
  if (track.length === 0) {
    return { latitude: 0, longitude: 0, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  let latMin = track[0].lat, latMax = track[0].lat;
  let lonMin = track[0].lon, lonMax = track[0].lon;
  for (const p of track) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  const PAD = 1.4;
  const latDelta = Math.max(0.003, (latMax - latMin) * PAD);
  const lonDelta = Math.max(0.003, (lonMax - lonMin) * PAD);
  return {
    latitude:  (latMin + latMax) / 2,
    longitude: (lonMin + lonMax) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 16, letterSpacing: 1 },

  body: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },

  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  hero:     { fontSize: 92 },
  headline: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 28, color: Colors.text, letterSpacing: -0.6, textAlign: 'center' },
  tagline:  { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, lineHeight: 21, textAlign: 'center', paddingHorizontal: 12 },
  errorMsg: { fontFamily: Fonts.body, fontSize: 13, color: Colors.danger, textAlign: 'center', marginTop: 8 },

  tracking: { flex: 1, paddingTop: 12, gap: 12 },

  // Live route map
  mapWrap: {
    flex: 1, minHeight: 260, borderRadius: 14, overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  muted: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 1 },

  // Compact stats row under the map
  compactStats: {
    flexDirection: 'row', gap: 6,
  },
  compactStat: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, alignItems: 'center',
  },
  compactBig: {
    fontFamily: Fonts.display, fontWeight: '800', fontSize: 18, color: Colors.text,
    letterSpacing: -0.3, marginTop: 4,
  },

  // Big claim hero — shown when map is unavailable (no Google Maps key)
  bigClaimHero: {
    flex: 1, minHeight: 260, borderRadius: 14, padding: 24,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  bigClaimNum: {
    fontFamily: Fonts.display, fontWeight: '800',
    fontSize: 120, letterSpacing: -4, lineHeight: 120,
  },
  bigClaimSub: {
    fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary,
    letterSpacing: 1.2, marginTop: 6,
  },
  bigClaimHint: {
    fontFamily: Fonts.body, fontSize: 10, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 8, paddingHorizontal: 16,
  },

  statBlock: {
    borderWidth: 1.5, borderRadius: 14, padding: 22, alignItems: 'center',
  },
  statLabel:  { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, color: Colors.textTertiary },
  statBigNum: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 78, letterSpacing: -2, lineHeight: 78, marginTop: 6 },

  statRow:  { flexDirection: 'row', gap: 10 },
  statHalf: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  statMid:  { fontFamily: Fonts.display, fontWeight: '700', fontSize: 26, color: Colors.text, marginTop: 4 },
  statUnit: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, fontWeight: '400' },

  bigBtn: {
    paddingVertical: 18, borderRadius: 100,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 16,
  },
  bigBtnText: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  stopBtn:    { backgroundColor: '#ef4444' },

  finishHero: { fontSize: 78, textAlign: 'center', marginVertical: 8 },
  finishHead: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 22, color: Colors.text, textAlign: 'center', marginBottom: 4 },
  finishMeta: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, marginTop: 10, letterSpacing: 0.8 },
});
