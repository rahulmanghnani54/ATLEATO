/**
 * PR celebration — Bold Canvas.
 *
 * The most emotional screen in the app, so the type does the celebrating: the
 * crown is a full-bleed dark block with the new estimated 1RM as a 76px numeral
 * in the coach's accent, and the burst rays + confetti now sit on that block
 * instead of washing over the whole page. The light body holds the detail —
 * what you lifted, what the coach said, and the two actions.
 *
 * Behaviour is untouched: same params and defaults, same Epley delta maths,
 * same coach lookup and quotes, the same 1200ms/300ms-delay count-up driver,
 * and the same Share payload.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Share, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Rect, Line } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { Fonts } from '@/constants/theme';
import { BigStat, CanvasScreen, Crown, Section, StatRow } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

/** Which semantic token a coach's accent resolves to. */
type Tone = 'accent' | 'warning' | 'info' | 'danger' | 'success';

/**
 * The crown is near-black in BOTH schemes, so anything painted on it resolves
 * against the dark tokens rather than the active ones. `accent` maps to the
 * crown's brighter emerald, which is the only emerald that clears that ink.
 */
function crownTone(tone: Tone) {
  return tone === 'accent' ? TOKENS.dark.crownAccent : TOKENS.dark[tone];
}

// ── Confetti dots ─────────────────────────────────────────────
// Geometry only — the palette is a token lookup resolved at render.
const CONFETTI = Array.from({ length: 25 }, (_, i) => ({
  left: `${(i * 73) % 100}%`,
  top: `${(i * 47 + 20) % 90}%`,
  size: 4 + (i % 3) * 2,
  round: i % 2 === 0,
  tone: i % 4,
  rotate: `${i * 23}deg`,
}));

// ── Radial burst rays (18 rays from the numeral) ──────────────
// Square viewBox sliced to the crown so the rays stay radial whatever height
// the block ends up at; the centre sits low, behind the hero numeral.
function Burst({ tint }: { tint: string }) {
  const CX = 200, CY = 200;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="burst" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={tint} stopOpacity="0.22" />
          <Stop offset="40%" stopColor={tint} stopOpacity="0.07" />
          <Stop offset="100%" stopColor={tint} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="400" height="400" fill="url(#burst)" />
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i * 360 / 18) * Math.PI / 180;
        return (
          <Line
            key={i}
            x1={CX + Math.cos(a) * 60} y1={CY + Math.sin(a) * 60}
            x2={CX + Math.cos(a) * 420} y2={CY + Math.sin(a) * 420}
            stroke={tint} strokeWidth="1.5" opacity="0.16"
          />
        );
      })}
    </Svg>
  );
}

