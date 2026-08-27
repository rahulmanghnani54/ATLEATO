/**
 * Video Review — LEGEND-tier feature
 *
 * Record a workout clip (10–30 seconds) using expo-camera, then play it back
 * with a simple notes panel. No AI overlay on playback (MVP).
 *
 * Bold Canvas: the footage is the hero, so there is no <Crown> — a dark head
 * runs into a full-bleed stage and every readout FLOATS over it, borderless.
 * The light body below carries the detail (notes, actions).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, StatusBar,
  Alert, ScrollView, Linking, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera as CameraIcon, Check, RefreshCw, X as XIcon } from 'lucide-react-native';
import { canAccess } from '@/lib/featureGates';
import { Fonts } from '@/constants/theme';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { BigStat, CanvasScreen, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';

const MAX_DURATION_SEC = 30;
const NOTES_KEY_PREFIX = 'video_review_notes_';

type Mode = 'record' | 'review';

export default function VideoReview() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const videoHeight = Math.round(screenHeight * 0.42);

  const [mode, setMode] = useState<Mode>('record');
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [recordedAt, setRecordedAt] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number>(0);   // seconds elapsed while recording
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Focus-scoped: the dark head runs under the status bar and needs light icons,
  // but that entry must not follow the user onto a light screen pushed on top.
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  // Gate check
  useEffect(() => {
    if (!canAccess('video_review')) {
      router.replace('/paywall?feature=video_review' as any);
    }
  }, []);

  // Auto-request ONCE on mount — but only while Android is still willing to show
  // the OS dialog (canAskAgain). Re-calling request*() after a hard denial is a
  // silent no-op, which is what made it look like the app "never asks".
  const autoAsked = useRef(false);
  useEffect(() => {
    if (autoAsked.current || !permission || !micPermission) return;
    if (permission.granted && micPermission.granted) return;
    autoAsked.current = true;
    if (!permission.granted && permission.canAskAgain) requestPermission();
    if (!micPermission.granted && micPermission.canAskAgain) requestMicPermission();
  }, [permission, micPermission]);

  // Single source of truth for getting camera+mic access. Requests via the OS
  // dialog when allowed; if Android won't ask again, offers a jump to Settings.
  // Returns true only when BOTH are granted. Used by the record button AND the
  // pre-record gate screen so there's no dead-end.
  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    let cam = permission;
    let mic = micPermission;
    if (!cam?.granted && cam?.canAskAgain !== false) cam = await requestPermission();
    if (!mic?.granted && mic?.canAskAgain !== false) mic = await requestMicPermission();
    if (cam?.granted && mic?.granted) return true;

    Alert.alert(
      'Permissions needed',
      'Camera and microphone access are required to record your set. ' +
        'Open Settings to enable them, then come back and tap record.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }, [permission, micPermission, requestPermission, requestMicPermission]);

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
    // would "record" nothing. Actively request (OS dialog) or route to Settings
    // rather than dead-ending on an alert.
    const ok = await ensurePermissions();
    if (!ok) return;
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
  }, [recording, stopRecording, ensurePermissions]);

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
    // Shaped like the screen that is coming — a tall stage with its controls —
    // rather than a bare spinner.
    return (
      <CanvasScreen scroll={false} tabBar={false} topInset contentStyle={styles.gateLoading}>
        <Text style={styles.eyebrow}>Form capture</Text>
        <Skeleton height={Math.round(screenHeight * 0.44)} radius={26} />
        <View style={styles.gateLoadingRow}>
          <Skeleton width={76} height={76} radius={38} />
        </View>
        <Text style={styles.gateText}>Preparing the camera…</Text>
      </CanvasScreen>
    );
  }

  if (!permission.granted || !micPermission?.granted) {
    return (
      <CanvasScreen scroll={false} tabBar={false} topInset contentStyle={styles.gateBody}>
        <Text style={styles.eyebrow}>Form capture</Text>
        <Text style={styles.gateTitle}>Camera{'\n'}and mic{'\n'}access.</Text>
        <Text style={styles.gateText}>
          Camera and microphone access are required to record workout clips.
        </Text>
        <PressableScale
          style={styles.gateBtn}
          onPress={ensurePermissions}
          haptic="heavy"
          accessibilityRole="button"
        >
          <CameraIcon size={15} color={tokens.accentInk} />
          <Text style={styles.gateBtnText}>
            {permission.canAskAgain === false || micPermission?.canAskAgain === false
              ? 'Open settings'
              : 'Grant access'}
          </Text>
        </PressableScale>
      </CanvasScreen>
    );
  }

  // ── REVIEW MODE ──────────────────────────────────────────────────────────────
  if (mode === 'review' && videoUri) {
    return (
      <View style={styles.root}>
        {screenFocused ? <StatusBar barStyle="light-content" /> : null}

        <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close form review"
            style={styles.headBtn}
          >
            <XIcon size={19} color={TOKENS.dark.crownText} />
          </PressableScale>
          <View style={styles.headTitleWrap}>
            <Text style={styles.headEyebrow}>Clip captured</Text>
            <Text style={styles.headTitle} numberOfLines={1}>Form review</Text>
          </View>
          <View style={styles.headSpacer} />
        </View>

        <Video
          source={{ uri: videoUri }}
          style={[styles.video, { height: videoHeight }]}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
          isLooping
        />

        <ScrollView
          style={styles.panel}
          contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + 44 }]}
        >
          {/* Meta — the clip length is the one big numeral in the light body. */}
          <View style={styles.heroRow}>
            <BigStat value={formatTime(duration)} label="Clip length" size={44} />
            <View style={styles.metaWrap}>
              <Text style={styles.metaLabel} numberOfLines={1}>Recorded</Text>
              <Text style={styles.metaValue} numberOfLines={2}>
                {recordedAt ? formatTimestamp(recordedAt) : '—'}
              </Text>
            </View>
          </View>

          <Hairline style={styles.rule} />

          <Section label="Coach's note">
            <TextInput
              style={styles.notes}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add your form observations, cues to remember, or coach feedback…"
              placeholderTextColor={tokens.textTertiary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </Section>

          <View style={styles.btnRow}>
            {/* PressableScale renders its own wrapper, so the flex that splits
                the row has to live on a cell around it, not on the button. */}
            <View style={styles.btnCell}>
              <PressableScale
                style={styles.secondaryBtn}
                onPress={handleRecordAgain}
                haptic="light"
                accessibilityRole="button"
              >
                <RefreshCw size={14} color={tokens.text} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>Record again</Text>
              </PressableScale>
            </View>
            <View style={styles.btnCell}>
              <PressableScale
                style={styles.primaryBtn}
                onPress={handleClose}
                disabled={saving}
                haptic="heavy"
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
              >
                {saving ? null : <Check size={14} color={tokens.accentInk} />}
                <Text style={styles.primaryBtnText} numberOfLines={1}>
                  {saving ? 'Saving…' : 'Save & close'}
                </Text>
              </PressableScale>
            </View>
          </View>

          <Text style={styles.hint}>
            Tap the video to play. Use the controls to scrub through your clip.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── RECORD MODE ──────────────────────────────────────────────────────────────
  const progress = Math.min(1, duration / MAX_DURATION_SEC);

  return (
    <View style={styles.root}>
      {screenFocused ? <StatusBar barStyle="light-content" /> : null}

      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close recorder"
          style={styles.headBtn}
        >
          <XIcon size={19} color={TOKENS.dark.crownText} />
        </PressableScale>
        <View style={styles.headTitleWrap}>
          <Text style={styles.headEyebrow}>Form capture</Text>
          <Text style={styles.headTitle} numberOfLines={1}>Record &amp; review</Text>
        </View>
        <View style={styles.headSpacer} />
      </View>

      <View style={styles.stage}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
        />

        {/* Legibility scrims — the overlays are borderless, so the stage itself
            carries their contrast instead of a box around each one. */}
        <LinearGradient
          pointerEvents="none"
          colors={[TOKENS.dark.overlay, 'transparent']}
          style={styles.scrimTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', TOKENS.dark.scrim]}
          style={styles.scrimBottom}
        />

        {/* Timer overlay */}
        {recording && (
          <>
            <View style={styles.recPill}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>Rec</Text>
            </View>
            <View style={styles.stageBottom}>
              <Text style={styles.timerValue}>{formatTime(duration)}</Text>
              <Text style={styles.timerLabel}>
                Elapsed / max {formatTime(MAX_DURATION_SEC)}
              </Text>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>
          </>
        )}

        {/* Instruction overlay when idle */}
        {!recording && (
          <View style={styles.stageBottom}>
            <Text style={styles.idleTitle}>Position yourself{'\n'}in frame.</Text>
            <Text style={styles.idleSub}>
              Max {MAX_DURATION_SEC}s — auto-stops when limit reached.
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <PressableScale
          style={[styles.recordBtn, recording && styles.recordBtnActive]}
          onPress={handleToggleRecord}
          haptic="heavy"
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        >
          <View style={recording ? styles.stopIcon : styles.startIcon} />
        </PressableScale>
        <Text style={styles.recordLabel}>
          {recording ? 'Tap to stop' : 'Tap to record'}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(t: SemanticTokens) {
  // Camera and video are a dark ground whatever scheme the app is in, so every
  // readout floating over them reads the DARK token set.
  const stage = TOKENS.dark;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },

    // ── Gates ────────────────────────────────────────────────────────────────
    gateBody: { justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
    gateLoading: { justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
    gateLoadingRow: { flexDirection: 'row', justifyContent: 'center' },
    eyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.9,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    gateTitle: {
      fontFamily: Fonts.displayBold, fontSize: 44, lineHeight: 46,
      letterSpacing: -1.98, color: t.text,
    },
    gateText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 23, color: t.textSecondary },
    gateBtn: {
      marginTop: 6, alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 9,
      paddingHorizontal: 24, paddingVertical: 16, borderRadius: 26,
      // Brand emerald is 2.54:1 on white — the deep hairline is what gives the
      // control a legible edge on a light page.
      backgroundColor: t.accent, borderWidth: 1, borderColor: t.accentLine,
    },
    gateBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: t.accentInk,
    },

    // ── Dark head, continuous with the stage ─────────────────────────────────
    head: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingBottom: 14, backgroundColor: t.crown,
    },
    headBtn: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: stage.crownLine,
    },
    headSpacer: { width: 38 },
    headTitleWrap: { flex: 1, alignItems: 'center' },
    headEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.9,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },
    headTitle: {
      fontFamily: Fonts.displayBold, fontSize: 20, letterSpacing: -0.9,
      color: stage.crownText, marginTop: 5,
    },

    // ── Stage — the hero; every overlay floats, none is boxed ────────────────
    stage: { flex: 1, overflow: 'hidden', backgroundColor: t.crown },
    scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
    scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 250 },

    recPill: {
      position: 'absolute', top: 14, left: 14,
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
      backgroundColor: stage.overlay,
    },
    recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: stage.danger },
    recText: {
      fontFamily: Fonts.legacyMono, fontSize: 8.5, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownText,
    },

    stageBottom: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 10 },
    // The dramatic pairing: a 56px numeral straight onto an 8px mono label.
    timerValue: {
      fontFamily: Fonts.displayBold, fontVariant: ['tabular-nums'],
      fontSize: 56, lineHeight: 57, letterSpacing: -2.52, color: stage.crownText,
    },
    timerLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },
    track: { height: 3, borderRadius: 2, backgroundColor: stage.crownLine, overflow: 'hidden' },
    trackFill: { height: 3, borderRadius: 2, backgroundColor: stage.danger },

    idleTitle: {
      fontFamily: Fonts.displayBold, fontSize: 27, lineHeight: 30,
      letterSpacing: -1.22, color: stage.crownText,
    },
    idleSub: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.6,
      textTransform: 'uppercase', color: stage.crownTextDim,
    },

    // ── Record controls — light body under the dark stage ────────────────────
    controls: { alignItems: 'center', paddingTop: 22, gap: 13, backgroundColor: t.bg },
    recordBtn: {
      width: 76, height: 76, borderRadius: 38,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: t.borderStrong,
    },
    recordBtnActive: { borderColor: t.danger },
    startIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.danger },
    stopIcon: { width: 24, height: 24, borderRadius: 5, backgroundColor: t.danger },
    recordLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 2,
      textTransform: 'uppercase', color: t.textTertiary,
    },

    // ── Review ───────────────────────────────────────────────────────────────
    video: { width: '100%', backgroundColor: t.crown },
    panel: { flex: 1, backgroundColor: t.bg },
    panelContent: { paddingHorizontal: 22, paddingTop: 26 },

    heroRow: {
      flexDirection: 'row', alignItems: 'flex-end',
      justifyContent: 'space-between', gap: 16,
    },
    metaWrap: { flexShrink: 1, alignItems: 'flex-end', gap: 6, paddingBottom: 3 },
    metaLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.3,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    metaValue: {
      fontFamily: Fonts.bodySemi, fontSize: 13, lineHeight: 18,
      color: t.text, textAlign: 'right',
    },
    rule: { marginTop: 22 },

    notes: {
      backgroundColor: t.surfaceAlt, borderRadius: 22, padding: 18,
      fontFamily: Fonts.body, fontSize: 15, lineHeight: 23, color: t.text,
      minHeight: 132,
    },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
    btnCell: { flex: 1 },
    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 16, borderRadius: 26,
      backgroundColor: t.accent, borderWidth: 1, borderColor: t.accentLine,
    },
    primaryBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 10, letterSpacing: 1.5,
      textTransform: 'uppercase', color: t.accentInk,
    },
    // Same border width as the primary so the two buttons stand exactly as tall.
    secondaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 16, borderRadius: 26,
      backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.surfaceAlt,
    },
    secondaryBtnText: {
      fontFamily: Fonts.legacyMono, fontSize: 10, letterSpacing: 1.5,
      textTransform: 'uppercase', color: t.text,
    },

    hint: {
      fontFamily: Fonts.legacyMono, fontSize: 9, lineHeight: 15, letterSpacing: 1.2,
      textTransform: 'uppercase', color: t.textTertiary,
      textAlign: 'center', marginTop: 22,
    },
  });
}
