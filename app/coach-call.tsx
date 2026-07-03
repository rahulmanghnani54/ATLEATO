/**
 * Live Coach Call — real-time two-way voice conversation with the AI coach via
 * ElevenLabs Conversational AI (WebRTC). Opened when the user ANSWERS an
 * incoming coach call. The coach greets them by voice and they talk back; hang
 * up ends the session.
 *
 * Auth: a short-lived conversation token is fetched from our Supabase edge
 * function (the ElevenLabs API key stays server-side).
 */
import '@/lib/domExceptionPolyfill'; // must run before @elevenlabs/livekit loads
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConversationProvider, useConversationControls, useConversationStatus } from '@elevenlabs/react-native';
import { getCoachCallToken } from '@/lib/elevenlabsCall';
import { getPersona, personaFromProgramId, type PersonaId } from '@/lib/personaTheme';
import { COACH_CALL_PERSONAS, COACH_STYLE } from '@/lib/coachCallPersonas';
import { scheduleRecall } from '@/lib/notifeeCallScheduler';
import { getCallCopy } from '@/lib/coachCallScheduler';
import { speakAs, silence } from '@/lib/voiceCues';
import { useAuthStore } from '@/stores/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fonts } from '@/constants/theme';
import { PhoneOff } from 'lucide-react-native';
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';

// Persistent wake-up: after a wake-up call ends (you hang up, say bye, or the
// coach wraps), call back in 5 min to make sure you actually got up — like a
// real person who won't take "I'm up" on faith. Capped so it can't nag forever.
const RECALL_FLAG = 'coachCall:pendingRecall';   // personaId awaiting a callback (drives the check-in greeting)

// Human-readable goal for the coach to reference on the call.
const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'lose fat',
  build_muscle: 'build muscle',
  maintain: 'stay in shape',
  athletic_performance: 'boost athletic performance',
};

