/**
 * Incoming Call Screen
 *
 * Full-screen "incoming call" UI that takes over when the user taps a
 * Coach Call notification. Looks like a real phone call — persona-colored
 * background, big avatar with ring-pulse animation, INCOMING CALL label,
 * coach name + tagline, big circular ANSWER (green) + DECLINE (red) buttons.
 *
 * Plays the coach's greeting via TTS the moment it opens.
 *
 * Why this exists:
 *   Stock `expo-notifications` can't render a real full-screen call UI on the
 *   Android lock screen (that needs `notifee` or `react-native-callkeep` +
 *   USE_FULL_SCREEN_INTENT permission + rebuild). The notification still rings
 *   + vibrates aggressively, but tapping it takes over with THIS screen — so
 *   the moment the user engages with the call, they get the real experience.
 */
import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  cancelRingingChain, declineCoachCall, getCallCopy,
  type CallKind,
} from '@/lib/coachCallScheduler';
import { speakAs } from '@/lib/voiceCues';
import { getPersona, styleText, type PersonaId } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export default function IncomingCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; personaId?: string }>();
  const kind     = (params.kind as CallKind) ?? 'wakeup';
  const personaId = (params.personaId as PersonaId) ?? 'cbum';
  const persona  = getPersona(personaId);
  const copy     = getCallCopy(persona, kind);

  // Ring-pulse animation on the avatar (subtle expand/contract loop)
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Speak the call greeting the moment screen opens
  useEffect(() => {
    speakAs(personaId, copy.body);
    // Stop any pending ring follow-ups — user has engaged
    cancelRingingChain(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = () => {
    cancelRingingChain(kind);
    // Coach greets you on answer
    speakAs(personaId, `Good to hear from you. Let's go.`);
    // Deep-link to the right destination for this call kind
    if (kind === 'workout') router.replace('/(tabs)/workouts' as any);
    else router.replace('/(tabs)' as any);
  };

  const handleDecline = async () => {
    await declineCoachCall({ kind, personaId });
    router.back();
  };

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={[styles.root, { backgroundColor: persona.accent }]}>
      <StatusBar barStyle="dark-content" backgroundColor={persona.accent} />
      <SafeAreaView style={styles.safe}>
        {/* Top label */}
        <View style={styles.topBlock}>
          <Text style={[styles.label, { color: persona.ink, opacity: 0.6 }]}>
            {styleText(persona, 'INCOMING CALL')}
          </Text>
          <Text style={[styles.kindLabel, { color: persona.ink, opacity: 0.5 }]}>
            {kind === 'wakeup' ? '🌅  WAKE-UP' : '💪  WORKOUT TIME'}
          </Text>
        </View>

        {/* Center: avatar with pulse rings + coach name */}
        <View style={styles.center}>
          <View style={styles.avatarWrap}>
            {/* Animated pulse rings behind the avatar */}
            <Animated.View
              style={[
                styles.pulseRing,
                { borderColor: persona.ink, transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <Animated.View
              style={[
                styles.pulseRing,
                styles.pulseRing2,
                { borderColor: persona.ink, transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <View style={[styles.avatar, { borderColor: persona.ink }]}>
              <Text style={[styles.avatarInitials, { color: persona.ink }]}>{persona.initials}</Text>
            </View>
          </View>

          <Text style={[styles.coachName, { color: persona.ink }]}>{persona.fullName}</Text>
          <Text style={[styles.coachEra, { color: persona.ink, opacity: 0.65 }]}>{persona.era}</Text>
          <Text style={[styles.bodyLine, { color: persona.ink, opacity: 0.8 }]}>"{copy.body}"</Text>
        </View>

        {/* Bottom: DECLINE (red) + ANSWER (green) call buttons */}
        <View style={styles.actions}>
          <View style={styles.actionCol}>
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} activeOpacity={0.85}>
              <Text style={styles.declineIcon}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: persona.ink, opacity: 0.7 }]}>
              {styleText(persona, 'DECLINE')}
            </Text>
          </View>
          <View style={styles.actionCol}>
            <TouchableOpacity style={styles.answerBtn} onPress={handleAnswer} activeOpacity={0.85}>
              <Text style={styles.answerIcon}>✓</Text>
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: persona.ink, opacity: 0.7 }]}>
              {styleText(persona, 'ANSWER')}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const RING_GREEN = '#00c853';
const RING_RED   = '#e53935';

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', padding: 32 },

  // ── Top label ──
  topBlock: { alignItems: 'center', marginTop: 12 },
  label:     { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2.4, marginBottom: 6 },
  kindLabel: { fontFamily: Fonts.mono, fontSize: 9,  letterSpacing: 1.4 },

  // ── Center block ──
  center: { alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    borderWidth: 2,
  },
  pulseRing2: { width: 130, height: 130 },
  avatar: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: Fonts.display, fontSize: 56, letterSpacing: -2 },
  coachName: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: -0.8, textAlign: 'center' },
  coachEra:  { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.4, marginTop: 6, textAlign: 'center' },
  bodyLine:  { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, marginTop: 18, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 12 },

  // ── Bottom actions ──
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 12 },
  actionCol: { alignItems: 'center', gap: 10 },

  declineBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: RING_RED, alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '135deg' }],   // makes the "phone hung up" angle
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  declineIcon: {
    color: '#fff', fontSize: 36, fontFamily: Fonts.bodyBold,
    transform: [{ rotate: '-135deg' }],
  },

  answerBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: RING_GREEN, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  answerIcon: { color: '#fff', fontSize: 38, fontFamily: Fonts.bodyBold },

  actionLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.6 },
});
