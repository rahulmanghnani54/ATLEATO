/**
 * Technique — the card between "tap an exercise" and "the camera opens".
 *
 * Learn → Prepare → Perform, as one object moving forward: PREVIEW (clip or
 * poster + KEY POINTS) → DONE (ready to check your form?) → SETUP (where the
 * phone goes) → hand off to Form Check. A lifter the app already knows lands
 * on READY instead and is two taps from the camera.
 *
 * Every exercise opens here, not only the camera-covered ones: Rack Pull, Leg
 * Press and friends get the same key points (falling back to their tips), but
 * only an exercise with an honest engine profile (`hasVisionCoverage`) is ever
 * offered START FORM CHECK or the camera-setup step. Opening a camera that
 * watches in silence is worse than offering nothing.
 *
 * The paywall gate lives HERE, not in form-coach, and only on the covered
 * path: form-coach used to queue the paywall replace and request the OS
 * camera permission in the same commit, so a free user got the permission
 * prompt on top of the paywall. Nothing on the uncovered path is paid.
 *
 * Root-level Stack sibling of `form-coach`, never under `(tabs)/` — the
 * handoff is a REPLACE, and a replace from inside the tab group would swap
 * out the whole tab navigator. Step machine in-file, as `physique-checkin`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCameraPermission } from 'react-native-vision-camera';

import { CameraSetupFigure } from '@/components/formcoach/CameraSetupFigure';
import { KeyPointsList } from '@/components/formcoach/KeyPointsList';
import { TechniquePlayer } from '@/components/formcoach/TechniquePlayer';
import { CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton, SkeletonLines } from '@/components/ui/motion';
import {
  getExerciseForm,
  getExerciseFormKey,
  hasVisionCoverage,
  keyPointsFor,
} from '@/constants/exerciseFormLibrary';
import { Fonts } from '@/constants/theme';
import { useTutorialMemory } from '@/hooks/useTutorialMemory';
import { track } from '@/lib/analytics';
import { canAccess } from '@/lib/featureGates';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { clipObjectPath } from '@/lib/tutorialClips';

type Step = 'ready' | 'preview' | 'done' | 'setup';
type CameraAngle = 'side' | 'front' | 'front_45';
type Orientation = 'lying' | 'standing';
/** Why the walkthrough appeared — forced on a first-timer, or asked for. */
type Trigger = 'first_time' | 'manual';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

/** Form ids whose lifter is on a bench, so the setup figure lies down. */
const LYING_FORM_IDS = new Set(['bench_press', 'incline_db_press']);

/**
 * The six camera-setup rows. The engine cannot measure the camera angle, so
 * these instructions are the only thing standing between the user and a set
 * judged from a view the checks were never written for. Rows 5 and 6 restate
 * what the live pose-quality advice asks for once the camera is open
 * (lighting, a clear background) so the user hears it before, not after.
 */
function setupRows(angle: CameraAngle, orientation: Orientation): string[] {
  const place: Record<CameraAngle, string> = {
    side: 'Put it directly to your side, square to the movement.',
    front: 'Put it straight in front of you.',
    front_45: 'Put it in front of you, 30–45° off to one side.',
  };
  return [
    'Stand your phone upright on something steady — a bench, a bag, a bottle.',
    place[angle],
    orientation === 'lying'
      ? 'Keep it at bench height, level — not looking down at you.'
      : 'Keep it level with your torso — not tilted up or down at you.',
    'Step back until your whole body fits in the frame.',
    'Face the light: a window or lamp behind the phone, not behind you.',
    'Clear the background — one person in frame, nothing moving behind you.',
  ];
}

