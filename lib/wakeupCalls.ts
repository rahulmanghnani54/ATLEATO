/**
 * Wakeup Calls — REAL incoming-call experience via react-native-callkeep
 *
 * Notifications buzz once and die — people sleep through them. This module
 * instead triggers a system-level incoming call via Android's ConnectionService
 * (or iOS CallKit), which:
 *
 *   - Rings the user's actual phone ringtone at full volume
 *   - Vibrates continuously per the system pattern
 *   - Shows full-screen native incoming call UI (even on lock screen)
 *   - Bypasses Do Not Disturb (with the right channel flags)
 *   - Rings 30-60s until answered or declined
 *
 * Flow:
 *
 *   1. Setup once on app boot:
 *        await setupCallKeep()
 *
 *   2. Schedule a wake-up:
 *        await scheduleWakeupCall({ hour: 5, minute: 0, persona: 'cbum' })
 *      Internally we schedule an exact alarm via Notifee that fires at the
 *      chosen time. The alarm's background handler then triggers the
 *      incoming-call screen via CallKeep.
 *
 *   3. When the call fires:
 *        - System "incoming call" UI takes over the phone
 *        - User answers   → opens /incoming-call screen, plays coach TTS
 *        - User declines  → CallKeep.endCall, log "missed wake-up" event
 */
