/**
 * AnimatedLogo — the Evulto wordmark with a cinematic intro animation.
 *
 * Sequence (~1.5s):
 *   1. "A" punches in from left (scale 0→1, x -40→0) — bounce easing
 *   2. "TLEATO" reveals letter-by-letter (stagger fade + slight slide)
 *   3. ™ symbol fades in
 *   4. Orange bar grows from 0% to 100% width
 *   5. "TRAIN.FUEL.RISE." tagline fades in
 *   6. The "A" gets a subtle infinite pulse (scale 1↔1.06) — breathes
 *
 * Pure React Native Animated API — no deps, no native rebuild needed.
 */
import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Fonts, Colors } from '@/constants/theme';

const LETTERS = ['T', 'L', 'E', 'A', 'T', 'O']; // letters after the orange 'A'

export function AnimatedLogo() {
  const aScale     = useRef(new Animated.Value(0)).current;
  const aX         = useRef(new Animated.Value(-40)).current;
  const letterAnim = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const tmOpacity  = useRef(new Animated.Value(0)).current;
  const barWidth   = useRef(new Animated.Value(0)).current;
  const taglineOp  = useRef(new Animated.Value(0)).current;
  const aPulse     = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Sequence: A in → letters stagger → ™ → bar → tagline → start pulse
    Animated.sequence([
      Animated.parallel([
        Animated.spring(aScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }),
        Animated.spring(aX,     { toValue: 0, useNativeDriver: true, friction: 5, tension: 100 }),
      ]),
      Animated.stagger(60, letterAnim.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      )),
      Animated.timing(tmOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(barWidth,  { toValue: 1, duration: 420, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(taglineOp, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start(() => {
      // Idle pulse on the A — breathes
      Animated.loop(
        Animated.sequence([
          Animated.timing(aPulse, { toValue: 1.06, duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(aPulse, { toValue: 1.0,  duration: 1600, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={styles.area}>
      <View style={styles.wordmark}>
        {/* The animated orange 'A' */}
        <Animated.Text
          style={[
            styles.wordmarkA,
            { transform: [{ translateX: aX }, { scale: Animated.multiply(aScale, aPulse) }] },
          ]}
        >
          A
        </Animated.Text>

        {/* Each remaining letter staggers in */}
        {LETTERS.map((ch, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.wordmarkRest,
              {
                opacity: letterAnim[i],
                transform: [{
                  translateY: letterAnim[i].interpolate({
                    inputRange: [0, 1], outputRange: [12, 0],
                  }),
                }],
              },
            ]}
          >
            {ch}
          </Animated.Text>
        ))}

        <Animated.Text style={[styles.tmSymbol, { opacity: tmOpacity }]}>™</Animated.Text>
      </View>

      {/* Bar grows from 0 → 100% */}
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth.interpolate({
              inputRange: [0, 1], outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />

      <Animated.Text style={[styles.tagline, { opacity: taglineOp }]}>
        TRAIN.FUEL.RISE.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  area:     { marginBottom: 48, alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'baseline' },
  wordmarkA:    { fontFamily: Fonts.display, fontSize: 48, color: '#ff6b35', letterSpacing: -1 },
  wordmarkRest: { fontFamily: Fonts.display, fontSize: 48, color: Colors.text, letterSpacing: -1 },
  tmSymbol:     { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary, marginLeft: 3, marginBottom: 28 },
  bar:          { height: 4, backgroundColor: '#ff6b35', borderRadius: 2, marginTop: 4, marginBottom: 8, alignSelf: 'stretch' },
  tagline:      { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary, letterSpacing: 2.5, marginTop: 6 },
});
