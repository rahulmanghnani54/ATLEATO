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
  cancelRingingChain, getCallCopy,
  type CallKind,
} from '@/lib/coachCallScheduler';
import { startPersistentRing, stopPersistentRing, cancelSnoozeCall } from '@/lib/wakeupCalls';
import { cancelAllCalls, scheduleRecall } from '@/lib/notifeeCallScheduler';
import { silence } from '@/lib/voiceCues';
import { getPersona, styleText, type PersonaId } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';
import { Phone, PhoneOff, Sun, Dumbbell } from 'lucide-react-native';

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

  // RING continuously with the user's SELECTED ringtone the moment the call
  // screen opens. We cancel the OS notification first so its (fixed) channel
  // tone stops — otherwise you'd hear two rings, and the channel sound only
  // loops ~once. A real call rings until answered; the coach only speaks once
  // you pick up (that's the live coach-call screen).
  useEffect(() => {
    // Cancel the OS notification (it carries a callId — would re-trigger the
    // foreground router) and start the PERSISTENT ring: it loops the user's
    // SELECTED ringtone via expo-av with staysActiveInBackground:true, so it
    // keeps ringing while the screen is OFF. (The plain notification sound only
    // looped ~twice, and a bare expo-av sound paused the moment the screen slept.)
    cancelAllCalls().catch(() => {});
    cancelRingingChain(kind);
    startPersistentRing(personaId, kind === 'workout' ? 'WORKOUT TIME' : 'WAKE UP').catch(() => {});
    return () => {
      silence();
      stopPersistentRing().catch(() => {});   // stops the loop + clears its notification
      cancelSnoozeCall().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = () => {
    silence();
    cancelRingingChain(kind);
    // Open the live call screen IMMEDIATELY — don't await the ring teardown, or
    // answering feels laggy. Tear the ring + snooze down in the background (and
    // this screen's unmount cleanup also stops the ring). The call screen shows
    // "Connecting…" right away while the token + WebRTC come up.
    stopPersistentRing().catch(() => {});  // user engaged — kill ring/audio now
    cancelSnoozeCall().catch(() => {});    // cancel any pending snooze
    router.replace({ pathname: '/coach-call', params: { personaId, kind } } as any);
  };

  const handleDecline = () => {
    silence();
    cancelAllCalls().catch(() => {});       // clear the ringing notification
    stopPersistentRing().catch(() => {});
    // Coach doesn't take "no" — call back in 5 min (wake-up only). scheduleRecall
    // CAPS this at 2 callbacks/session (self-resetting after 30 min) so it can't
    // ring every 5 min for an hour. Same v3 ring channel + full-screen as the
    // main call so the callback rings + shows the call screen.
    scheduleRecall(kind, personaId).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={[styles.root, { backgroundColor: persona.accent }]}>
      <StatusBar barStyle="dark-content" backgroundColor={persona.accent} />
      <SafeAreaView style={styles.safe}>
        {/* Top label */}
        <View style={styles.topBlock}>
          <Text style={[styles.label, { color: persona.ink, opacity: 0.65 }]}>
            {styleText(persona, 'Incoming call')}
          </Text>
          <View style={styles.kindRow}>
            {kind === 'wakeup'
              ? <Sun size={13} color={persona.ink} style={{ opacity: 0.55 }} />
              : <Dumbbell size={13} color={persona.ink} style={{ opacity: 0.55 }} />
            }
            <Text style={[styles.kindLabel, { color: persona.ink, opacity: 0.55 }]}>
              {kind === 'wakeup' ? 'Wake-up' : 'Workout time'}
            </Text>
          </View>
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
              <PhoneOff size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: persona.ink, opacity: 0.7 }]}>
              {styleText(persona, 'Decline')}
            </Text>
          </View>
          <View style={styles.actionCol}>
            <TouchableOpacity style={styles.answerBtn} onPress={handleAnswer} activeOpacity={0.85}>
              <Phone size={30} color="#fff" fill="#fff" />
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: persona.ink, opacity: 0.7 }]}>
              {styleText(persona, 'Answer')}
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
  label:     { fontFamily: Fonts.bodyMedium, fontSize: 13, letterSpacing: 0.3, marginBottom: 6 },
  kindRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kindLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2 },

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
  coachEra:  { fontFamily: Fonts.bodyMedium, fontSize: 12, letterSpacing: 0.2, marginTop: 6, textAlign: 'center' },
  bodyLine:  { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, marginTop: 18, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 12 },

  // ── Bottom actions ──
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 12 },
  actionCol: { alignItems: 'center', gap: 10 },

  declineBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: RING_RED, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  answerBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: RING_GREEN, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  actionLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, letterSpacing: 0.2 },
});