// The incoming-call experience is delivered entirely by Notifee + a full-screen
// intent + an expo-av looping ringtone (see startPersistentRing). We removed
// react-native-callkeep: it never ran on the New Architecture build, and its
// telephony permissions (CALL_PHONE / READ_PHONE_STATE / MANAGE_OWN_CALLS /
// telecom binding) are a Google Play rejection risk for a non-dialer app.
import notifee, {
  TriggerType, AndroidImportance, AndroidVisibility, AndroidCategory,
  type TimestampTrigger,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { getPersona, type PersonaId } from './personaTheme';
import { getActiveRingtoneSource } from './ringtonePreference';

const RING_CHANNEL = 'atleato-wakeup-call';
const WAKEUP_NOTIFEE_ID_PREFIX = 'atleato-wakeup:';

// ─── Trigger an incoming call NOW ───────────────────────────────────────────

/**
 * Trigger the incoming-call UI immediately. Used by the Notifee alarm
 * handler when a scheduled wake-up time hits, and by the "TEST NOW" button.
 *
 * Returns the CallKit UUID so callers can later end / answer it
 * programmatically.
 */
export async function triggerIncomingCall(opts: {
  persona: PersonaId;
  reason?: string;     // "WAKE UP" / "WORKOUT TIME"
}): Promise<string> {
  const callUUID = generateUUID();
  // Ring via Notifee + a looping ringtone (expo-av) with a full-screen intent.
  // The /incoming-call screen calls stopPersistentRing() on mount.
  await startPersistentRing(opts.persona, opts.reason ?? 'WAKE UP');
  return callUUID;
}

// ─── Persistent ring loop (used when CallKeep isn't available) ─────────────
//
// Approach: a single Notifee foreground-service notification + expo-av
// looping audio.
//
//   Foreground service → keeps the JS process alive while ringing, so the
//                        audio loop doesn't get throttled when the app is
//                        backgrounded or the screen is off.
//
//   Looping ringtone   → bundled WAV (~260 KB) plays via expo-av at full
//                        volume, bypasses iOS silent mode, ducks other
//                        audio on Android.
//
//   60s auto-stop      → safety net so a forgotten ring doesn't drain the
//                        battery / annoy the user forever.

const FOREGROUND_NOTIF_ID = 'atleato-wakeup-foreground';
let ringSound: Audio.Sound | null = null;
let ringTimeoutId: ReturnType<typeof setTimeout> | null = null;
let ringActive = false;

export async function startPersistentRing(
  personaId: PersonaId,
  reason: string,
  durationSec = 60,
): Promise<void> {
  if (ringActive) await stopPersistentRing();
  // Belt-and-braces: also sweep any orphan wakeup notifications from prior
  // runs that may have slipped through cleanup (e.g. snooze that fired
  // while no app instance was running to handle it).
  await sweepWakeupNotifications();
  ringActive = true;
  await ensureChannel();

  const persona = getPersona(personaId);
  const callerName = `${persona.shortName} · ${reason}`;
  // Canonical call kind so the cold-launch router (_layout.tsx
  // getInitialNotification) and the Notifee event handlers can route this
  // ring to /incoming-call with the right persona. Must match the
  // { kind, personaId } shape every other call notification uses.
  const callKind = /workout/i.test(reason) ? 'workout' : 'wakeup';

  // 1. Configure the audio session so the ring is audible in every state.
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS:     InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: false,
    });
  } catch (e: any) {
    if (__DEV__) console.warn('[wakeup] setAudioMode failed:', e?.message);
  }

  // 2. Resolve the user's selected ringtone (bundled variant or imported
  //    file), then load + play it on loop.
  try {
    const source = await getActiveRingtoneSource();
    // Load PAUSED first. createAsync is async (the WAV takes a moment to load);
    // if the user declines/answers in that window, stopPersistentRing() runs
    // while ringSound is still null and stops nothing — then the sound would
    // finish loading and loop forever ("still ringing after cancel"). So after
    // loading we re-check ringActive: if the ring was cancelled mid-load, unload
    // the orphan and bail instead of starting it.
    const { sound } = await Audio.Sound.createAsync(
      source,
      { isLooping: true, volume: 1.0, shouldPlay: false },
    );
    if (!ringActive) {
      try { await sound.unloadAsync(); } catch { /* ignore */ }
      return;
    }
    ringSound = sound;
    await sound.playAsync();
  } catch (e: any) {
    if (__DEV__) console.warn('[wakeup] ringtone load failed:', e?.message);
  }

  // If the ring was cancelled while the audio was loading, don't post the
  // call notification or arm the 60s timer either.
  if (!ringActive) return;

  // 3. Display a high-importance CALL-category notification (NOT a
  //    foreground service — that variant lingers in the tray after the
  //    service stops, even when we cancel it explicitly). For the 60s
  //    we ring, expo-av's staysActiveInBackground keeps audio going
  //    while the app is backgrounded or the screen is off.
  try {
    await notifee.displayNotification({
      id: FOREGROUND_NOTIF_ID,
      title: callerName,
      body: 'Incoming call · tap to answer',
      // Canonical { kind, personaId } drives routing to /incoming-call.
      // `wakeupRing` is a stable marker the orphan-sweep uses so it can still
      // find/cancel this notification now that `kind` carries routing meaning
      // ('wakeup'|'workout') instead of the old 'wakeup-call' tag.
      data: { kind: callKind, personaId, wakeupRing: '1' },
      android: {
        channelId: RING_CHANNEL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category:   AndroidCategory.CALL,
        ongoing:    true,
        autoCancel: true, // dismiss the notif as soon as the user taps it
        smallIcon:  'ic_notification',
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction:      { id: 'default', launchActivity: 'default' },
      },
    });
  } catch (e: any) {
    if (__DEV__) console.warn('[wakeup] notif failed:', e?.message);
  }

  // 4. Self-terminate after the safety duration even if the user ignores it.
  ringTimeoutId = setTimeout(() => { stopPersistentRing(); }, durationSec * 1000);
}

/**
 * Called by /incoming-call's Answer/Decline buttons (and by the 60-second
 * safety timer). Tears the ring down COMPLETELY:
 *   - stops the audio loop
 *   - cancels any foreground service (legacy)
 *   - cancels the notification by exact ID
 *   - sweeps the displayed-notifications tray for ANY wakeup-tagged
 *     notification and cancels each one (covers stale rings from prior
 *     test runs, snooze fires that overlap, etc.)
 *   - repeats the sweep after a 250ms delay to catch any that were
 *     posted mid-teardown
 */
