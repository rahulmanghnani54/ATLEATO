import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSubmitCheckin } from '@/hooks/usePhysiqueCheckins';
import { PhysiqueScoreCard } from '@/components/progress/PhysiqueScoreCard';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';

type Step = 'cadence' | 'front' | 'side' | 'back' | 'processing' | 'done';
type Cadence = 'weekly' | 'biweekly' | 'monthly';

const CADENCE_DAYS: Record<Cadence, string> = {
  weekly: 'Every 7 days',
  biweekly: 'Every 14 days',
  monthly: 'Every 30 days',
};

export default function PhysiqueCheckin() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { mutateAsync: submitCheckin } = useSubmitCheckin();

  const [step, setStep] = useState<Step>('cadence');
  const [cadence, setCadence] = useState<Cadence>('biweekly');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [sideUri, setSideUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [result, setResult] = useState<{ fullness: number; leanness: number; symmetry: number; narrative: string } | null>(null);

  const selectedProgram = (profile as any)?.selected_program as string | undefined;
  const persona = selectedProgram && EXPERT_PROGRAMS[selectedProgram]
    ? EXPERT_PROGRAMS[selectedProgram].id.split('_')[0]
    : 'cbum';

  const pickPhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to continue.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const takePhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to continue.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const handlePhotoStep = async (
    setter: (uri: string) => void,
    nextStep: Step,
  ) => {
    Alert.alert('Add photo', 'Choose source', [
      { text: 'Camera', onPress: async () => { const u = await takePhoto(); if (u) { setter(u); setStep(nextStep); } } },
      { text: 'Photo Library', onPress: async () => { const u = await pickPhoto(); if (u) { setter(u); setStep(nextStep); } } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleProcess = async () => {
    if (!frontUri) return;
    setStep('processing');
    try {
      const res = await submitCheckin({
        date: new Date().toISOString().slice(0, 10),
        cadence,
        persona,
        frontUri,
        sideUri: sideUri ?? undefined,
        backUri: backUri ?? undefined,
      });
      if (res.scores) setResult(res.scores);
      setStep('done');
    } catch {
      Alert.alert('Error', 'Failed to save check-in. Please try again.');
      setStep('back');
    }
  };

  // Cadence step
  if (step === 'cadence') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>STEP 1 OF 4</Text>
          <Text style={styles.headline}>HOW OFTEN?</Text>
          <Text style={styles.sub}>Choose your check-in cadence. You can change this later.</Text>
          <View style={styles.optionList}>
            {(['weekly', 'biweekly', 'monthly'] as Cadence[]).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.option, cadence === c && styles.optionSelected]}
                onPress={() => setCadence(c)}
              >
                <Text style={[styles.optionTitle, cadence === c && styles.optionTitleSelected]}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </Text>
                <Text style={styles.optionSub}>{CADENCE_DAYS[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('front')}>
            <Text style={styles.primaryBtnText}>CONTINUE →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Photo step helper
  const renderPhotoStep = (
    stepNum: number,
    title: string,
    required: boolean,
    uri: string | null,
    onAdd: () => void,
    onNext: () => void,
    onSkip?: () => void,
  ) => (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>STEP {stepNum} OF 4</Text>
        <Text style={styles.headline}>{title}</Text>
        {!required && <Text style={styles.optionalTag}>OPTIONAL</Text>}
        <TouchableOpacity style={styles.photoBox} onPress={onAdd}>
          {uri ? (
            <Image source={{ uri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
              <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.btnRow}>
          {onSkip && (
            <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipBtnText}>SKIP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, styles.primaryBtnFlex, !uri && required && { opacity: 0.5 }]}
            onPress={onNext}
            disabled={!uri && required}
          >
            <Text style={styles.primaryBtnText}>NEXT →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  if (step === 'front') return renderPhotoStep(
    2, 'FRONT PHOTO', true, frontUri,
    () => handlePhotoStep(setFrontUri, 'front'),
    () => setStep('side'),
  );

  if (step === 'side') return renderPhotoStep(
    3, 'SIDE PHOTO', false, sideUri,
    () => handlePhotoStep(setSideUri, 'side'),
    () => setStep('back'),
    () => setStep('back'),
  );

  if (step === 'back') return renderPhotoStep(
    4, 'BACK PHOTO', false, backUri,
    () => handlePhotoStep(setBackUri, 'back'),
    handleProcess,
    handleProcess,
  );

  if (step === 'processing') return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.processingText}>Encrypting & uploading…</Text>
        <Text style={styles.processingSubText}>Getting AI analysis from your coach</Text>
      </View>
    </SafeAreaView>
  );

  // Done step
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.doneTitle}>CHECK-IN SAVED</Text>
        {result && (
          <>
            <View style={styles.scoreRow}>
              <PhysiqueScoreCard label="FULLNESS" scoreA={null} scoreB={result.fullness} />
              <PhysiqueScoreCard label="LEANNESS" scoreA={null} scoreB={result.leanness} />
              <PhysiqueScoreCard label="SYMMETRY" scoreA={null} scoreB={result.symmetry} />
            </View>
            <View style={styles.narrativeCard}>
              <Text style={styles.narrativeLabel}>✦ {persona.toUpperCase()} SAYS</Text>
              <Text style={styles.narrativeText}>{result.narrative}</Text>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>VIEW TIMELINE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 20, paddingTop: 14 },
  center: { alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 20, color: Colors.textSecondary },
  stepLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 6 },
  headline: { fontFamily: Fonts.display, fontSize: 32, color: Colors.text, letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 24 },
  optionalTag: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.warning, letterSpacing: 1.2, marginBottom: 16 },
  optionList: { gap: 10, marginBottom: 24 },
  option: {
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: 'rgba(223,255,31,0.05)' },
  optionTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, marginBottom: 3 },
  optionTitleSelected: { color: Colors.primary },
  optionSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 0.8 },
  photoBox: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  photoPreview: { flex: 1, width: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  photoPlaceholderIcon: { fontSize: 40 },
  photoPlaceholderText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textTertiary },
  btnRow: { flexDirection: 'row', gap: 10 },
  skipBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  skipBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 1 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnFlex: { flex: 1, marginTop: 0 },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 1 },
  processingText: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, marginTop: 20 },
  processingSubText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  doneTitle: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, marginBottom: 24, letterSpacing: -0.5 },
  scoreRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  narrativeCard: {
    backgroundColor: 'rgba(91,140,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(91,140,255,0.2)',
    borderRadius: 6,
    padding: 16,
    marginBottom: 24,
  },
  narrativeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.4, marginBottom: 8 },
  narrativeText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },
});
