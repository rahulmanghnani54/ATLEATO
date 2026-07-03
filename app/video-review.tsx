/**
 * Video Review — LEGEND-tier feature
 *
 * Record a workout clip (10–30 seconds) using expo-camera, then play it back
 * with a simple notes panel. No AI overlay on playback (MVP).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canAccess } from '@/lib/featureGates';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const MAX_DURATION_SEC = 30;
const NOTES_KEY_PREFIX = 'video_review_notes_';

type Mode = 'record' | 'review';

export default function VideoReview() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [mode, setMode] = useState<Mode>('record');
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number>(0);   // seconds elapsed while recording
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Gate check
  useEffect(() => {
    if (!canAccess('video_review')) {
      router.replace('/paywall?feature=video_review' as any);
    }
  }, []);

  // Permission request — camera AND microphone (recordAsync needs both; without
  // mic permission, recording fails silently on Android).
  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
    if (micPermission && !micPermission.granted) requestMicPermission();
  }, [permission, micPermission]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopRecording = useCallback(async () => {
    clearTimer();
    if (cameraRef.current) {
      try {
        await cameraRef.current.stopRecording();
      } catch {
        // already stopped
      }
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || recording) return;
    // recordAsync fails SILENTLY on Android without mic permission — the user
    // would "record" nothing. Block with an actionable message instead.
    if (!permission?.granted || !micPermission?.granted) {
      Alert.alert(
        'Permissions needed',
        'Camera and microphone access are required to record your set. Enable them in Settings and try again.',
      );
      return;
    }
    setDuration(0);
    setRecording(true);
    setRecordedAt(new Date());

    // Start timer that auto-stops at MAX_DURATION_SEC
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 1;
      setDuration(elapsed);
      if (elapsed >= MAX_DURATION_SEC) {
        stopRecording();
      }
    }, 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      });

      if (result?.uri) {
        // Copy to a named file in the document directory
        const ts = Date.now();
        const dest = `${FileSystem.documentDirectory}workout_${ts}.mp4`;
        await FileSystem.copyAsync({ from: result.uri, to: dest });
        setVideoUri(dest);
        setMode('review');

        // Load any existing notes for this file
        const saved = await AsyncStorage.getItem(`${NOTES_KEY_PREFIX}${dest}`);
        if (saved) setNotes(saved);
      }
    } catch (err) {
      // User cancelled or permission denied mid-record
      setRecording(false);
      clearTimer();
    } finally {
      setRecording(false);
      clearTimer();
    }
  }, [recording, stopRecording]);

  const handleToggleRecord = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSave = async () => {
    if (!videoUri) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(`${NOTES_KEY_PREFIX}${videoUri}`, notes);
      Alert.alert('Saved', 'Your notes have been saved.');
    } catch {
      Alert.alert('Error', 'Could not save notes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordAgain = () => {
    setVideoUri(null);
    setRecordedAt(null);
    setDuration(0);
    setNotes('');
    setMode('record');
  };

  const handleClose = async () => {
    await handleSave();
    router.back();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatTimestamp = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted || !micPermission?.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permText}>Camera and microphone access are required to record workout clips.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={() => { requestPermission(); requestMicPermission(); }}>
            <Text style={styles.permBtnText}>GRANT ACCESS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── REVIEW MODE ──────────────────────────────────────────────────────────────
  if (mode === 'review' && videoUri) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Text style={styles.iconText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>FORM REVIEW</Text>
          <View style={styles.iconBtn} />
        </View>

        <Video
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
          isLooping
        />

        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          {/* Meta strip */}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>RECORDED</Text>
              <Text style={styles.metaValue}>
                {recordedAt ? formatTimestamp(recordedAt) : '—'}
              </Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>DURATION</Text>
              <Text style={styles.metaValue}>{formatTime(duration)}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>COACH&apos;S NOTE</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add your form observations, cues to remember, or coach feedback…"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleRecordAgain}>
              <Text style={styles.secondaryBtnText}>⟳  RECORD AGAIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnDisabled]}
              onPress={handleClose}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>
                {saving ? 'SAVING…' : '✓  SAVE & CLOSE'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Tap the video to play. Use the controls to scrub through your clip.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RECORD MODE ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>RECORD & REVIEW</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
        />

        {/* Timer overlay */}
        {recording && (
          <View style={styles.timerPill}>
            <View style={styles.recDot} />
            <Text style={styles.timerText}>{formatTime(duration)}</Text>
            <Text style={styles.timerMax}> / {formatTime(MAX_DURATION_SEC)}</Text>
          </View>
        )}

        {/* Instruction overlay when idle */}
        {!recording && (
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionText}>
              Position yourself in frame, then tap Record.
            </Text>
            <Text style={styles.instructionSub}>Max {MAX_DURATION_SEC}s — auto-stops when limit reached.</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.recordBtn, recording && styles.recordBtnActive]}
          onPress={handleToggleRecord}
          activeOpacity={0.8}
        >
          <View style={recording ? styles.stopIcon : styles.startIcon} />
        </TouchableOpacity>
        <Text style={styles.recordLabel}>
          {recording ? 'TAP TO STOP' : 'TAP TO RECORD'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text, textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 14 },
  permBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.accentInk, letterSpacing: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: Colors.bg,
  },
  iconBtn: { padding: 6, minWidth: 32, alignItems: 'center' },
  iconText: { fontSize: 18, color: Colors.text },
  title: {
    fontSize: 13, fontFamily: Fonts.display, color: Colors.primary,
    flex: 1, textAlign: 'center', letterSpacing: 1.5,
  },

  // ── Camera ──────────────────────────────────────────────────────────────────
  cameraWrapper: { flex: 1, backgroundColor: '#000', position: 'relative' },

  timerPill: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,91,58,0.5)',
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#ff5b3a', marginRight: 8,
  },
  timerText: { fontFamily: Fonts.mono, fontSize: 16, color: '#fff' },
  timerMax:  { fontFamily: Fonts.mono, fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  instructionBanner: {
    position: 'absolute', bottom: 12, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  instructionText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: '#fff', textAlign: 'center' },
  instructionSub:  { fontFamily: Fonts.mono, fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 4, letterSpacing: 0.6 },

  // ── Record controls ──────────────────────────────────────────────────────────
  controls: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, backgroundColor: Colors.bg, gap: 10,
  },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface,
    borderWidth: 3, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  recordBtnActive: { borderColor: '#ff5b3a' },
  startIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#ff5b3a',
  },
  stopIcon: {
    width: 22, height: 22, borderRadius: 3,
    backgroundColor: '#ff5b3a',
  },
  recordLabel: {
    fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.8,
  },

  // ── Review / video ───────────────────────────────────────────────────────────
  video: { width: '100%', height: 280, backgroundColor: '#000' },

  panel: { flex: 1, backgroundColor: Colors.surface },
  panelContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },

  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 4 },
  metaChip: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  metaLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 4 },
  metaValue: { fontFamily: Fonts.bodySemi, fontSize: 13, color: Colors.text },

  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginTop: 4, marginBottom: 6,
  },

  notesInput: {
    backgroundColor: Colors.bg, borderRadius: 8, padding: 14,
    fontFamily: Fonts.body, fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
    minHeight: 120, lineHeight: 22,
  },

  btnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 8 },
  primaryBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: 8,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 11, color: Colors.accentInk, letterSpacing: 1 },
  secondaryBtn: {
    flex: 1, backgroundColor: 'transparent', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.primary,
  },
  secondaryBtnText: { fontFamily: Fonts.display, fontSize: 11, color: Colors.primary, letterSpacing: 1 },
  btnDisabled: { opacity: 0.5 },

  hint: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 12, letterSpacing: 0.5, fontStyle: 'italic',
  },
});
