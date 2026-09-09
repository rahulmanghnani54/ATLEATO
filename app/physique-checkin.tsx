/**
 * Physique Check-in — progress photos, Bold Canvas.
 *
 * A four-step wizard where the CAMERA is the hero: each photo step gives the
 * frame the whole light body while the dark crown carries the step count and
 * the title. The cadence step, the processing wait and the result screen all
 * share that crown so the flow reads as one object moving forward.
 *
 * Encryption, the upload mutation, every permission prompt, every Alert and the
 * paywall gate are untouched — this file changed shape, not behaviour.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check } from 'lucide-react-native';
import { useSubmitCheckin } from '@/hooks/usePhysiqueCheckins';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { canAccess } from '@/lib/featureGates';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import {
  CanvasScreen,
  Crown,
  Section,
  BigStat,
  StatRow,
} from '@/components/ui/canvas';
import { PressableScale, Skeleton, SkeletonLines } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

type Step = 'cadence' | 'front' | 'side' | 'back' | 'processing' | 'done';
type Cadence = 'weekly' | 'biweekly' | 'monthly';

const CADENCE_DAYS: Record<Cadence, string> = {
  weekly: 'Every 7 days',
  biweekly: 'Every 14 days',
  monthly: 'Every 30 days',
};

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

export default function PhysiqueCheckin() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { mutateAsync: submitCheckin } = useSubmitCheckin();
  const { scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (!canAccess('physique_photos')) {
      router.replace('/paywall?feature=physique_photos' as any);
    }
  }, []);

  const [step, setStep] = useState<Step>('cadence');
  const [cadence, setCadence] = useState<Cadence>('biweekly');
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [sideUri, setSideUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [result, setResult] = useState<{ fullness: number; leanness: number; symmetry: number; narrative: string } | null>(null);
  // The photo frame fills whatever the crown and the button row leave behind.
  // It cannot simply be flex:1 — PressableScale's animated wrapper is
  // content-sized, so a flexing child inside it collapses to nothing. Measure
  // the slot instead and hand the frame an explicit height.
  const [frameH, setFrameH] = useState(0);

  const selectedProgram = (profile as any)?.selected_program as string | undefined;
  const persona = (profile as any)?.selected_program
    ? (EXPERT_PROGRAMS[(profile as any).selected_program]?.id ?? 'cbum_evolved')
        .replace(/_(?:evolved|blueprint|fundamentals|strength|mav)$/, '')
    : 'cbum';

  // Purely for colour: the persona STRING above is what the API receives and is
  // never derived from this.
  const personaTheme = personaFromProgramId(selectedProgram);
  const pa = personaAccent(personaTheme, scheme);
  // The crown is dark in both schemes, so its tint always comes from the dark triplet.
  const crownPa = personaAccent(personaTheme, 'dark');

  // 0.7, not 1.0. These photos are scored by a vision model and shown as
  // thumbnails, and neither can tell the difference — but quality:1 produced
  // multi-MB uploads that were encrypted, stored, AND sent to the analysis
  // endpoint, so the cost of the extra bytes was paid three times over.
  const PHOTO_QUALITY = 0.7;

  const pickPhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to continue.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: PHOTO_QUALITY,
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
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: PHOTO_QUALITY });
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

  // The one accent spend on each light body.
  const renderCta = (label: string, onPress: () => void, disabled = false) => (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="heavy"
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.cta, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
    >
      <Text style={[styles.ctaText, { color: pa.ink }]}>{label}</Text>
    </PressableScale>
  );

  // Cadence step
  if (step === 'cadence') {
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown
          eyebrow="Step 1 of 4"
          title="HOW"
          accentLine="OFTEN?"
          meta="Choose your check-in cadence. You can change this later."
          accent={crownPa.accent}
          onBack={() => router.back()}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Cadence">
            <View style={styles.optionList}>
              {(['weekly', 'biweekly', 'monthly'] as Cadence[]).map((c) => {
                const on = cadence === c;
                return (
                  <PressableScale
                    key={c}
                    onPress={() => setCadence(c)}
                    haptic="light"
                    scaleTo={0.98}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${c}, ${CADENCE_DAYS[c]}`}
                    style={[
                      styles.option,
                      on && { backgroundColor: pa.accentSoft },
                    ]}
                  >
                    <View style={styles.optionText}>
                      <Text
                        style={[styles.optionTitle, on && { color: pa.accentText }]}
                        numberOfLines={1}
                      >
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Text>
                      <Text style={styles.optionSub} numberOfLines={1}>
                        {CADENCE_DAYS[c]}
                      </Text>
                    </View>
                    <View style={[styles.tick, on && { borderColor: pa.accentText }]}>
                      {on ? <Check size={14} color={pa.accentText} strokeWidth={3} /> : null}
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </Section>

          <View style={styles.ctaBlock}>{renderCta('CONTINUE →', () => setStep('front'))}</View>
        </SafeAreaView>
      </CanvasScreen>
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
    // Not scrollable: the photo frame is the hero and takes every pixel the
    // crown and the button row leave behind.
    <CanvasScreen scroll={false} tabBar={false} bottomSpace={18}>
      <Crown
        eyebrow={`Step ${stepNum} of 4`}
        title={title.replace(/ PHOTO$/, '')}
        accentLine="PHOTO"
        pills={[required ? 'Required' : 'Optional']}
        accent={crownPa.accent}
        onBack={() => router.back()}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.photoBody}>
        <View
          style={styles.frameSlot}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            setFrameH((prev) => (prev === h ? prev : h));
          }}
        >
          {frameH > 0 ? (
            <PressableScale
              onPress={onAdd}
              haptic="medium"
              scaleTo={0.985}
              accessibilityRole="button"
              accessibilityLabel={uri ? `Replace ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
              style={[styles.photoBox, { height: frameH }]}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Camera size={34} color={pa.accentText} strokeWidth={1.5} />
                  <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                </View>
              )}
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.btnRow}>
          {onSkip && (
            <PressableScale
              onPress={onSkip}
              haptic="light"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              style={styles.skipBtn}
            >
              <Text style={styles.skipBtnText}>SKIP</Text>
            </PressableScale>
          )}
          <View style={styles.nextSlot}>{renderCta('NEXT →', onNext, !uri && required)}</View>
        </View>
      </SafeAreaView>
    </CanvasScreen>
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

  // Processing — skeletons shaped like the scores and the coach read that land
  // next, so the screen already looks built while the upload runs.
  if (step === 'processing') return (
    <CanvasScreen tabBar={false} bottomSpace={32}>
      <Crown
        eyebrow="Physique check-in"
        title="ENCRYPTING"
        accentLine="& UPLOADING…"
        meta="Getting AI analysis from your coach"
        accent={crownPa.accent}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="Scores">
          <View style={styles.skelRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skelCell}>
                <Skeleton height={38} radius={10} />
                <Skeleton height={8} width="72%" radius={4} />
              </View>
            ))}
          </View>
        </Section>

        <Section label={`✦ ${persona.toUpperCase()} SAYS`}>
          <View style={styles.narrativeCard}>
            <SkeletonLines count={3} height={14} />
          </View>
        </Section>
      </SafeAreaView>
    </CanvasScreen>
  );

  // Done step
  return (
    <CanvasScreen tabBar={false} bottomSpace={32}>
      <Crown
        eyebrow="Physique check-in"
        title="CHECK-IN"
        accentLine="SAVED"
        accent={crownPa.accent}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {result && (
          <>
            <Section label="Scores">
              <StatRow>
                <BigStat value={result.fullness} label="FULLNESS" size={38} />
                <BigStat value={result.leanness} label="LEANNESS" size={38} />
                <BigStat value={result.symmetry} label="SYMMETRY" size={38} />
              </StatRow>
            </Section>

            <Section label={`✦ ${persona.toUpperCase()} SAYS`}>
              <View style={styles.narrativeCard}>
                <Text style={styles.narrativeText}>{result.narrative}</Text>
              </View>
            </Section>
          </>
        )}

        <View style={styles.ctaBlock}>{renderCta('VIEW TIMELINE', () => router.back())}</View>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Cadence ────────────────────────────────────────────────────────────────
  optionList: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  optionText: { flex: 1, gap: 5 },
  optionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 21,
    letterSpacing: -0.9,
    color: t.text,
  },
  optionSub: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: t.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Photo steps ────────────────────────────────────────────────────────────
  photoBody: {
    flex: 1,
    paddingHorizontal: BODY_PAD,
    paddingTop: 24,
  },
  // The slot carries the plate so nothing flashes on the measuring frame.
  frameSlot: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: t.surfaceAlt,
    marginBottom: 18,
  },
  photoBox: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: t.surfaceAlt,
  },
  photoPreview: { flex: 1, width: '100%' },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  photoPlaceholderText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextSlot: { flex: 1 },
  skipBtn: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 26,
  },
  skipBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },

  // ── Results ────────────────────────────────────────────────────────────────
  skelRow: { flexDirection: 'row', gap: 14 },
  skelCell: { flex: 1, gap: 9 },
  narrativeCard: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  narrativeText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 23,
    fontStyle: 'italic',
    color: t.text,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  ctaBlock: { marginTop: 34 },
  cta: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
  },
});
