import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
  ViewStyle, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Rect, Line, Circle } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';

// ── Confetti dots ─────────────────────────────────────────────
const CONFETTI = Array.from({ length: 25 }, (_, i) => ({
  left: `${(i * 73) % 100}%`,
  top: `${(i * 47 + 20) % 90}%`,
  size: 4 + (i % 3) * 2,
  round: i % 2 === 0,
  color: [Colors.primary, Colors.danger, Colors.info, '#fff'][i % 4],
  rotate: `${i * 23}deg`,
}));

// ── Radial burst rays (18 rays from center) ───────────────────
function Burst() {
  const CX = 201, CY = 330;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 402 874" pointerEvents="none">
      <Defs>
        <RadialGradient id="burst" cx="50%" cy="38%" r="50%">
          <Stop offset="0%" stopColor={Colors.primary} stopOpacity="0.4" />
          <Stop offset="40%" stopColor={Colors.primary} stopOpacity="0.1" />
          <Stop offset="100%" stopColor={Colors.primary} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="402" height="874" fill="url(#burst)" />
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i * 360 / 18) * Math.PI / 180;
        return (
          <Line
            key={i}
            x1={CX + Math.cos(a) * 80} y1={CY + Math.sin(a) * 80}
            x2={CX + Math.cos(a) * 420} y2={CY + Math.sin(a) * 420}
            stroke={Colors.primary} strokeWidth="1.5" opacity="0.18"
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

  const coachLabels: Record<string, { initials: string; hue: string; quote: string }> = {
    cbum:       { initials: 'TS', hue: Colors.primary,  quote: "That's what showing up looks like. Now eat. Sleep. Repeat Friday." },
    arnold:     { initials: 'TG', hue: '#f5b942',        quote: "This is what the pump leads to. You are growing!" },
    nippard:    { initials: 'SC', hue: Colors.info,      quote: `New estimated 1RM via Epley: ${newRM} kg. The data confirms progression.` },
    ct:         { initials: 'TC', hue: Colors.danger,    quote: "I COMMANDED YOU TO GROW — AND YOU DID. NOW EAT." },
    ct_fletcher:{ initials: 'TC', hue: Colors.danger,    quote: "I COMMANDED YOU TO GROW — AND YOU DID. NOW EAT." },
    dr_mike:    { initials: 'DG', hue: Colors.good,      quote: "Progressive overload achieved. You're above MEV and making gains." },
    dr:         { initials: 'DG', hue: Colors.good,      quote: "Progressive overload achieved. You're above MEV and making gains." },
  };
  const coach = coachLabels[coachId] ?? coachLabels.cbum;

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
    <View style={styles.root}>
      {/* Radial burst background */}
      <Burst />

      {/* Confetti */}
      {CONFETTI.map((c, i) => (
        <View key={i} style={[
          styles.confetti,
          {
            left: c.left as ViewStyle['left'],
            top: c.top as ViewStyle['top'],
            width: c.size, height: c.size,
            borderRadius: c.round ? c.size / 2 : 1,
            backgroundColor: c.color,
            transform: [{ rotate: c.rotate }],
          } as ViewStyle,
        ]} />
      ))}

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.prTag}>
              <View style={styles.prDot} />
              <Text style={styles.prTagText}>PERSONAL RECORD</Text>
            </View>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Headline */}
          <View style={styles.headlineWrap}>
            <Text style={styles.headlineLine1}>NEW</Text>
            <Text style={[styles.headlineLine2, { color: Colors.primary }]}>1RM.</Text>
            <Text style={styles.headlineSub}>
              {exercise} — your estimated 1RM just jumped.
            </Text>
          </View>

          {/* The number */}
          <View style={styles.numSection}>
            <View>
              <Text style={styles.numLabel}>EST. 1RM (EPLEY)</Text>
              <View style={styles.numRow}>
                <Animated.Text style={styles.bigNum}>
                  {displayNum}
                </Animated.Text>
                <Text style={styles.bigNumUnit}>kg</Text>
              </View>
            </View>
            <View style={styles.numRight}>
              <Text style={styles.numLabel}>PREV BEST</Text>
              <Text style={styles.prevNum}>{prevRM.toFixed(1)} kg</Text>
              <Text style={styles.numDelta}>+{delta} kg ↑ {deltaPct}%</Text>
            </View>
          </View>

          {/* What you did */}
          <Text style={styles.sectionLabel}>WHAT YOU DID</Text>
          <View style={styles.whatGrid}>
            {[
              { label: 'WEIGHT', value: `${weight}`, unit: 'kg' },
              { label: 'REPS',   value: `${reps}`,   unit: '' },
              { label: 'RPE',    value: `@${rpe}`,   unit: '' },
            ].map((item) => (
              <View key={item.label} style={styles.whatCard}>
                <Text style={styles.whatLabel}>{item.label}</Text>
                <Text style={styles.whatValue}>
                  {item.value}<Text style={styles.whatUnit}>{item.unit}</Text>
                </Text>
              </View>
            ))}
          </View>

          {/* Coach quote */}
          <View style={[styles.coachCard, { borderColor: `${coach.hue}33`, backgroundColor: `${coach.hue}0d` }]}>
            <View style={[styles.coachAvatar, { backgroundColor: coach.hue }]}>
              <Text style={styles.coachInitials}>{coach.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coachName, { color: coach.hue }]}>
                {coach.initials} SAYS
              </Text>
              <Text style={styles.coachQuote}>{coach.quote}</Text>
            </View>
          </View>

          {/* CTAs */}
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaPrimary}
              activeOpacity={0.85}
              onPress={() => Share.share({
                message: `🏆 New PR on ${exercise}: ${newRM} kg estimated 1RM (+${delta} kg). Built with Evulto.`,
              })}
            >
              <Text style={styles.ctaPrimaryText}>SHARE WIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaSecondary}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaSecondaryText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 48 },

  confetti: { position: 'absolute', opacity: 0.7 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  prTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.primary}1a`, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5,
  },
  prDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  prTagText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.primary, letterSpacing: 1.4 },
  closeBtn: { color: Colors.textSecondary, fontSize: 18, lineHeight: 22 },

  headlineWrap: { marginBottom: 36 },
  headlineLine1: { fontFamily: Fonts.display, fontSize: 96, color: Colors.text, lineHeight: 82, letterSpacing: -3 },
  headlineLine2: { fontFamily: Fonts.display, fontSize: 96, lineHeight: 82, letterSpacing: -3 },
  headlineSub: { fontFamily: Fonts.body, fontSize: 15, color: Colors.textSecondary, marginTop: 16, lineHeight: 22 },

  numSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginBottom: 24,
  },
  numLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 4 },
  numRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bigNum: { fontFamily: Fonts.display, fontSize: 84, color: Colors.primary, letterSpacing: -3, lineHeight: 80 },
  bigNumUnit: { fontFamily: Fonts.display, fontSize: 24, color: Colors.textSecondary },
  numRight: { alignItems: 'flex-end' },
  prevNum: {
    fontFamily: Fonts.display, fontSize: 24, color: Colors.textSecondary, marginTop: 6,
    textDecorationLine: 'line-through', textDecorationColor: Colors.textTertiary,
  },
  numDelta: { fontFamily: Fonts.display, fontSize: 16, color: Colors.good, marginTop: 4 },

  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 10 },

  whatGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  whatCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 12,
  },
  whatLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  whatValue: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginTop: 4 },
  whatUnit: { fontSize: 11, color: Colors.textSecondary },

  coachCard: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: 6, borderWidth: 1, marginBottom: 24,
  },
  coachAvatar: {
    width: 32, height: 32, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  coachInitials: { fontFamily: Fonts.display, fontSize: 11, color: Colors.accentInk },
  coachName: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, marginBottom: 4 },
  coachQuote: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20 },

  ctaRow: { flexDirection: 'row', gap: 8 },
  ctaPrimary: {
    flex: 1, height: 56, backgroundColor: Colors.primary, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaPrimaryText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 0.6 },
  ctaSecondary: {
    flex: 1, height: 56, borderRadius: 4, borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaSecondaryText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 0.6 },
});
