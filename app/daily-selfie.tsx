/**
 * Photo Accountability Screen — Bold Canvas.
 *
 * Daily 1-second front-camera selfie — private, never uploaded, stored locally.
 * Seeing your own 7-day progress IS the mechanic.
 *
 * The dark crown carries the streak numeral as the one hero and states the
 * privacy contract; the light body is nothing but the camera flow — today's
 * frame, then a square-cornered ledger strip of the last seven days. Capture,
 * local storage, the streak maths and every permission prompt are untouched.
 *
 * Uses expo-camera for capture and expo-file-system for local storage.
 * Completely separate from physique check-in (that's weekly; this is daily/micro).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays } from 'date-fns';
import { X } from 'lucide-react-native';
import { CanvasScreen, Crown, Section, Hairline } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const STORAGE_KEY = 'daily_selfie_log:v1';       // JSON: { [YYYY-MM-DD]: localUri }
const SELFIE_DIR  = `${FileSystem.documentDirectory}selfies/`;

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;
// Portrait cell in a 7-across row. Fixed rather than derived from the window so
// the loading strip and the real strip are the same shape at any width.
const THUMB_H = 74;

// ─── Storage helpers ─────────────────────────────────────────────────────────

type SelfieLog = Record<string, string>; // date → local file URI

async function loadLog(): Promise<SelfieLog> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveLog(log: SelfieLog): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {}
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(SELFIE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SELFIE_DIR, { intermediates: true });
  }
}

function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ─── Streak counter ───────────────────────────────────────────────────────────

function calculateStreak(log: SelfieLog): number {
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = format(d, 'yyyy-MM-dd');
    if (!log[key]) break;
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}

// ─── Last 7 days thumbnails ───────────────────────────────────────────────────

function Last7Days({ log }: { log: SelfieLog }) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const key = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE').toUpperCase();
    const uri = log[key] ?? null;
    const isToday = key === todayKey();
    return { key, label, uri, isToday };
  });

  return (
    <View style={styles.stripRow}>
      {days.map((day) => (
        <View key={day.key} style={styles.stripCell}>
          {day.uri ? (
            <Image
              source={{ uri: day.uri }}
              // A neutral ink ring is the only marker that reads on top of an
              // arbitrary photo in either scheme.
              style={[styles.thumb, day.isToday && { borderWidth: 2, borderColor: tokens.text }]}
            />
          ) : (
            <View style={[
              styles.thumbEmpty,
              day.isToday && { borderWidth: 2, borderColor: tokens.text },
            ]}>
              {day.isToday && <Text style={styles.todayDot}>•</Text>}
            </View>
          )}
          <Text
            style={[styles.stripLabel, day.isToday && styles.stripLabelToday]}
            numberOfLines={1}
          >
            {day.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The strip's own shape, so the ledger looks built while AsyncStorage resolves. */
