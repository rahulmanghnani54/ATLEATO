import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { initTf } from '@/lib/tfSetup';
import { analyzeForm, type PoseCorrection } from '@/lib/poseAnalyzer';
import { SkeletonOverlay } from '@/components/formcoach/SkeletonOverlay';
import { getFormFeedback } from '@/lib/api/edgeFunctions';
import { Colors, Spacing, Typography, Fonts } from '@/constants/theme';

const FRAME_INTERVAL_MS = 50;
const MODEL_INPUT_SIZE = 192;
const CLAUDE_COOLDOWN_MS = 15_000;
const CUE_FADE_TIMEOUT_MS = 5_000;
const VELOCITY_HISTORY_SIZE = 5;

function programIdToPersona(programId: string): string {
  if (programId.startsWith('cbum')) return 'cbum';
  if (programId.startsWith('arnold')) return 'arnold';
  if (programId.startsWith('nippard')) return 'nippard';
  if (programId.startsWith('ct_fletcher')) return 'ct_fletcher';
  if (programId.startsWith('dr_mike')) return 'dr_mike';
  return 'cbum';
}

function extractAngles(kps: poseDetection.Keypoint[]): Record<string, number> {
  const angles: Record<string, number> = {};
  function kp(i: number) { return kps[i] ?? { x: 0, y: 0, score: 0 }; }
  function angleDeg(a: {x:number,y:number}, b: {x:number,y:number}, c: {x:number,y:number}) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
    if (mag === 0) return 0;
    return Math.round(Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180 / Math.PI);
  }
  const lShoulder = kp(5), lElbow = kp(7), lWrist = kp(9);
  const lHip = kp(11), lKnee = kp(13), lAnkle = kp(15);
  const rHip = kp(12), rKnee = kp(14);
  angles['knee_angle_left'] = angleDeg(lHip, lKnee, lAnkle);
  angles['knee_angle_right'] = angleDeg(rHip, rKnee, kp(16));
  angles['torso_lean'] = angleDeg(lShoulder, lHip, lKnee);
  angles['elbow_angle_left'] = angleDeg(lShoulder, lElbow, lWrist);
  return angles;
}

const PERSONA_LABELS: Record<string, string> = {
  cbum: 'CBUM SAYS',
  arnold: 'ARNOLD SAYS',
  nippard: 'NIPPARD SAYS',
  ct_fletcher: 'CT SAYS',
  dr_mike: 'DR MIKE SAYS',
};