export default function PRCelebration() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    exercise?: string;
    newRM?: string;
    prevRM?: string;
    weight?: string;
    reps?: string;
    rpe?: string;
    coachId?: string;
  }>();

  const exercise   = params.exercise ?? 'Incline Dumbbell Press';
  const newRM      = parseFloat(params.newRM   ?? '42.8');
  const prevRM     = parseFloat(params.prevRM  ?? '40.1');
  const weight     = parseFloat(params.weight  ?? '32.5');
  const reps       = parseInt(params.reps      ?? '8');
  const rpe        = parseInt(params.rpe       ?? '9');
  const coachId    = params.coachId ?? 'cbum';
  const delta      = +(newRM - prevRM).toFixed(1);
  const deltaPct   = prevRM > 0 ? ((delta / prevRM) * 100).toFixed(1) : '—';

  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const coachLabels: Record<string, { initials: string; tone: Tone; quote: string }> = {
    cbum:       { initials: 'TS', tone: 'accent',  quote: "That's what showing up looks like. Now eat. Sleep. Repeat Friday." },
    arnold:     { initials: 'TG', tone: 'warning', quote: "This is what the pump leads to. You are growing!" },
    nippard:    { initials: 'SC', tone: 'info',    quote: `New estimated 1RM via Epley: ${newRM} kg. The data confirms progression.` },
    ct:         { initials: 'TC', tone: 'danger',  quote: "I COMMANDED YOU TO GROW — AND YOU DID. NOW EAT." },
    ct_fletcher:{ initials: 'TC', tone: 'danger',  quote: "I COMMANDED YOU TO GROW — AND YOU DID. NOW EAT." },
    dr_mike:    { initials: 'DG', tone: 'success', quote: "Progressive overload achieved. You're above MEV and making gains." },
    dr:         { initials: 'DG', tone: 'success', quote: "Progressive overload achieved. You're above MEV and making gains." },
  };
  const coach = coachLabels[coachId] ?? coachLabels.cbum;

  // The persona colour only ever lands on ink — the crown, and the avatar chip
  // in the body — so one crown-tuned value serves both schemes.
  const tint = crownTone(coach.tone);

  const confettiPalette = [
    TOKENS.dark.crownAccent,
    TOKENS.dark.danger,
    TOKENS.dark.info,
    TOKENS.dark.crownText,
  ];

  // Animate the number counting up — use state so React re-renders each frame
  const [displayNum, setDisplayNum] = useState(prevRM.toFixed(1));
  const numAnim = useRef(new Animated.Value(prevRM)).current;
  useEffect(() => {
    const listener = numAnim.addListener(({ value }) => {
      setDisplayNum(value.toFixed(1));
    });
    Animated.timing(numAnim, {
      toValue: newRM,
      duration: 1200,
      delay: 300,
      useNativeDriver: false,
    }).start();
    return () => numAnim.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CanvasScreen tabBar={false} bottomSpace={36}>
      <Crown
        eyebrow="Personal record"
        title="NEW"
        accentLine="1RM."
        accent={tint}
        meta={`${exercise} — your estimated 1RM just jumped.`}
        right={
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            scaleTo={0.9}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <X size={18} color={tokens.crownText} />
          </PressableScale>
        }
      >
        {/* Decoration first so the hero numeral stays clean on top of it. */}
        <Burst tint={tint} />

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Est. 1RM (Epley)</Text>
          <View style={styles.heroRow}>
            <Animated.Text style={[styles.heroNum, { color: tint }]}>
              {displayNum}
            </Animated.Text>
            <Text style={styles.heroUnit}>kg</Text>
          </View>
        </View>

        <View style={styles.deltaRow}>
          <View style={styles.deltaCell}>
            <Text style={styles.heroLabel}>Prev best</Text>
            <Text style={styles.prevNum} numberOfLines={1}>{prevRM.toFixed(1)} kg</Text>
          </View>
          <View style={styles.deltaCell}>
            <Text style={styles.heroLabel}>Gain</Text>
            <Text style={styles.deltaNum} numberOfLines={1}>+{delta} kg</Text>
            <Text style={styles.deltaPct} numberOfLines={1}>↑ {deltaPct}%</Text>
          </View>
        </View>

        {CONFETTI.map((c, i) => (
          <View key={i} pointerEvents="none" style={[
            styles.confetti,
            {
              left: c.left as ViewStyle['left'],
              top: c.top as ViewStyle['top'],
              width: c.size, height: c.size,
              borderRadius: c.round ? c.size / 2 : 1,
              backgroundColor: confettiPalette[c.tone],
              transform: [{ rotate: c.rotate }],
            } as ViewStyle,
          ]} />
        ))}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        <Section label="What you did">
          <StatRow>
            <BigStat value={weight} unit="kg" label="Weight" />
            <BigStat value={reps} label="Reps" />
            <BigStat value={`@${rpe}`} label="RPE" />
          </StatRow>
        </Section>

        <Section label={`${coach.initials} says`}>
          <View style={styles.coachCard}>
            <View style={styles.coachAvatar}>
              <Text style={[styles.coachInitials, { color: tint }]}>{coach.initials}</Text>
            </View>
            <Text style={styles.coachQuote}>{coach.quote}</Text>
          </View>
        </Section>

        {/* PressableScale wraps its target in a shrink-to-fit Animated.View, so
            an equal split has to come from these cells, not from flex on the
            button itself. */}
        <View style={styles.ctaRow}>
          <View style={styles.ctaCell}>
            <PressableScale
              haptic="heavy"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Share win"
              onPress={() => Share.share({
                message: `🏆 New PR on ${exercise}: ${newRM} kg estimated 1RM (+${delta} kg). Built with Evulto.`,
              })}
              style={[styles.cta, styles.ctaPrimary]}
            >
              <Text style={styles.ctaPrimaryText}>SHARE WIN</Text>
            </PressableScale>
          </View>
          <View style={styles.ctaCell}>
            <PressableScale
              haptic="light"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => router.back()}
              style={[styles.cta, styles.ctaSecondary]}
            >
              <Text style={styles.ctaSecondaryText}>CLOSE</Text>
            </PressableScale>
          </View>
        </View>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: t.crownLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Crown hero ─────────────────────────────────────────────────────────────
  hero: { marginTop: 30 },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginBottom: 8,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 76,
    lineHeight: 77,
    // -0.045em at 76px.
    letterSpacing: -3.42,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    color: t.crownTextDim,
    paddingBottom: 12,
  },

  deltaRow: { flexDirection: 'row', gap: 14, marginTop: 24 },
  deltaCell: { flex: 1 },
  prevNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.9,
    color: t.crownTextDim,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
    textDecorationColor: t.crownTextDim,
  },
  deltaNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.9,
    // Sits on the near-black crown in both schemes, so it takes the dark token.
    color: TOKENS.dark.success,
    fontVariant: ['tabular-nums'],
  },
  deltaPct: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: TOKENS.dark.success,
    marginTop: 5,
  },

  confetti: { position: 'absolute', opacity: 0.7 },

  // ── Coach ──────────────────────────────────────────────────────────────────
  coachCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  coachAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    // The ink chip reads the same in both schemes, so the persona initials keep
    // their crown-tuned tone wherever the card lands.
    backgroundColor: t.crown,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coachInitials: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: -0.4,
  },
  coachQuote: {
    flex: 1,
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: t.text,
    paddingTop: 2,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 34 },
  ctaCell: { flex: 1 },
  cta: {
    borderRadius: 26,
    paddingVertical: 19,
    alignItems: 'center',
  },
  ctaPrimary: {
    backgroundColor: t.accent,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    borderColor: t.accentLine,
  },
  ctaPrimaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.accentInk,
  },
  ctaSecondary: { backgroundColor: t.surfaceAlt },
  ctaSecondaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.text,
  },
});
