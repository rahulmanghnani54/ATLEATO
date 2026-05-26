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
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';
import {
  cellIdForPoint, distanceMeters, type LatLon,
} from '@/lib/territoryGrid';
import { claimCells } from '@/hooks/useTerritory';

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

  // Refs so the GPS callback doesn't re-create on every state change
  const trackRef     = useRef<LatLon[]>([]);
  const cellsRef     = useRef<Set<string>>(new Set());
  const startedAtRef = useRef<number>(0);
  const distanceRef  = useRef<number>(0);
  const subRef       = useRef<Location.LocationSubscription | null>(null);
  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);

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
      startedAtRef.current = Date.now();

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
            <View style={[styles.statBlock, { borderColor: persona.accent }]}>
              <Text style={styles.statLabel}>CELLS CLAIMED</Text>
              <Text style={[styles.statBigNum, { color: persona.accent }]}>{cellsTouched}</Text>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statHalf}>
                <Text style={styles.statLabel}>DISTANCE</Text>
                <Text style={styles.statMid}>{km}<Text style={styles.statUnit}> km</Text></Text>
              </View>
              <View style={styles.statHalf}>
                <Text style={styles.statLabel}>TIME</Text>
                <Text style={styles.statMid}>{mmss}</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statHalf}>
                <Text style={styles.statLabel}>PACE</Text>
                <Text style={styles.statMid}>{pace}<Text style={styles.statUnit}> /km</Text></Text>
              </View>
              <View style={styles.statHalf}>
                <Text style={styles.statLabel}>POINTS LOGGED</Text>
                <Text style={styles.statMid}>{trackRef.current.length}</Text>
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
            <Text style={styles.finishHero}>🏁</Text>
            <Text style={styles.finishHead}>
              {cellsTouched > 0 ? "Run complete." : "Run too short."}
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