// ── Ongoing "On call" notification ──────────────────────────────────────────
// A SILENT, sticky status-bar notification shown while the live call is up —
// like a real phone call's ongoing-call chip. Tapping it reopens the app (the
// call screen). Cancelled the instant the call ends. Uses its own LOW-priority
// channel so it never rings (the ring lives on the call channel).
const ONCALL_CHANNEL = 'coach-on-call';
const ONCALL_NOTIF_ID = 'coach-on-call';
async function showOnCallNotification(name: string, accent: string): Promise<void> {
  try {
    await notifee.createChannel({
      id: ONCALL_CHANNEL, name: 'Active coach call',
      importance: AndroidImportance.LOW, vibration: false,
    });
    await notifee.displayNotification({
      id: ONCALL_NOTIF_ID,
      title: 'On call · ' + name,
      body: 'Tap to return to your coach call',
      android: {
        channelId: ONCALL_CHANNEL,
        category: AndroidCategory.CALL,
        ongoing: true, onlyAlertOnce: true,
        color: accent,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch { /* ignore — notification is a nicety, never block the call */ }
}
async function hideOnCallNotification(): Promise<void> {
  try { await notifee.cancelNotification(ONCALL_NOTIF_ID); } catch { /* ignore */ }
}

// Outer screen: mounts the ElevenLabs ConversationProvider ONLY here (lazy), so
// loading the LiveKit/WebRTC JS is scoped to the call — it can never blank the
// rest of the app at launch.
export default function CoachCall() {
  return (
    <ConversationProvider>
      <CoachCallInner />
    </ConversationProvider>
  );
}

function CoachCallInner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personaId?: string; kind?: string }>();
  const profile = useAuthStore((s) => s.profile);
  // Use the CURRENT coach at ring time (not the persona baked into the scheduled
  // notification) so switching coach is reflected even on scheduled wake-up /
  // workout calls. The notification param is only a fallback (cold launch before
  // the profile has loaded).
  const personaId = ((profile?.selected_program
    ? personaFromProgramId(profile.selected_program).id
    : params.personaId) as PersonaId) ?? 'cbum';
  const persona = getPersona(personaId);
  const kind = params.kind === 'workout' ? 'workout' : 'wakeup';

  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const connectedRef = useRef(false);   // did the call actually connect?
  const endedRef = useRef(false);        // guard so finishCall runs exactly once
  const [ending, setEnding] = useState(false);  // user tapped End — waiting for real disconnect
  const [offline, setOffline] = useState(false);  // couldn't reach live AI — spoke offline line
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // endSession() is typed to return void (the SDK fires teardown internally), so
  // we can't .catch() it — just guard a synchronous throw / stray promise.
  const safeEnd = () => {
    try {
      const r: any = endSession();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* ignore */ }
  };

  // End the call like a real phone call: tear down, optionally schedule a
  // callback, and return to the home screen. Safe to call from the End Call
  // button OR when the coach hangs up (onDisconnect) — it only runs once.
  const finishCall = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (endTimerRef.current) { clearTimeout(endTimerRef.current); endTimerRef.current = null; }
    hideOnCallNotification();
    silence();        // stop any offline TTS line still speaking
    safeEnd();
    // Call back if this wake-up actually connected. scheduleRecall CAPS it at 2
    // callbacks/session (self-resetting after 30 min) — the same cap as the
    // decline path — so it can never ring every 5 min for an hour.
    if (connectedRef.current) {
      scheduleRecall(kind, personaId).catch(() => {});
    }
    // The call is often launched fresh (from a notification / replace), so there
    // may be nothing to go back to — router.back() then lands on a blank white
    // screen. Fall back to the home tabs in that case.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Log every status change so we can see exactly where a connection stalls.
  useEffect(() => { console.log('[call] status=' + String(status)); }, [status]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        // LiveKit must publish the mic — request RECORD_AUDIO at runtime first,
        // or the connection hangs forever ("keeps loading").
        if (Platform.OS === 'android') {
          const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          console.log('[call] mic=' + res);
          if (res !== PermissionsAndroid.RESULTS.GRANTED) {
            setError('Microphone permission is needed for the call.');
            return;
          }
        }
        console.log('[call] fetching token…');
        const conversationToken = await getCoachCallToken();
        console.log('[call] token ' + (conversationToken ? 'OK len=' + conversationToken.length : 'EMPTY'));
        // Is this a callback (the user bailed on a prior wake-up call)? If so the
        // coach greets as a "check-in" so it can tell whether they fell back
        // asleep. A fresh wake-up call resets the callback chain.
        let isRecall = false;
        try {
          const flag = await AsyncStorage.getItem(RECALL_FLAG);
          if (flag) await AsyncStorage.removeItem(RECALL_FLAG);
          // Flag is "personaId:timestamp" — only honor a recent callback (≤30 min).
          const [flagPersona, flagTs] = (flag ?? '').split(':');
          const freshEnough = (Date.now() - parseInt(flagTs || '0', 10)) < 30 * 60 * 1000;
          isRecall = kind === 'wakeup' && flagPersona === personaId && freshEnough;
        } catch { /* ignore — treat as a normal call */ }
        const callPurpose =
          kind === 'workout' ? 'workout session'
          : isRecall ? 'wake-up check-in'
          : 'morning wake-up';
        // Personalize the coach: who they're calling, the goal, and why. The
        // ElevenLabs agent prompt/first-message reference these via {{vars}}.
        const dynamicVariables = {
          // Profile stores the name in `full_name`; greet with just the first name.
          user_name: profile?.full_name?.trim().split(/\s+/)[0] || 'athlete',
          goal: GOAL_LABEL[(profile?.goal as string) ?? ''] || 'crush your goals',
          coach_name: persona.fullName,
          coach_style: COACH_STYLE[personaId] ?? COACH_STYLE.cbum,
          call_purpose: callPurpose,
        };
        console.log('[call] vars ' + JSON.stringify(dynamicVariables));
        // Personality comes from the agent's prompt using {{coach_style}} +
        // dynamicVariables — NO prompt override (the agent doesn't allow prompt
        // overrides, which would make ElevenLabs drop the session right after
        // connect). Only send a VOICE override if a per-coach voiceId is set AND
        // voice override is enabled on the agent.
        const pc = COACH_CALL_PERSONAS[personaId] ?? COACH_CALL_PERSONAS.cbum;
        const cfg: any = {
          conversationToken,
          dynamicVariables,
          onConnect: () => {
            connectedRef.current = true; console.log('[call] onConnect');
            showOnCallNotification(persona.fullName, persona.accent);  // status-bar "on call" chip
          },
          onDisconnect: (d: any) => {
            console.log('[call] onDisconnect ' + JSON.stringify(d ?? {}));
            // The coach hung up (or the call dropped after connecting) — behave
            // like a real call: show "ended" for a beat, then return home (and
            // schedule the callback). If we never connected, leave the error on
            // screen so the user can read it and tap End Call themselves.
            if (connectedRef.current && !endedRef.current) {
              setTimeout(() => finishCall(), 1200);
            }
          },
          onError: (m: unknown) => { console.log('[call] onError ' + String(m)); setError(String(m)); },
        };
        if (pc.voiceId) cfg.overrides = { tts: { voiceId: pc.voiceId } };
        await startSession(cfg);
        console.log('[call] startSession resolved');
      } catch (e: any) {
        console.log('[call] catch ' + (e?.message ?? e));
        // Couldn't reach the live AI (almost always: no internet). Don't fail
        // silently — the coach still WAKES you: speak a motivational line via the
        // phone's OWN offline voice (device TTS), and show it on screen + End call.
        const copy = getCallCopy(persona, kind);
        const first = profile?.full_name?.trim().split(/\s+/)[0] || '';
        // Stop any in-flight audio from the failed connect before the offline
        // voice speaks — prevents overlapping/garbled TTS.
        try { silence(); speakAs(personaId, (first ? first + '. ' : '') + copy.body); } catch { /* ignore */ }
        setOffline(true);
        setError('Couldn’t reach your live coach right now — here’s your wake-up:\n\n“' + copy.body + '”');
      }
    })();
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      hideOnCallNotification();
      safeEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End Call button. The bug: navigating home the instant you tapped End left the
  // ElevenLabs/LiveKit audio playing ("still talking after I cut it"). Fix: start
  // the teardown, show "Ending…", and leave ONLY once the session actually reports
  // disconnected (audio stopped) — or after a 3s safety net so it can never hang.
  const hangUp = () => {
    if (endedRef.current || ending) return;
    setEnding(true);
    safeEnd();                                     // begin teardown — stops the audio
    endTimerRef.current = setTimeout(() => finishCall(), 3000);
  };

  // Once a user-initiated End actually disconnects, finish immediately instead of
  // waiting out the 3s — this is what makes "cut = instant silence".
  useEffect(() => {
    if (ending && status !== 'connected' && status !== 'connecting') finishCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ending, status]);

  const statusLine =
    ending ? 'Ending…'
    : error ? error
    : status === 'connected' ? 'On call — just talk'
    : status === 'connecting' ? 'Connecting…'
    : 'Calling…';

  return (
    <View style={[styles.root, { backgroundColor: persona.accent }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={[styles.avatar, { borderColor: persona.ink }]}>
            <Text style={[styles.initials, { color: persona.ink }]}>{persona.initials}</Text>
          </View>
          <Text style={[styles.name, { color: persona.ink }]}>{persona.fullName}</Text>
          <Text style={[styles.status, { color: persona.ink, opacity: error ? 0.95 : 0.7 }]}>
            {statusLine}
          </Text>
          {status !== 'connected' && !error && (
            <ActivityIndicator color={persona.ink} style={{ marginTop: 18 }} />
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.hangBtn, ending && { opacity: 0.5 }]}
            onPress={offline ? finishCall : hangUp}
            disabled={ending}
            activeOpacity={0.85}
          >
            <PhoneOff size={30} color="#fff" />
          </TouchableOpacity>
          <Text style={[styles.hangLabel, { color: persona.ink, opacity: 0.7 }]}>
            {ending ? 'Ending…' : offline ? 'Done' : 'End call'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', padding: 32, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  initials: { fontFamily: Fonts.display, fontSize: 60, letterSpacing: -2 },
  name: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: -0.8, textAlign: 'center' },
  status: { fontFamily: Fonts.bodyMedium, fontSize: 15, marginTop: 12, textAlign: 'center', paddingHorizontal: 16 },
  actions: { alignItems: 'center', gap: 10, paddingBottom: 16 },
  hangBtn: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#e53935',
    alignItems: 'center', justifyContent: 'center', elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  hangLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, letterSpacing: 0.2 },
});
