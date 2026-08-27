/**
 * Progressive overload — Bold Canvas.
 *
 * The recommendation IS the screen, so the next working weight becomes the
 * crown's hero numeral and everything that justifies it (history, reasoning)
 * drops into the light body. The progression maths, the params it reads and the
 * two back() handlers are untouched — this file changed shape, not behaviour.
 */

import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { CountUp, PressableScale } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

type SetLog = { w: number; r: number; rpe: number };
type Session = { date: string; sets: SetLog[]; avgRpe: number };

export default function ProgressiveOverload() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    exercise?: string;
    currentWeight?: string;
    nextWeight?: string;
    targetReps?: string;
    stopRpe?: string;
    coachId?: string;
  }>();

  const exercise      = params.exercise      ?? 'Incline DB Press';
  const currentWeight = parseFloat(params.currentWeight ?? '32.5');
  const nextWeight    = parseFloat(params.nextWeight    ?? '35');
  const targetReps    = params.targetReps    ?? '8–10';
  const stopRpe       = parseInt(params.stopRpe         ?? '9');
  const coachId       = params.coachId       ?? 'cbum';

  const delta    = +(nextWeight - currentWeight).toFixed(1);
  const deltaPct = ((delta / currentWeight) * 100).toFixed(1);

  const history: Session[] = [
    { date: 'TUE · 3 WEEKS AGO', sets: [{ w: currentWeight - 2.5, r: 10, rpe: 8 }, { w: currentWeight - 2.5, r: 9, rpe: 8 }, { w: currentWeight - 2.5, r: 8, rpe: 9 }], avgRpe: 8.3 },
    { date: 'FRI · 2 WEEKS AGO', sets: [{ w: currentWeight - 2.5, r: 10, rpe: 7 }, { w: currentWeight - 2.5, r: 10, rpe: 8 }, { w: currentWeight - 2.5, r: 9, rpe: 8 }], avgRpe: 7.7 },
    { date: 'TUE · LAST WEEK',   sets: [{ w: currentWeight, r: 10, rpe: 7 }, { w: currentWeight, r: 9, rpe: 8 }, { w: currentWeight, r: 8, rpe: 9 }], avgRpe: 8.0 },
  ];

  const reasons = [
    '3 sessions in a row hitting top of rep range',
    `Avg RPE dropped ${history[0].avgRpe} → ${history[2].avgRpe} at same load`,
    'Recovery score 82 today — green light to load',
  ];

  const { scheme } = useTheme();
  const persona = personaFromProgramId(coachId);
  const pa = personaAccent(persona, scheme);
  // The crown is dark in both schemes, so its tint always comes from the dark triplet.
  const crownTint = personaAccent(persona, 'dark').accent;
  const styles = useThemedStyles(makeStyles);

  return (
    <CanvasScreen tabBar={false} bottomSpace={36}>
      <Crown
        eyebrow={exercise}
        title="TIME TO"
        accentLine="GO UP."
        accent={crownTint}
        onBack={() => router.back()}
        right={
          <View style={styles.engineTag}>
            <View style={[styles.tagDot, { backgroundColor: crownTint }]} />
            <Text style={styles.tagText} numberOfLines={1}>OVERLOAD ENGINE</Text>
          </View>
        }
      >
        <Text style={styles.sub}>
          You hit your target reps at{' '}
          <Text style={styles.subStrong}>RPE ≤ {stopRpe - 1}</Text> on last set — engine says load it.
        </Text>

        {/* The hero: the weight the engine wants on the bar next. */}
        <View style={styles.hero}>
          <View style={styles.heroMain}>
            <Text style={styles.heroLabel}>Next working set</Text>
            <View style={styles.heroValueRow}>
              {/* A 3-digit decimal load ("102.5") is 5 glyphs at 76px, which
                  overruns what heroSide leaves at 360dp — shrink to fit rather
                  than wrap the hero numeral onto a second line. */}
              <CountUp
                value={nextWeight}
                decimals={Number.isInteger(nextWeight) ? 0 : 1}
                style={styles.heroNum}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                accessibilityLabel={`Next working set ${nextWeight} kilograms`}
              />
              <Text style={styles.heroUnit}>kg</Text>
            </View>
          </View>
          <View style={styles.heroSide}>
            <Text style={styles.heroLabel}>Vs last</Text>
            <Text style={[styles.heroDelta, { color: crownTint }]} numberOfLines={1}>+{delta} kg</Text>
            <Text style={styles.heroPct} numberOfLines={1}>↑ {deltaPct}%</Text>
          </View>
        </View>

        <View style={styles.crownRule} />

        <View style={styles.prescription}>
          <View style={styles.prescriptionCell}>
            <Text style={styles.prescriptionLabel} numberOfLines={1}>Target</Text>
            <Text style={styles.prescriptionValue} numberOfLines={1}>{targetReps} reps</Text>
          </View>
          <View style={styles.prescriptionCell}>
            <Text style={styles.prescriptionLabel} numberOfLines={1}>Stop at</Text>
            <Text style={styles.prescriptionValue} numberOfLines={1}>RPE {stopRpe}</Text>
          </View>
          <View style={styles.prescriptionCell}>
            <Text style={styles.prescriptionLabel} numberOfLines={1}>Sets</Text>
            <Text style={styles.prescriptionValue} numberOfLines={1}>4 working</Text>
          </View>
        </View>
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="Last 3 sessions">
          {history.map((h, i) => (
            <View key={i}>
              <View style={[styles.historyRow, i > 0 && styles.historyRowTop]}>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyDate} numberOfLines={1}>{h.date}</Text>
                  <View style={styles.historyRpe}>
                    <Text style={styles.historyRpeLabel}>Avg RPE</Text>
                    <Text style={styles.historyRpeValue}>{h.avgRpe}</Text>
                  </View>
                </View>
                <View style={styles.setGrid}>
                  {h.sets.map((s, j) => (
                    <View key={j} style={styles.setCell}>
                      <Text style={styles.setCellWeight} numberOfLines={1}>
                        {s.w}<Text style={styles.setCellUnit}>kg</Text>
                      </Text>
                      <Text style={styles.setCellDetail} numberOfLines={1}>{s.r}r · @{s.rpe}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {i < history.length - 1 ? <Hairline /> : null}
            </View>
          ))}
        </Section>

        <Section label={`Why +${delta} kg?`}>
          {reasons.map((r, i) => (
            <View key={i} style={styles.reasonRow}>
              <Text style={styles.reasonArrow}>→</Text>
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </Section>

        {/* The single accent spend on the light body. */}
        <PressableScale
          onPress={() => router.back()}
          haptic="heavy"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel={`Load ${nextWeight} kilograms`}
          style={[styles.ctaPrimary, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        >
          <Text style={[styles.ctaPrimaryText, { color: pa.ink }]} numberOfLines={1}>
            LOAD {nextWeight} KG
          </Text>
        </PressableScale>

        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel={`Stay at ${currentWeight} kilograms`}
          style={styles.ctaSecondary}
        >
          <Text style={styles.ctaSecondaryText} numberOfLines={1}>
            STAY AT {currentWeight}
          </Text>
        </PressableScale>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown ──────────────────────────────────────────────────────────────────
  engineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: t.crownLine,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  sub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.crownTextDim,
    marginTop: 12,
  },
  subStrong: { fontFamily: Fonts.bodySemi, color: t.crownText },

  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 26,
  },
  heroMain: { flexShrink: 1 },
  heroSide: { alignItems: 'flex-end' },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginBottom: 8,
  },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 76,
    lineHeight: 77,
    // -0.045em at 76px.
    letterSpacing: -3.42,
    color: t.crownText,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    color: t.crownTextDim,
    // Lifts the unit off the numeral's descender line so it reads as a suffix.
    paddingBottom: 12,
  },
  heroDelta: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    lineHeight: 29,
    letterSpacing: -1.22,
    fontVariant: ['tabular-nums'],
  },
  heroPct: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: t.crownTextDim,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  crownRule: { height: 1, backgroundColor: t.crownLine, marginTop: 24 },
  prescription: { flexDirection: 'row', gap: 12, marginTop: 18 },
  prescriptionCell: { flex: 1, gap: 7 },
  prescriptionLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  prescriptionValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.6,
    color: t.crownText,
  },

  // ── History ────────────────────────────────────────────────────────────────
  historyRow: { paddingBottom: 16, gap: 12 },
  // Rows sit ON a hairline rather than in a card, so every row after the first
  // has to re-open the space the rule closed.
  historyRowTop: { paddingTop: 16 },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyDate: {
    flexShrink: 1,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  historyRpe: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  historyRpeLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },
  historyRpeValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 20,
    lineHeight: 21,
    letterSpacing: -0.9,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  setGrid: { flexDirection: 'row', gap: 8 },
  setCell: {
    flex: 1,
    backgroundColor: t.surfaceAlt,
    borderRadius: 19,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 5,
  },
  setCellWeight: {
    fontFamily: Fonts.displayBold,
    fontSize: 19,
    lineHeight: 20,
    letterSpacing: -0.85,
    color: t.text,
    fontVariant: ['tabular-nums'],
  },
  setCellUnit: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: t.textTertiary,
  },
  setCellDetail: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: t.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ── Reasoning ──────────────────────────────────────────────────────────────
  reasonRow: { flexDirection: 'row', gap: 12, paddingVertical: 7 },
  reasonArrow: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: t.textTertiary,
  },
  reasonText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: t.text,
  },

  // ── CTAs ───────────────────────────────────────────────────────────────────
  ctaPrimary: {
    borderRadius: 26,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 34,
  },
  ctaPrimaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
  },
  ctaSecondary: {
    borderRadius: 26,
    backgroundColor: t.surfaceAlt,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 10,
  },
  ctaSecondaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.textSecondary,
  },
});
