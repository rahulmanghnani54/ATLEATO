import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as FileSystem from 'expo-file-system';
import { initTf } from '@/lib/tfSetup';
import { analyzeForm, type PoseCorrection } from '@/lib/poseAnalyzer';
import { SkeletonOverlay } from '@/components/formcoach/SkeletonOverlay';
import { Colors, Spacing, Typography } from '@/constants/theme';

const FRAME_INTERVAL_MS = 333; // ~3fps — CPU inference limit
const MODEL_INPUT_SIZE = 192; // MoveNet Lightning input

export default function FormCoach() {
  const router = useRouter();
  const { exerciseName } = useLocalSearchParams<{ exerciseName: string }>();
  const { width: screenWidth } = useWindowDimensions();
  const cameraHeight = screenWidth * 1.33; // 4:3

  const [permission, requestPermission] = useCameraPermissions();
  const [tfReady, setTfReady] = useState(false);
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [keypoints, setKeypoints] = useState<poseDetection.Keypoint[]>([]);
  const [corrections, setCorrections] = useState<PoseCorrection[]>([]);
  const [facing, setFacing] = useState<CameraType>('back');
  const [isProcessing, setIsProcessing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const processingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise TF.js + MoveNet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initTf();
      if (cancelled) return;
      const det = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true,
        }
      );
      if (!cancelled) {
        setDetector(det);
        setTfReady(true);
      }
    })().catch((err) => console.warn('[FormCoach] TF init error:', err));
    return () => { cancelled = true; };
  }, []);

  const processFrame = useCallback(async () => {
    if (processingRef.current || !detector || !cameraRef.current) return;
    processingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: true,
        skipProcessing: true,
      });
      if (!photo?.base64) return;

      // Decode to tensor
      const raw = Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0));
      const imageTensor = decodeJpeg(raw);
      const poses = await detector.estimatePoses(imageTensor as any);
      imageTensor.dispose();

      if (poses.length > 0) {
        const kps = poses[0].keypoints;
        setKeypoints(kps);
        const name = exerciseName ?? 'unknown';
        setCorrections(analyzeForm(kps, name));
      }
    } catch (err) {
      // Silently ignore frame errors — camera may not be ready
    } finally {
      processingRef.current = false;
    }
  }, [detector, exerciseName]);

  // Start frame processing loop once detector is ready
  useEffect(() => {
    if (!tfReady || !permission?.granted) return;
    intervalRef.current = setInterval(processFrame, FRAME_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tfReady, permission?.granted, processFrame]);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  if (!permission.granted) {
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

  // Scale factors to map model coordinates → screen coordinates
  // MoveNet outputs in the input image size (192×192 for Lightning)
  const scaleX = screenWidth / MODEL_INPUT_SIZE;
  const scaleY = cameraHeight / MODEL_INPUT_SIZE;

  const primaryCorrection = corrections[0];

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

      {/* Camera + Skeleton */}
      <View style={[styles.cameraContainer, { height: cameraHeight }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
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
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  flipBtn: { padding: 4 },
  flipText: { fontSize: 20 },
  cameraContainer: { width: '100%', overflow: 'hidden', position: 'relative' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 },
  feedbackPanel: { flex: 1, backgroundColor: '#111' },
  feedbackContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  waitingText: { color: '#6b7280', fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: Spacing.md },
  correction: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: 8,
  },
  correctionError: { backgroundColor: 'rgba(220,38,38,0.15)', borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  correctionWarning: { backgroundColor: 'rgba(245,158,11,0.15)', borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  correctionGood: { backgroundColor: 'rgba(22,163,74,0.15)', borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  correctionIcon: { fontSize: 16, marginTop: 1 },
  correctionText: { flex: 1, color: '#e5e7eb', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  disclaimer: { ...Typography.caption, color: '#6b7280', textAlign: 'center', marginTop: Spacing.md, fontStyle: 'italic' },
  permissionText: { color: '#fff', textAlign: 'center', marginBottom: Spacing.md, fontFamily: 'Inter_400Regular' },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
});
