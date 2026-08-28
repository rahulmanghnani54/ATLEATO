/**
 * Physique Compare — before/after, Bold Canvas.
 *
 * The two frames ARE the hero: they take the top of the light body at full
 * width, and everything else is reduced to type around them. The dark crown
 * holds only what the pair needs to be read — the date range and the pose
 * switch — so nothing competes with the photographs.
 *
 * The three scores collapse into their DELTA, which is the only number a
 * before/after actually asks for; the raw A→B pair drops to a mono caption
 * under it. Direction still reads as colour on exactly the old rule
 * (up = success, down = warning, flat/unknown = tertiary).
 *
 * The analysis query, its gating, the decryption path, every loading branch and
 * the persona label map are untouched — this file changed shape, not behaviour.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  usePhysiqueCheckins,
  usePhysiqueAnalysis,
  decryptStorageBlob,
  type PhysiqueCheckin,
} from '@/hooks/usePhysiqueCheckins';
import { useAuthStore } from '@/stores/authStore';
import { Fonts } from '@/constants/theme';
import { EXPERT_PROGRAMS } from '@/constants/experts';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { CanvasScreen, Crown, Section, StatRow } from '@/components/ui/canvas';
import { PressableScale, Skeleton, SkeletonLines } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

type Pose = 'front' | 'side' | 'back';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;
// Photo frames sit in the 19-30px band; the plate radius and the skeleton's
// must agree or the shimmer corners cut outside the frame.
const PHOTO_RADIUS = 26;

function decryptedImageUri(userId: string, path: string | null, setUri: (u: string) => void): () => void {
  if (!path) return () => {};
  let active = true;
  decryptStorageBlob(userId, path)
    .then((bytes) => {
      if (!active) return;
      const CHUNK = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      setUri(`data:image/jpeg;base64,${btoa(binary)}`);
    })
    .catch(() => {});
  return () => { active = false; };
}

export default function PhysiqueCompare() {
  const router = useRouter();
  const { checkinAId, checkinBId } = useLocalSearchParams<{ checkinAId: string; checkinBId: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { data: allCheckins = [] } = usePhysiqueCheckins();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const selectedProgram = profile?.selected_program ?? null;
  const programId = selectedProgram ? (EXPERT_PROGRAMS[selectedProgram]?.id ?? 'cbum_evolved') : 'cbum_evolved';
  // Derive persona prefix from program id (e.g. 'cbum_evolved' -> 'cbum', 'dr_mike_mav' -> 'dr_mike')
  const persona = programId.replace(/_(?:evolved|blueprint|fundamentals|strength|mav)$/, '');

  const PERSONA_LABELS: Record<string, string> = {
    cbum: 'THE SCULPTOR SAYS', arnold: 'THE GOVERNOR SAYS', nippard: 'THE SCIENTIST SAYS',
    ct: 'THE COMMANDER SAYS', ct_fletcher: 'THE COMMANDER SAYS', dr_mike: 'DR. GROWTH SAYS',
  };

  // Purely for colour. The persona STRING above is what the API receives and is
  // never derived from this.
  const personaTheme = personaFromProgramId(selectedProgram);
  const pa = personaAccent(personaTheme, scheme);
  // The crown is dark in both schemes, so its tint always comes from the dark triplet.
  const crownPa = personaAccent(personaTheme, 'dark');

  const checkinA = allCheckins.find((c) => c.id === checkinAId) ?? null;
  const checkinB = allCheckins.find((c) => c.id === checkinBId) ?? null;

  const [activePose, setActivePose] = useState<Pose>('front');
  const [uriA, setUriA] = useState<string>('');
  const [uriB, setUriB] = useState<string>('');
  // The frames are aspect-ratio boxes, so their height is only known after
  // layout — and Skeleton needs a real number, not a ratio, to shimmer at the
  // photo's own size instead of a guessed strip.
  const [photoH, setPhotoH] = useState(0);

  // Available poses = poses captured in BOTH check-ins
  const availablePoses: Pose[] = (['front', 'side', 'back'] as Pose[]).filter(
    (p) => checkinA && checkinB && checkinA[`${p}_path` as keyof PhysiqueCheckin] && checkinB[`${p}_path` as keyof PhysiqueCheckin]
  );

  // Decrypt images when pose or checkins change
  useEffect(() => {
    if (!user || !checkinA || !checkinB) return;
    setUriA('');
    setUriB('');
    const pathA = checkinA[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    const pathB = checkinB[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    const cleanupA = decryptedImageUri(user.id, pathA, setUriA);
    const cleanupB = decryptedImageUri(user.id, pathB, setUriB);
    return () => { cleanupA(); cleanupB(); };
  }, [activePose, checkinA?.id, checkinB?.id, user?.id]);

  const {
    data: analysis,
    isLoading: analysisLoading,
  } = usePhysiqueAnalysis(
    checkinAId ?? null,
    checkinBId ?? null,
    persona,
  );

  const onFrameLayout = (h: number) => setPhotoH((prev) => (prev === h ? prev : h));

  // A frame is the plate first and the photograph second, so the pair holds its
  // shape from the first frame — only the content inside fades in.
  const renderFrame = (uri: string, label: string) => (
    <View style={styles.photoCol}>
      <View
        style={styles.photoFrame}
        onLayout={(e) => onFrameLayout(Math.round(e.nativeEvent.layout.height))}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
        ) : photoH > 0 ? (
          <Skeleton height={photoH} radius={PHOTO_RADIUS} />
        ) : null}
      </View>
      <Text style={styles.photoDate} numberOfLines={1}>{label}</Text>
    </View>
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Skeleton-shaped stand-in for the score row, so the waiting screen is the
  // same object as the loaded one.
  const renderScoreSkeleton = () => (
    <StatRow>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.deltaSkel}>
          <Skeleton height={38} radius={10} />
          <Skeleton height={8} width="70%" radius={4} />
        </View>
      ))}
    </StatRow>
  );

  if (!checkinA || !checkinB) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={40}>
        {/* The stack runs headerShown:false, so the crown's own control is the
            only way out — an unresolved id must not strand the screen. */}
        <Crown
          eyebrow="Physique compare"
          title="BEFORE"
          accentLine="& AFTER"
          accent={crownPa.accent}
          onBack={() => router.back()}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <View style={styles.photosRow}>
            <View style={styles.photoCol}>
              <View
                style={styles.photoFrame}
                onLayout={(e) => onFrameLayout(Math.round(e.nativeEvent.layout.height))}
              >
                {photoH > 0 ? <Skeleton height={photoH} radius={PHOTO_RADIUS} /> : null}
              </View>
            </View>
            <View style={styles.photoCol}>
              <View style={styles.photoFrame}>
                {photoH > 0 ? <Skeleton height={photoH} radius={PHOTO_RADIUS} /> : null}
              </View>
            </View>
          </View>

          <Section label="Change">{renderScoreSkeleton()}</Section>
        </SafeAreaView>
      </CanvasScreen>
    );
  }

  const deltaOf = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);

  // The old chip's arrow colour rule, unchanged — only the glyph it paints is
  // now the signed numeral itself.
  const deltaColor = (delta: number | null) =>
    delta == null ? tokens.textTertiary
    : delta > 0 ? tokens.success
    : delta < 0 ? tokens.warning
    : tokens.textTertiary;

  const renderDelta = (label: string, scoreA: number | null, scoreB: number | null) => {
    const delta = deltaOf(scoreA, scoreB);
    return (
      <View style={styles.delta}>
        <Text style={[styles.deltaValue, { color: deltaColor(delta) }]} numberOfLines={1}>
          {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
        </Text>
        <Text style={styles.deltaLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.deltaPair} numberOfLines={1}>
          {`${scoreA ?? '—'} → ${scoreB ?? '—'}`}
        </Text>
      </View>
    );
  };

  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      <Crown
        eyebrow="Physique compare"
        title="BEFORE"
        accentLine="& AFTER"
        meta={`${formatDate(checkinA.date)} → ${formatDate(checkinB.date)}`}
        accent={crownPa.accent}
        onBack={() => router.back()}
      >
        {/* Pose switcher */}
        {availablePoses.length > 1 && (
          <View style={styles.poseSwitcher}>
            {availablePoses.map((p) => {
              const on = activePose === p;
              return (
                <PressableScale
                  key={p}
                  onPress={() => setActivePose(p)}
                  haptic="light"
                  scaleTo={0.96}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${p} pose`}
                  style={[styles.posePill, on && styles.posePillActive]}
                >
                  <Text style={[styles.posePillText, on && styles.posePillTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        )}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* Side-by-side photos — the hero */}
        <View style={styles.photosRow}>
          {renderFrame(uriA, formatDate(checkinA.date))}
          {renderFrame(uriB, formatDate(checkinB.date))}
        </View>

        {/* Score deltas */}
        <Section label="Change">
          <StatRow>
            {renderDelta(
              'FULLNESS',
              analysis?.fullness_a ?? checkinA.fullness_score,
              analysis?.fullness_b ?? checkinB.fullness_score,
            )}
            {renderDelta(
              'LEANNESS',
              analysis?.leanness_a ?? checkinA.leanness_score,
              analysis?.leanness_b ?? checkinB.leanness_score,
            )}
            {renderDelta(
              'SYMMETRY',
              analysis?.symmetry_a ?? checkinA.symmetry_score,
              analysis?.symmetry_b ?? checkinB.symmetry_score,
            )}
          </StatRow>
        </Section>

        {/* AI narrative */}
        {analysisLoading ? (
          <Section label={`✦ ${PERSONA_LABELS[persona] ?? 'COACH SAYS'}`}>
            <View style={[styles.narrativeCard, { backgroundColor: pa.accentSoft }]}>
              <SkeletonLines count={3} height={14} />
              <Text style={styles.analysingText}>Getting AI analysis…</Text>
            </View>
          </Section>
        ) : analysis ? (
          <Section label={`✦ ${PERSONA_LABELS[persona] ?? 'COACH SAYS'}`}>
            <View style={[styles.narrativeCard, { backgroundColor: pa.accentSoft }]}>
              <Text style={styles.narrativeText}>{analysis.narrative}</Text>
            </View>
          </Section>
        ) : null}
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD, paddingTop: 24 },

  // ── Pose switcher (inside the crown) ───────────────────────────────────────
  poseSwitcher: { flexDirection: 'row', gap: 8, marginTop: 18 },
  posePill: {
    borderWidth: 1,
    borderColor: t.crownLine,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  // Bone on ink rather than the persona tint: the crown already spends its
  // accent on the title line, and a second tint up here flattens both.
  posePillActive: { backgroundColor: t.crownText, borderColor: t.crownText },
  posePillText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    color: t.crownTextDim,
  },
  posePillTextActive: { color: t.crown },

  // ── Photos ─────────────────────────────────────────────────────────────────
  photosRow: { flexDirection: 'row', gap: 12 },
  photoCol: { flex: 1, gap: 9 },
  // The plate carries the shape so the pair never collapses while decrypting.
  photoFrame: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: PHOTO_RADIUS,
    overflow: 'hidden',
    backgroundColor: t.surfaceAlt,
  },
  photo: { width: '100%', height: '100%' },
  photoDate: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  // ── Deltas ─────────────────────────────────────────────────────────────────
  delta: { gap: 7 },
  deltaValue: {
    fontFamily: Fonts.displayBold,
    fontVariant: ['tabular-nums'],
    fontSize: 38,
    lineHeight: 39,
    // -0.045em at 38px.
    letterSpacing: -1.71,
  },
  deltaLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  deltaPair: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.1,
    color: t.textTertiary,
  },
  deltaSkel: { gap: 9 },

  // ── Narrative ──────────────────────────────────────────────────────────────
  narrativeCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 17,
    gap: 12,
  },
  narrativeText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 23,
    fontStyle: 'italic',
    color: t.text,
  },
  analysingText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
});