export async function stopPersistentRing(): Promise<void> {
  ringActive = false;
  if (ringTimeoutId) { clearTimeout(ringTimeoutId); ringTimeoutId = null; }

  // Cancel by exact ID first
  try { await notifee.cancelNotification(FOREGROUND_NOTIF_ID); } catch { /* ignore */ }
  try { await notifee.stopForegroundService(); } catch { /* ignore */ }

  // Sweep — find every displayed notification flagged as wakeup-call and
  // cancel it. Catches stale ones from prior runs, snooze callbacks that
  // landed mid-teardown, etc.
  await sweepWakeupNotifications();

  // Stop + unload audio
  if (ringSound) {
    try { await ringSound.stopAsync(); } catch { /* ignore */ }
    try { await ringSound.unloadAsync(); } catch { /* ignore */ }
    ringSound = null;
  }

  // Belt-and-braces: re-sweep after a tick in case Notifee was posting a
  // new notification while we were cancelling the old one.
  setTimeout(() => { sweepWakeupNotifications().catch(() => {}); }, 250);
}

async function sweepWakeupNotifications(): Promise<void> {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    const toCancel: string[] = [];
    for (const n of displayed) {
      const data = (n.notification as any)?.data ?? {};
      const id   = n.notification.id;
      // Catch both the active ring (wakeupRing marker) and legacy
      // scheduled/snooze triggers still tagged kind:'wakeup-call'.
      if ((data.wakeupRing === '1' || data.kind === 'wakeup-call') && id) toCancel.push(id);
    }
    for (const id of toCancel) {
      try { await notifee.cancelNotification(id); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Foreground service runner — Notifee calls this when our service-style
 * notification is displayed. Must return a Promise that resolves only when
 * the user stops ringing (we resolve it from inside stopPersistentRing via
 * a flag check).
 *
 * Register ONCE at app startup with:
 *   notifee.registerForegroundService(ringForegroundServiceRunner)
 */
export function ringForegroundServiceRunner(): Promise<void> {
  return new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      if (!ringActive) { clearInterval(tick); resolve(); }
    }, 500);
  });
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

export interface WakeupSchedule {
  id?:      string;    // Notifee notification id
  hour:     number;    // 0-23
  minute:   number;    // 0-59
  persona:  PersonaId;
  daysOfWeek?: number[];  // 0=Sun..6=Sat, undefined = every day
}

/**
 * Schedule a wake-up call at the given local time. Internally we use a
 * Notifee TimestampTrigger so the alarm fires even if the app is killed.
 * The trigger's onForegroundEvent / onBackgroundEvent should call
 * `triggerIncomingCall` to escalate the alarm into a real ring.
 */
export async function scheduleWakeupCall(s: WakeupSchedule): Promise<string> {
  await ensureChannel();
  const next = nextOccurrence(s.hour, s.minute, s.daysOfWeek);
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: next.getTime(),
    alarmManager: { allowWhileIdle: true },
  };
  const id = await notifee.createTriggerNotification(
    {
      title: 'Wake up — coach calling',
      body: `Your ${getPersona(s.persona).shortName} call is incoming.`,
      data: { kind: 'wakeup-call', persona: s.persona },
      android: {
        channelId: RING_CHANNEL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: AndroidCategory.CALL,
        // fullScreenAction takes over the lock screen, then our background
        // handler upgrades it into a real ring via CallKeep.
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction:      { id: 'default', launchActivity: 'default' },
      },
    },
    trigger,
  );
  return id;
}

export async function cancelWakeupCall(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
}

// ─── Snooze: re-call N minutes after a decline ──────────────────────────────

const SNOOZE_NOTIF_ID = 'atleato-wakeup-snooze';

