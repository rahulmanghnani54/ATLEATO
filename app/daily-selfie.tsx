/**
 * Photo Accountability Screen
 *
 * Daily 1-second front-camera selfie — private, never uploaded, stored locally.
 * Seeing your own 7-day progress IS the mechanic.
 *
 * Uses expo-camera for capture and expo-file-system for local storage.
 * Completely separate from physique check-in (that's weekly; this is daily/micro).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const STORAGE_KEY = 'daily_selfie_log:v1';       // JSON: { [YYYY-MM-DD]: localUri }
const SELFIE_DIR  = `${FileSystem.documentDirectory}selfies/`;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 6) / 7;

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

function Last7Days({ log, accent }: { log: SelfieLog; accent: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const key = format(d, 'yyyy-MM-dd');
    const label = format(d, 'EEE').toUpperCase();
    const uri = log[key] ?? null;
    const isToday = key === todayKey();
    return { key, label, uri, isToday };
  });

  return (
    <View style={thumbStyles.row}>
      {days.map((day) => (
        <View key={day.key} style={thumbStyles.cell}>
          {day.uri ? (
            <Image
              source={{ uri: day.uri }}
              style={[thumbStyles.img, day.isToday && { borderColor: accent, borderWidth: 2 }]}
            />
          ) : (
            <View style={[
              thumbStyles.empty,
              day.isToday && { borderColor: accent },
            ]}>
              {day.isToday && <Text style={[thumbStyles.todayDot, { color: accent }]}>•</Text>}
            </View>
          )}
          <Text style={[thumbStyles.label, day.isToday && { color: accent }]}>{day.label}</Text>
        </View>
      ))}
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, marginVertical: 12 },
  cell: { alignItems: 'center', width: THUMB_SIZE },
  img: {
    width: THUMB_SIZE, height: THUMB_SIZE * 1.3,
    borderRadius: 6, borderWidth: 0,
  },
  empty: {
    width: THUMB_SIZE, height: THUMB_SIZE * 1.3,
    borderRadius: 6, borderWidth: 1,
    borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  todayDot: { fontSize: 18, lineHeight: 22 },
  label: {
    fontFamily: Fonts.mono, fontSize: 8,
    color: Colors.textTertiary, letterSpacing: 0.8, marginTop: 4,
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DailySelfieScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [log, setLog] = useState<SelfieLog>({});
  const [streak, setStreak] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [todayUri, setTodayUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Fixed accent color — selfie screen is persona-agnostic (privacy tool)
  const accent = Colors.primary; // emerald #12B981, readable on light Paper/white surfaces

  useEffect(() => {
    (async () => {
      await ensureDir();
      const savedLog = await loadLog();
      setLog(savedLog);
      setStreak(calculateStreak(savedLog));
      setTodayUri(savedLog[todayKey()] ?? null);
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
      <SafeAreaView style={camStyles.safe}>
        <CameraView
          ref={cameraRef}
          style={camStyles.camera}
          facing="front"
        >
          <View style={camStyles.overlay}>
            <TouchableOpacity
              style={camStyles.closeBtn}
              onPress={() => setShowCamera(false)}
            >
              <Text style={camStyles.closeText}>✕</Text>
            </TouchableOpacity>

            <View style={camStyles.bottom}>
              <Text style={camStyles.privacyBadge}>🔒 Stays on your device</Text>
              <TouchableOpacity
                style={[camStyles.shutterBtn, capturing && { opacity: 0.5 }]}
                onPress={handleCapture}
                disabled={capturing}
                activeOpacity={0.85}
              >
                <Text style={camStyles.shutterLabel}>
                  {capturing ? '…' : '📸'}
                </Text>
              </TouchableOpacity>
              <Text style={camStyles.cta}>Click 📸</Text>
            </View>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  // ── Main gallery + info view ───────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DAILY SELFIE</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Privacy badge */}
        <View style={styles.privacyBanner}>
          <Text style={styles.privacyText}>
            🔒 All photos stay on your device. Never uploaded.
          </Text>
        </View>

        {/* Streak */}
        <View style={styles.streakCard}>
          <Text style={[styles.streakNum, { color: accent }]}>{streak}</Text>
          <Text style={styles.streakLabel}>day accountability streak</Text>
        </View>

        {/* Today's selfie or capture prompt */}
        {todayUri ? (
          <View style={styles.todaySection}>
            <Text style={styles.sectionLabel}>TODAY</Text>
            <Image source={{ uri: todayUri }} style={styles.todayImg} />
            <TouchableOpacity
              style={[styles.retakeBtn, { borderColor: accent + '66' }]}
              onPress={handleOpenCamera}
              activeOpacity={0.85}
            >
              <Text style={[styles.retakeBtnText, { color: accent }]}>↺ Retake today's selfie</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noSelfieCard}>
            <Text style={styles.noSelfieTitle}>No selfie yet today</Text>
            <Text style={styles.noSelfieSub}>
              Tap the button below to take your daily accountability selfie.
              Seeing yourself every day is the mechanic.
            </Text>
            <TouchableOpacity
              style={[styles.captureBtn, { backgroundColor: accent }]}
              onPress={handleOpenCamera}
              activeOpacity={0.85}
            >
              <Text style={styles.captureBtnText}>Take today's selfie 📸</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Last 7 days */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>LAST 7 DAYS</Text>
        <Last7Days log={log} accent={accent} />

        {/* Explanation */}
        <View style={styles.explainCard}>
          <Text style={styles.explainTitle}>WHY DAILY SELFIES?</Text>
          <Text style={styles.explainBody}>
            You won't notice day-to-day changes in a mirror. But lined up week-by-week,
            your progress becomes undeniable. The act of showing up daily — even on off days —
            builds the habit loop that drives everything else.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const camStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    flex: 1, justifyContent: 'space-between',
    paddingTop: Spacing.md, paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 18 },
  bottom: { alignItems: 'center', gap: 12 },
  privacyBadge: {
    fontFamily: Fonts.mono, fontSize: 10, color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8,
  },
  shutterBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterLabel: { fontSize: 32 },
  cta: { fontFamily: Fonts.display, fontSize: 13, color: '#fff', letterSpacing: 0.4 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 0.6 },

  scroll: { padding: Spacing.md, paddingBottom: 48 },

  privacyBanner: {
    backgroundColor: Colors.raised, borderRadius: 8, padding: 12,
    marginBottom: 16, alignItems: 'center',
  },
  privacyText: {
    fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.6,
  },

  streakCard: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 20,
  },
  streakNum: { fontFamily: Fonts.display, fontSize: 64, letterSpacing: -1, lineHeight: 68 },
  streakLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 4 },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 8,
  },

  todaySection: { marginBottom: 8 },
  todayImg: {
    width: '100%', height: 280, borderRadius: 10,
    backgroundColor: Colors.raised,
  },
  retakeBtn: {
    marginTop: 10, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, alignItems: 'center',
  },
  retakeBtnText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 0.4 },

  noSelfieCard: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 24,
    alignItems: 'center', gap: 12,
  },
  noSelfieTitle: {
    fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: -0.3,
  },
  noSelfieSub: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 19,
  },
  captureBtn: {
    paddingVertical: 16, paddingHorizontal: 32, borderRadius: 8, marginTop: 8,
  },
  captureBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 0.4 },

  explainCard: {
    backgroundColor: Colors.raised, borderRadius: 8, padding: 16, marginTop: 16,
  },
  explainTitle: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 8,
  },
  explainBody: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, lineHeight: 20,
  },
});