export default function Technique() {
  const router = useRouter();
  const { exerciseName: nameParam, persona: personaParam, mode } = useLocalSearchParams<{
    exerciseName: string;
    persona?: string;
    mode?: string;
  }>();
  const exerciseName = nameParam ?? '';
  const review = mode === 'review';

  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width } = useWindowDimensions();
  const { requestPermission } = useCameraPermission();

  // Callers pass either a PersonaId or a programId; normalise ONCE here and
  // forward the canonical id, so form-coach's local matcher never sees a
  // program id it would drop to cbum.
  const personaTheme = personaFromProgramId(personaParam);
  const personaId = personaTheme.id;
  const pa = personaAccent(personaTheme, scheme);

  const form = getExerciseForm(exerciseName);
  const key = getExerciseFormKey(exerciseName);
  const covered = hasVisionCoverage(exerciseName);
  const points = keyPointsFor(exerciseName);
  const cameraAngle: CameraAngle = form?.cameraAngle ?? 'side';
  const orientation: Orientation = form && LYING_FORM_IDS.has(form.id) ? 'lying' : 'standing';
  const objectPath = form?.tutorial ? clipObjectPath(form.id, form.tutorial.version) : null;

  const { loaded, entry, fastPath, watched, skipped, setKnown, setupSeen } = useTutorialMemory(key);

  useEffect(() => {
    if (covered && !canAccess('ai_form_coach')) {
      router.replace('/paywall?feature=ai_form_coach' as any);
    }
    // Mount-only, like every other feature gate in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `chosen` is null until the user moves; before that the step is derived
  // from memory, which is exactly what lets us skip the preview for a lifter
  // who has been here. Review mode always shows the preview, and an uncovered
  // exercise has no camera to fast-path TO — its how-to card IS the value.
  const [chosen, setChosen] = useState<Step | null>(null);
  const step: Step = chosen ?? (!review && covered && fastPath ? 'ready' : 'preview');
  // Where BACK on the setup step returns to — it is reachable from three places.
  const [setupReturn, setSetupReturn] = useState<Step>('done');
  const [clipFailed, setClipFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // One `tutorial_shown` per screen, fired when the preview is first on screen
  // (which is mount for a first-timer, VIEW TECHNIQUE for a fast-path lifter).
  const triggerRef = useRef<Trigger | null>(null);
  useEffect(() => {
    if (!loaded || step !== 'preview' || triggerRef.current) return;
    triggerRef.current = chosen === null && !review ? 'first_time' : 'manual';
    track('tutorial_shown', {
      exercise: key,
      trigger: triggerRef.current,
      watched_count: entry?.watched ?? 0,
    });
  }, [loaded, step, chosen, review, key, entry?.watched]);

  const handoff = useCallback(() => {
    router.replace({ pathname: '/form-coach', params: { exerciseName, persona: personaId } } as any);
  }, [router, exerciseName, personaId]);

  const goSetup = (from: Step) => {
    setSetupReturn(from);
    setChosen('setup');
  };

  const onWatched = async () => {
    if (busy) return;
    setBusy(true);
    await watched();
    track('tutorial_completed', {
      exercise: key,
      trigger: triggerRef.current ?? 'manual',
      watched_count: (entry?.watched ?? 0) + 1,
    });
    setBusy(false);
    // Opened from inside Form Check: the camera is already under us.
    if (review) { router.back(); return; }
    setChosen('done');
  };

  const onSkipped = async () => {
    if (busy) return;
    setBusy(true);
    track('tutorial_skipped', {
      exercise: key,
      trigger: triggerRef.current ?? 'manual',
      watched_count: entry?.watched ?? 0,
    });
    // Read setupSeen BEFORE the write replaces the entry.
    const firstSetup = !entry?.setupSeen;
    await skipped();
    setBusy(false);
    if (review || !covered) { router.back(); return; }
    if (firstSetup) { goSetup('preview'); return; }
    handoff();
  };

  const onCameraReady = async () => {
    if (busy) return;
    setBusy(true);
    // Asked here, on a page that explains why, instead of the moment the
    // camera screen mounts. A refusal is not fatal: form-coach shows its own
    // permission gate with a retry.
    try { await requestPermission(); } catch { /* handled on the next screen */ }
    await setupSeen();
    handoff();
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

  // Same pill, outlined: a real second choice, not a competing hero.
  const renderSecondary = (label: string, onPress: () => void) => (
    <PressableScale
      onPress={onPress}
      haptic="light"
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.secondary}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </PressableScale>
  );

  // Bare mono text: for the exits and side doors.
  const renderTextBtn = (label: string, onPress: () => void) => (
    <PressableScale
      onPress={onPress}
      haptic="light"
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.textBtn}
    >
      <Text style={styles.textBtnLabel}>{label}</Text>
    </PressableScale>
  );

  const title = exerciseName.toUpperCase();
  // "1 of 3" is only true on the full covered flow. A how-to card for an
  // uncovered exercise and a review from inside the camera have no steps.
  const stepped = covered && !review;

  // The poster doubles as the loading state and, for most exercises, the only
  // state there is until a clip is uploaded. The figure's viewBox is 240×132,
  // so its width is derived from the slab height it has to fit inside.
  const playerH = Math.round((width * 9) / 16);
  const renderFigure = (height: number) => (
    <View style={[styles.slab, { height }]}>
      <CameraSetupFigure
        orientation={orientation}
        cameraAngle={cameraAngle}
        accent={pa.accentText}
        ink={tokens.text}
        width={Math.min(Math.round(height * (240 / 132) * 0.92), width - BODY_PAD * 2)}
      />
    </View>
  );

  // Memory is not in yet: the crown is known, the body is not. Never flash the
  // preview at a lifter who is about to be fast-pathed past it.
  if (!loaded) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown eyebrow="Technique" title={title} onBack={() => router.back()} />
        <Skeleton height={playerH} radius={0} />
        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Key points">
            <SkeletonLines count={4} height={14} />
          </Section>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  if (step === 'preview') {
    const hasClip = objectPath !== null && !clipFailed;
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown
          eyebrow={stepped ? 'TECHNIQUE · STEP 1 OF 3' : 'Technique'}
          title={title}
          onBack={() => router.back()}
        />

        <TechniquePlayer
          objectPath={objectPath}
          poster={renderFigure(playerH)}
          height={playerH}
          onError={() => setClipFailed(true)}
          testID="technique-player"
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Key points">
            <KeyPointsList points={points} accent={pa.accentText} />
          </Section>

          <View style={styles.ctaBlock}>
            {renderCta(hasClip ? 'WATCH TECHNIQUE' : 'CONTINUE', onWatched, busy)}
            {renderTextBtn('I KNOW THIS — SKIP', onSkipped)}
          </View>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  if (step === 'done') {
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown
          eyebrow={stepped ? 'STEP 2 OF 3' : 'Technique'}
          title="READY TO CHECK YOUR FORM?"
          meta={exerciseName}
          onBack={() => setChosen('preview')}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Key points">
            <KeyPointsList points={points} accent={pa.accentText} />
          </Section>

          <View style={styles.ctaBlock}>
            {covered
              ? renderCta('START FORM CHECK', () => (entry?.setupSeen ? handoff() : goSetup('done')))
              : renderCta('DONE', () => router.back())}
            {renderSecondary('WATCH AGAIN', () => setChosen('preview'))}
          </View>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  if (step === 'setup') {
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown
          eyebrow="STEP 3 OF 3"
          title="SET UP YOUR CAMERA"
          meta={exerciseName}
          onBack={() => setChosen(setupReturn)}
        />

        {renderFigure(Math.round(playerH * 0.8))}

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          {form?.cameraNote ? <Text style={styles.cameraNote}>{form.cameraNote}</Text> : null}

          <Section label="Setup">
            <KeyPointsList points={setupRows(cameraAngle, orientation)} accent={pa.accentText} />
          </Section>

          <View style={styles.ctaBlock}>
            {renderCta('CAMERA READY', onCameraReady, busy)}
            {renderSecondary('BACK', () => setChosen(setupReturn))}
          </View>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  // ready — the fast path. Two taps from the Form chip to the camera.
  return (
    <CanvasScreen tabBar={false} bottomSpace={32}>
      <Crown
        eyebrow="Technique"
        title={title}
        meta="You've done this one before."
        onBack={() => router.back()}
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <View style={styles.ctaBlock}>
          {renderCta('START FORM CHECK', handoff)}
          {renderSecondary('VIEW TECHNIQUE', () => setChosen('preview'))}
          {renderTextBtn('CAMERA SETUP', () => goSetup('ready'))}
        </View>

        <Hairline style={styles.knownRule} />
        <View style={styles.knownRow}>
          <View style={styles.knownText}>
            <Text style={styles.knownTitle}>Mark as known</Text>
            <Text style={styles.knownSub}>Skip the walkthrough for this exercise.</Text>
          </View>
          <Switch
            value={entry?.knowsIt ?? false}
            onValueChange={(v) => { void setKnown(v); }}
            trackColor={{ false: tokens.borderStrong, true: pa.accent }}
            thumbColor={tokens.surface}
            accessibilityLabel="Mark as known"
          />
        </View>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Poster / figure ────────────────────────────────────────────────────────
  slab: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.surfaceAlt,
  },
  cameraNote: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: t.text,
    marginTop: 24,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  ctaBlock: { marginTop: 34, gap: 10 },
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
  secondary: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.borderStrong,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.text,
  },
  textBtn: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtnLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },

  // ── Mark as known ──────────────────────────────────────────────────────────
  knownRule: { marginTop: 28 },
  knownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  knownText: { flex: 1, gap: 3 },
  knownTitle: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
  },
  knownSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.textSecondary,
  },
});
