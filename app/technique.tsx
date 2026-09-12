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
 * The OS camera permission is asked ONCE, on CAMERA READY, where the page has
 * just explained what the camera is for. form-coach never auto-prompts: if
 * permission is missing when it mounts it shows its own gate with a retry
 * button, so a refusal here is never followed by a second dialog on landing
 * (the second "deny" on Android is the permanent one).
 *
 * Root-level Stack sibling of `form-coach`, never under `(tabs)/` — the
 * handoff is a REPLACE, and a replace from inside the tab group would swap
 * out the whole tab navigator. Step machine in-file, as `physique-checkin`.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCameraPermission } from 'react-native-vision-camera';

import { CameraSetupFigure } from '@/components/formcoach/CameraSetupFigure';
import { KeyPointsList } from '@/components/formcoach/KeyPointsList';
import { TechniquePlayer } from '@/components/formcoach/TechniquePlayer';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton, SkeletonLines } from '@/components/ui/motion';
import {
  getExerciseForm,
  getExerciseFormKey,
  hasVisionCoverage,
  keyPointsFor,
  visionCategoryFor,
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

/** Engine categories judged from the waist up — framing asks for less body. */
type BodyRegion = 'upper' | 'lower';
const UPPER_CATEGORIES = new Set<string>(['press', 'curl', 'pull']);

/**
 * The six camera-setup rows. The engine cannot measure the camera angle, so
 * these instructions are the only thing standing between the user and a set
 * judged from a view the checks were never written for.
 *
 * Rows 1–3 are DERIVED from the entry (angle, bench or floor, upper or lower
 * body) so they agree with the cameraNote printed above them and with the
 * SETTING UP checklist the camera will run: a bench press is framed from the
 * foot of the bench and needs shoulders/elbows/wrists, a deadlift from the
 * side with hips/knees/ankles. One generic list contradicted both. Height is
 * the cameraNote's job (it names knee/hip/bench height per lift), so no row
 * repeats it. Rows 4–6 restate what the live pose-quality advice asks for
 * once the camera is open, so the user hears it before, not after.
 */
function setupRows(angle: CameraAngle, orientation: Orientation, region: BodyRegion): string[] {
  const placement: Record<Orientation, Record<CameraAngle, string>> = {
    lying: {
      front_45: 'Put the phone at the foot of the bench, 30–45° off to one side.',
      side: 'Put the phone directly to your side, level with the bench.',
      front: 'Put the phone at the foot of the bench, straight on.',
    },
    standing: {
      side: 'Put the phone directly to your side, square to the movement.',
      front: 'Put the phone straight in front of you.',
      front_45: 'Put the phone in front of you, 30–45° off to one side.',
    },
  };
  const upper = region === 'upper';
  return [
    placement[orientation][angle],
    upper
      ? 'Keep your head, torso and both arms in the frame.'
      : 'Keep your whole body in the frame, head to feet.',
    upper
      ? 'Shoulders, elbows and wrists must all stay visible.'
      : 'Hips, knees and ankles must all stay visible.',
    'Face the light — a window or lamp behind the phone, not behind you.',
    "Stand the phone on something steady; don't hold it.",
    'Not too close — step back until there is room around you in the frame.',
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
  const category = visionCategoryFor(form);
  const region: BodyRegion = category && UPPER_CATEGORIES.has(category) ? 'upper' : 'lower';
  // By convention, not by flag: every exercise with a form entry asks the
  // bucket for `<id>_v<version>.mp4` (version 1 unless the entry says
  // otherwise). Uploading a clip is therefore the whole release process; the
  // player answers a 404 with the poster and lib/tutorialClips remembers it.
  const objectPath = form ? clipObjectPath(form.id, form.tutorial?.version ?? 1) : null;

  const { loaded, entry, fastPath, watched, skipped, setupSeen } = useTutorialMemory(key);

  // Every exit here awaits a memory write (or the OS permission dialog) before
  // navigating, and the write must land before the handoff. If the user
  // hardware-backs during that await this screen is already gone, and a
  // trailing router.back() would pop the screen UNDER it as well.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
  // Set by the player once the clip is on disk and mounting — the CTA label
  // follows what is actually on screen, not whether a clip might exist.
  const [clipReady, setClipReady] = useState(false);
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
    if (!alive.current) return;
    track('tutorial_completed', {
      exercise: key,
      trigger: triggerRef.current ?? 'manual',
      watched_count: (entry?.watched ?? 0) + 1,
    });
    setBusy(false);
    // Opened from inside Form Check: the camera is already under us. An
    // uncovered exercise has no camera at all, so its DONE ends here too —
    // it must never reach the "ready to check your form?" step.
    if (review || !covered) { router.back(); return; }
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
    if (!alive.current) return;
    setBusy(false);
    if (!covered) { router.back(); return; }
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
    if (!alive.current) return;
    await setupSeen();
    if (!alive.current) return;
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
  // SETUP is numbered only when it follows DONE. Reached from READY or via
  // SKIP, steps 1–2 were never shown, so "3 of 3" would count phantom steps.
  const setupEyebrow = stepped && setupReturn === 'done' ? 'STEP 3 OF 3' : 'CAMERA SETUP';

  // The poster doubles as the loading state and, for most exercises, the only
  // state there is until a clip is uploaded. The figure's viewBox is 240×132,
  // so its width is derived from the slab height it has to fit inside. The
  // PREVIEW poster is the lifter alone: the phone and sight-line belong to the
  // SETUP step, and a how-to card for an uncovered exercise has no such step.
  const playerH = Math.round((width * 9) / 16);
  const renderFigure = (height: number, showPhone: boolean) => (
    <View style={[styles.slab, { height }]}>
      <CameraSetupFigure
        orientation={orientation}
        cameraAngle={cameraAngle}
        accent={pa.accentText}
        ink={tokens.text}
        width={Math.min(Math.round(height * (240 / 132) * 0.92), width - BODY_PAD * 2)}
        showPhone={showPhone}
      />
    </View>
  );

  // Memory is not in yet: the crown is known, the body is not. Never flash the
  // preview at a lifter who is about to be fast-pathed past it.
  if (!loaded) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={32}>
        <Crown eyebrow="TECHNIQUE" title={title} onBack={() => router.back()} />
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
    const hasClip = clipReady && !clipFailed;
    // An uncovered exercise's how-to card ends here: DONE, no camera claim.
    const primary = !covered ? 'DONE' : hasClip ? 'WATCH TECHNIQUE' : 'CONTINUE';
    return (
      <Frame
        footer={
          <>
            {renderCta(primary, onWatched, busy)}
            {/* In review mode the lifter ASKED for this page; leaving it is not
                a skip and must not count toward the fast path. */}
            {review
              ? renderTextBtn('BACK TO CAMERA', () => router.back())
              : renderTextBtn('I KNOW THIS — SKIP', onSkipped)}
          </>
        }
      >
        <Crown
          eyebrow={stepped ? 'STEP 1 OF 3' : 'TECHNIQUE'}
          title={title}
          onBack={() => router.back()}
        />

        <TechniquePlayer
          objectPath={objectPath}
          poster={renderFigure(playerH, false)}
          height={playerH}
          onReady={() => setClipReady(true)}
          onError={() => setClipFailed(true)}
          accessibilityLabel={`${exerciseName} technique clip, looping`}
          testID="technique-player"
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Key points">
            <KeyPointsList points={points} accent={pa.accentText} />
          </Section>
        </SafeAreaView>
      </Frame>
    );
  }

  if (step === 'done') {
    return (
      <Frame
        footer={
          <>
            {renderCta('START FORM CHECK', () => (entry?.setupSeen ? handoff() : goSetup('done')))}
            {renderSecondary('WATCH AGAIN', () => setChosen('preview'))}
          </>
        }
      >
        <Crown
          eyebrow="STEP 2 OF 3"
          title="READY TO CHECK YOUR FORM?"
          meta={exerciseName}
          onBack={() => setChosen('preview')}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Key points">
            <KeyPointsList points={points} accent={pa.accentText} />
          </Section>
        </SafeAreaView>
      </Frame>
    );
  }

  if (step === 'setup') {
    return (
      <Frame
        footer={
          <>
            {renderCta('CAMERA READY', onCameraReady, busy)}
            {renderSecondary('BACK', () => setChosen(setupReturn))}
          </>
        }
      >
        <Crown
          eyebrow={setupEyebrow}
          title="SET UP YOUR CAMERA"
          meta={exerciseName}
          onBack={() => setChosen(setupReturn)}
        />

        {renderFigure(Math.round(playerH * 0.8), true)}

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          {form?.cameraNote ? <Text style={styles.cameraNote}>{form.cameraNote}</Text> : null}

          <Section label="Setup">
            <KeyPointsList points={setupRows(cameraAngle, orientation, region)} accent={pa.accentText} />
          </Section>
        </SafeAreaView>
      </Frame>
    );
  }

  // ready — the fast path. Two taps from the Form chip to the camera. No
  // "mark as known" control: anyone who sees this step already satisfies the
  // fast-path rule (watched ≥ 1 or skipped ≥ 2), so a switch could not
  // restore the walkthrough — VIEW TECHNIQUE is how it is re-opened.
  return (
    <Frame
      footer={
        <>
          {renderCta('START FORM CHECK', handoff)}
          {renderSecondary('VIEW TECHNIQUE', () => setChosen('preview'))}
          {renderTextBtn('CAMERA SETUP', () => goSetup('ready'))}
        </>
      }
    >
      <Crown
        eyebrow="TECHNIQUE"
        title={title}
        meta="You've done this one before."
        onBack={() => router.back()}
      />

      {/* Not an empty page: the returning lifter still gets the loop and the
          key points while choosing, and the clip is a cache hit by now. */}
      <TechniquePlayer
        objectPath={objectPath}
        poster={renderFigure(playerH, false)}
        height={playerH}
        onReady={() => setClipReady(true)}
        onError={() => setClipFailed(true)}
        accessibilityLabel={`${exerciseName} technique clip, looping`}
        testID="technique-player-ready"
      />

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="Key points">
          <KeyPointsList points={points} accent={pa.accentText} />
        </Section>
      </SafeAreaView>
    </Frame>
  );
}

/**
 * Scrolling page with the actions PINNED under it. On a tall phone the crown,
 * the 16:9 poster and five key points already fill the viewport, which put
 * CONTINUE and — worse — "I KNOW THIS — SKIP" below the fold: the one control
 * an experienced lifter is promised is the one they had to scroll to find.
 * CanvasScreen keeps the crown/status-bar behaviour; the footer sits outside
 * its ScrollView so it never scrolls, and takes the bottom inset itself.
 */
function Frame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.fill, { backgroundColor: tokens.bg }]}>
      <CanvasScreen tabBar={false} bottomSpace={0} contentStyle={styles.scrollContent}>
        {children}
      </CanvasScreen>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.footer}>
        {footer}
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: BODY_PAD },
  // Overrides CanvasScreen's own bottom inset padding — the footer owns it.
  scrollContent: { paddingBottom: 20 },
  footer: {
    paddingHorizontal: BODY_PAD,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: t.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },

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
});