export default function FormCoach() {
  const router = useRouter();
  const { exerciseName, persona: personaParam } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
  }>();
  const { width: screenWidth } = useWindowDimensions();
  const cameraHeight = screenWidth * 1.33;

  const persona = programIdToPersona(personaParam ?? 'cbum_evolved');
  const claudePersonaLabel = PERSONA_LABELS[persona] ?? 'COACH SAYS';

  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraDevice = useCameraDevice(facing);  // single declaration

  const [tfReady, setTfReady] = useState(false);
  const [keypoints, setKeypoints] = useState<poseDetection.Keypoint[]>([]);
  const [corrections, setCorrections] = useState<PoseCorrection[]>([]);
  const [claudeCue, setClaudeCue] = useState<string | null>(null);

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const processingRef = useRef(false);
  const lastClaudeCallAt = useRef(0);
  const cueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wristYHistory = useRef<number[]>([]);
  const lastFrameAt = useRef(0);

  // Init TF.js + MoveNet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initTf();
      if (cancelled) return;
      const det = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true }
      );
      if (!cancelled) {
        detectorRef.current = det;
        setTfReady(true);
      }
    })().catch((err) => { if (__DEV__) console.warn('[FormCoach] TF init:', err); });
    return () => { cancelled = true; };
  }, []);

  const processRawFrame = useCallback(async (
    buffer: ArrayBuffer,
    width: number,
    height: number,
  ) => {
    if (!detectorRef.current) return;
    processingRef.current = true;
    try {
      const bgra = new Uint8Array(buffer);
      const rgb = new Uint8Array(width * height * 3);
      for (let i = 0, j = 0; i < bgra.length; i += 4, j += 3) {
        rgb[j]     = bgra[i + 2]; // R ← B channel in BGRA
        rgb[j + 1] = bgra[i + 1]; // G
        rgb[j + 2] = bgra[i];     // B ← R channel in BGRA
      }

      const poses = await detectorRef.current.estimatePoses(
        { data: rgb, width, height, channels: 3 } as any
      );

      if (poses.length > 0) {
        const kps = poses[0].keypoints;
        setKeypoints(kps);

        const lWrist = kps[9];
        if (lWrist && (lWrist.score ?? 0) > 0.3) {
          wristYHistory.current = [...wristYHistory.current, lWrist.y].slice(-VELOCITY_HISTORY_SIZE);
        }

        const name = exerciseName ?? 'unknown';
        const newCorrections = analyzeForm(kps, name, wristYHistory.current);
        setCorrections(newCorrections);

        const hasError = newCorrections.some((c) => c.severity === 'error');
        const now = Date.now();
        if (hasError && now - lastClaudeCallAt.current > CLAUDE_COOLDOWN_MS) {
          lastClaudeCallAt.current = now;
          const errorIssues = newCorrections
            .filter((c) => c.severity === 'error' && c.issueKey)
            .map((c) => c.issueKey!);
          const angles = extractAngles(kps);
          getFormFeedback(name, errorIssues, persona, angles)
            .then((res) => {
              setClaudeCue(res.feedback);
              if (cueTimeoutRef.current) clearTimeout(cueTimeoutRef.current);
              cueTimeoutRef.current = setTimeout(() => setClaudeCue(null), CUE_FADE_TIMEOUT_MS);
            })
            .catch(() => {});
        }

        if (!hasError && cueTimeoutRef.current === null && claudeCue) {
          cueTimeoutRef.current = setTimeout(() => setClaudeCue(null), CUE_FADE_TIMEOUT_MS);
        }
      }
    } catch {
      // Silently ignore frame errors
    } finally {
      processingRef.current = false;
    }
  }, [exerciseName, persona, claudeCue]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const now = Date.now();
    if (processingRef.current || now - lastFrameAt.current < FRAME_INTERVAL_MS) return;
    lastFrameAt.current = now;
    const buf = frame.toArrayBuffer();
    runOnJS(processRawFrame)(buf, frame.width, frame.height);
  }, [processRawFrame]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permissionText}>Camera access is required for form coaching.</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!cameraDevice) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  const scaleX = screenWidth / MODEL_INPUT_SIZE;
  const scaleY = cameraHeight / MODEL_INPUT_SIZE;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{exerciseName ?? 'Form Coach'}</Text>
        <TouchableOpacity
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.flipBtn}
        >
          <Text style={styles.flipText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Camera + Skeleton overlay */}
      <View style={[styles.cameraContainer, { height: cameraHeight }]}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={cameraDevice}
          isActive={true}
          frameProcessor={tfReady ? frameProcessor : undefined}
          pixelFormat="bgra"
        />
        {keypoints.length > 0 && (
          <SkeletonOverlay
            keypoints={keypoints}
            width={screenWidth}
            height={cameraHeight}
            scaleX={scaleX}
            scaleY={scaleY}
          />
        )}
        {!tfReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Loading AI model…</Text>
          </View>
        )}
      </View>

      {/* Claude persona cue overlay */}
      {claudeCue && (
        <View style={styles.claudeCueCard}>
          <Text style={styles.claudeCueLabel}>✦ {claudePersonaLabel}</Text>
          <Text style={styles.claudeCueText}>{claudeCue}</Text>
        </View>
      )}

      {/* Form corrections */}
      <ScrollView style={styles.feedbackPanel} contentContainerStyle={styles.feedbackContent}>
        {corrections.length === 0 && tfReady && (
          <Text style={styles.waitingText}>Analysing your form…</Text>
        )}
        {corrections.map((c, i) => (
          <View
            key={i}
            style={[
              styles.correction,
              c.severity === 'error' && styles.correctionError,
              c.severity === 'warning' && styles.correctionWarning,
              c.severity === 'good' && styles.correctionGood,
            ]}
          >
            <Text style={styles.correctionIcon}>
              {c.severity === 'error' ? '🚨' : c.severity === 'warning' ? '⚠️' : '✅'}
            </Text>
            <Text style={styles.correctionText}>{c.message}</Text>
          </View>
        ))}
        <Text style={styles.disclaimer}>
          AI form coaching is for guidance only. Stop if you feel pain.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: '#000',
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: '#fff' },
  title: { fontSize: 16, fontFamily: Fonts.display, color: '#fff' },
  flipBtn: { padding: 4 },
  flipText: { fontSize: 20 },

  cameraContainer: { width: '100%', overflow: 'hidden', position: 'relative' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#fff', fontFamily: Fonts.body, fontSize: 14 },

  claudeCueCard: {
    backgroundColor: 'rgba(223,255,31,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(223,255,31,0.2)',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  claudeCueLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary,
    letterSpacing: 1.4, marginBottom: 4,
  },
  claudeCueText: {
    fontFamily: Fonts.body, fontSize: 13, color: '#e5e7eb', lineHeight: 19,
    fontStyle: 'italic',
  },

  feedbackPanel: { flex: 1, backgroundColor: '#111' },
  feedbackContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  waitingText: { color: '#6b7280', fontFamily: Fonts.body, textAlign: 'center', marginTop: Spacing.md },

  correction: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: 8,
  },
  correctionError: { backgroundColor: 'rgba(220,38,38,0.15)', borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  correctionWarning: { backgroundColor: 'rgba(245,158,11,0.15)', borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  correctionGood: { backgroundColor: 'rgba(22,163,74,0.15)', borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  correctionIcon: { fontSize: 16, marginTop: 1 },
  correctionText: { flex: 1, color: '#e5e7eb', fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },

  disclaimer: { ...Typography.caption, color: '#6b7280', textAlign: 'center', marginTop: Spacing.md, fontStyle: 'italic' },
  permissionText: { color: '#fff', textAlign: 'center', marginBottom: Spacing.md, fontFamily: Fonts.body },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionBtnText: { color: '#000', fontFamily: Fonts.display },
});