/**
 * Schedule a wake-up follow-up call to fire in `minutes` minutes. Called from
 * /incoming-call's handleDecline so the coach doesn't take "no" for an
 * answer — same psychology as a snooze alarm but feels like the coach
 * calling back.
 *
 * If a snooze is already queued, it's replaced (no stacking).
 */
export async function scheduleSnoozeCall(opts: {
  persona: PersonaId;
  minutes?: number;
}): Promise<void> {
  await ensureChannel();
  const minutes = opts.minutes ?? 5;
  // Cancel any existing snooze first — last decline wins
  try { await notifee.cancelTriggerNotification(SNOOZE_NOTIF_ID); } catch { /* ignore */ }

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + minutes * 60 * 1000,
    alarmManager: { allowWhileIdle: true },
  };

  await notifee.createTriggerNotification(
    {
      id: SNOOZE_NOTIF_ID,
      title: `${getPersona(opts.persona).shortName} calling back`,
      body: `You declined. ${minutes} minutes is up — answer this time.`,
      data: { kind: 'wakeup-call', persona: opts.persona, snooze: 'true' },
      android: {
        channelId: RING_CHANNEL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: AndroidCategory.CALL,
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction:      { id: 'default', launchActivity: 'default' },
      },
    },
    trigger,
  );
}

/** Cancel a pending snooze (e.g. user answered the second call). */
export async function cancelSnoozeCall(): Promise<void> {
  try { await notifee.cancelTriggerNotification(SNOOZE_NOTIF_ID); } catch { /* ignore */ }
}

export async function listScheduledWakeupIds(): Promise<string[]> {
  const ids = await notifee.getTriggerNotificationIds();
  return ids.filter((x) => x.startsWith(WAKEUP_NOTIFEE_ID_PREFIX));
}

// ─── Background event handler hook ──────────────────────────────────────────

/**
 * Wire this into your app's notifee background handler so that when the
 * wake-up trigger fires the system ALSO escalates into a real ring.
 *
 * Example (App.tsx or _layout.tsx, MODULE LEVEL):
 *   notifee.onBackgroundEvent(handleWakeupBackground);
 */
export async function handleWakeupBackground({
  type, detail,
}: {
  type: number;
  detail: any;
}): Promise<void> {
  // Only act on delivered triggers (not user dismissals)
  // EventType.DELIVERED is 7
  if (type !== 7) return;
  const data = detail?.notification?.data ?? {};
  if (data.kind !== 'wakeup-call') return;
  const persona = (data.persona as PersonaId) ?? 'cbum';
  const isSnooze = data.snooze === 'true';
  try {
    // triggerIncomingCall handles both CallKeep + Notifee-ring paths.
    // For snoozes we tag the reason so the coach voice can be sharper.
    await triggerIncomingCall({
      persona,
      reason: isSnooze ? 'WAKE UP · CALLING BACK' : 'WAKE UP',
    });
  } catch (e: any) {
    if (__DEV__) console.warn('[wakeup] background trigger failed:', e?.message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: RING_CHANNEL,
    name: 'Coach incoming calls',
    description: 'When your coach is calling you to wake up or train.',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 800, 300, 800, 300, 800, 300, 800],
    bypassDnd: true,
  });
}

/** Compute the next absolute Date for the given local hour:minute. */
function nextOccurrence(hour: number, minute: number, daysOfWeek?: number[]): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  // If the time has already passed today, push to tomorrow
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  // If daysOfWeek is provided, advance until we land on one
  if (daysOfWeek && daysOfWeek.length > 0) {
    while (!daysOfWeek.includes(target.getDay())) {
      target.setDate(target.getDate() + 1);
    }
  }
  return target;
}

/** RFC4122-style v4 UUID without bringing in a dep. */
function generateUUID(): string {
  // Crockford-ish — good enough for CallKit
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(1)}-8${r().slice(1)}-${r()}${r()}${r()}`;
}

// CallKeep event wiring was removed along with react-native-callkeep — the
// /incoming-call screen's own Answer/Decline buttons handle the call now.