function Last7DaysSkeleton() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stripRow}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={styles.stripCell}>
          <Skeleton height={THUMB_H} radius={0} />
          <Skeleton height={8} width="70%" radius={0} />
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DailySelfieScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [log, setLog] = useState<SelfieLog>({});
  const [streak, setStreak] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [todayUri, setTodayUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  // Presentation only: the log lands one tick after mount, and without this the
  // screen flashes "no selfie yet today" at someone who already took one.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        const savedLog = await loadLog();
        setLog(savedLog);
        setStreak(calculateStreak(savedLog));
        setTodayUri(savedLog[todayKey()] ?? null);
      } finally {
        // In a `finally` so a failed ensureDir() strands nobody on skeletons —
        // the empty state is still the right thing to show.
        setHydrated(true);
      }
    })();
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
      });
      if (!photo?.uri) throw new Error('No photo URI');

      await ensureDir();
      const key = todayKey();
      const dest = `${SELFIE_DIR}selfie_${key}.jpg`;

      // If a photo already exists for today, overwrite it
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });

      await FileSystem.moveAsync({ from: photo.uri, to: dest });

      const updated = { ...log, [key]: dest };
      await saveLog(updated);
      setLog(updated);
      setTodayUri(dest);
      setStreak(calculateStreak(updated));
      setShowCamera(false);
    } catch (e) {
      Alert.alert('Capture failed', 'Could not save your selfie. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, log]);

  const handleOpenCamera = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera access needed',
          'Allow camera access to take your daily selfie. Photos stay on your device.',
        );
        return;
      }
    }
    setShowCamera(true);
  }, [permission, requestPermission]);

  // ── Camera view ────────────────────────────────────────────────────────────
  if (showCamera) {
    return (
      // The crown tokens are the app's dark-surface family, so the viewfinder
      // chrome stays legible without a single literal white.
      <SafeAreaView style={styles.camSafe}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
        >
          <View style={styles.camOverlay}>
            <PressableScale
              onPress={() => setShowCamera(false)}
              haptic="light"
              scaleTo={0.9}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
              style={styles.camClose}
            >
              <X size={18} color={tokens.crownText} strokeWidth={2.5} />
            </PressableScale>

            <View style={styles.camBottom}>
              <Text style={styles.camBadge}>🔒 Stays on your device</Text>
              <PressableScale
                onPress={handleCapture}
                disabled={capturing}
                haptic="heavy"
                scaleTo={0.9}
                accessibilityRole="button"
                accessibilityLabel="Take today's selfie"
                accessibilityState={{ disabled: capturing }}
                style={styles.camShutter}
              >
                <View style={styles.camShutterCore} />
              </PressableScale>
              <Text style={styles.camCta}>{capturing ? 'SAVING…' : 'CAPTURE'}</Text>
            </View>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  // ── Main gallery + info view ───────────────────────────────────────────────
  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      {/* The streak numeral is the one hero. No persona tint — the selfie screen
          is deliberately persona-agnostic (it is a privacy tool). */}
      <Crown
        eyebrow="Daily selfie"
        title={String(streak)}
        accentLine="day streak."
        meta="One second a day. Seeing your own progress is the whole mechanic."
        pills={['🔒 Stays on your device', 'Never uploaded']}
        onBack={() => router.back()}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="Today">
          {!hydrated ? (
            <Skeleton height={320} radius={26} />
          ) : todayUri ? (
            <View>
              <Image source={{ uri: todayUri }} style={styles.todayImg} resizeMode="cover" />
              {/* The one accent spend on this branch of the body. */}
              <PressableScale
                onPress={handleOpenCamera}
                haptic="medium"
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Retake today's selfie"
                style={styles.ghostBtn}
              >
                <Text style={styles.ghostBtnText}>↺ Retake today</Text>
              </PressableScale>
            </View>
          ) : (
            <View>
              <Text style={styles.emptyTitle}>No selfie{'\n'}yet today</Text>
              <Text style={styles.emptyBody}>
                Tap the button below to take your daily accountability selfie.
                Seeing yourself every day is the mechanic.
              </Text>
              {/* The one accent spend on this branch of the body. Brand emerald
                  is 2.54:1 on white, so the fill carries an accentLine hairline. */}
              <PressableScale
                onPress={handleOpenCamera}
                haptic="heavy"
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Take today's selfie"
                style={styles.cta}
              >
                <Text style={styles.ctaText}>TAKE TODAY&apos;S SELFIE</Text>
              </PressableScale>
            </View>
          )}
        </Section>

        <Section label="Last 7 days">
          {hydrated ? <Last7Days log={log} /> : <Last7DaysSkeleton />}
        </Section>

        <Hairline style={styles.explainRule} />
        <Section label="Why daily selfies?" style={styles.explainSection}>
          <Text style={styles.explainBody}>
            You won&apos;t notice day-to-day changes in a mirror. But lined up week-by-week,
            your progress becomes undeniable. The act of showing up daily — even on off days —
            builds the habit loop that drives everything else.
          </Text>
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Today ──────────────────────────────────────────────────────────────────
  todayImg: {
    width: '100%',
    height: 320,
    borderRadius: 26,
    backgroundColor: t.surfaceAlt,
  },
  ghostBtn: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.accentText,
  },

  emptyTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 34,
    lineHeight: 37,
    // -0.04em at 34px.
    letterSpacing: -1.36,
    color: t.text,
  },
  emptyBody: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
    color: t.textSecondary,
  },
  cta: {
    marginTop: 24,
    paddingVertical: 17,
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: t.accent,
    borderColor: t.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.accentInk,
  },

  // ── Last 7 days — a printed ledger, so square corners and no boxes ─────────
  stripRow: { flexDirection: 'row', gap: 5 },
  stripCell: { flex: 1, gap: 7 },
  thumb: {
    width: '100%',
    height: THUMB_H,
    borderRadius: 0,
    backgroundColor: t.surfaceAlt,
  },
  thumbEmpty: {
    width: '100%',
    height: THUMB_H,
    borderRadius: 0,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: { fontSize: 16, lineHeight: 20, color: t.text },
  stripLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textAlign: 'center',
    color: t.textTertiary,
  },
  stripLabelToday: { color: t.text },

  // ── Explanation ────────────────────────────────────────────────────────────
  explainRule: { marginTop: 34 },
  // Section's own 34px lead would double up on the rule above it.
  explainSection: { marginTop: 24 },
  explainBody: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: t.textSecondary,
  },

  // ── Camera ─────────────────────────────────────────────────────────────────
  camSafe: { flex: 1, backgroundColor: t.crown },
  camera: { flex: 1 },
  camOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 36,
    paddingHorizontal: BODY_PAD,
  },
  camClose: {
    alignSelf: 'flex-end',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: t.crownLine,
    backgroundColor: t.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBottom: { alignItems: 'center', gap: 16 },
  camBadge: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: t.crownTextDim,
  },
  camShutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: t.crownText,
    backgroundColor: t.crownLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camShutterCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: t.crownText,
  },
  camCta: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.6,
    color: t.crownText,
  },
});
