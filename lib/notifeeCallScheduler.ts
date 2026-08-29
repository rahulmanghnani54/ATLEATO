/**
 * Notifee Call Scheduler
 *
 * Uses @notifee/react-native to deliver TRUE incoming-call notifications:
 *   - Android `Style.CALL` notifications render as actual call UI
 *   - `fullScreenAction` takes over the lock screen
 *   - Persistent ringing via channel sound + long vibration
 *   - Real ANSWER / DECLINE buttons handled at the OS level
 *
 * This replaces the expo-notifications setup in `coachCallScheduler.ts` for
 * the *call* experience. (Daily-trigger scheduling will still be added in a
 * follow-up; this file ships the immediate-fire pipeline first since that's
 * what the user tests via "TEST NOW".)
 *
 * Requires:
 *   - @notifee/react-native installed (✓)
 *   - android.permission.USE_FULL_SCREEN_INTENT in app.json (✓)
 *   - android.permission.POST_NOTIFICATIONS in app.json (✓)
 *   - Dev build rebuilt with the above permissions baked in
 */
import notifee, {
  AndroidImportance, AndroidVisibility, AndroidCategory,
  AuthorizationStatus, EventType, TriggerType, RepeatFrequency,
  AndroidNotificationSetting,
  type TimestampTrigger,
} from '@notifee/react-native';
import * as Speech from 'expo-speech';
// Only used to retire orphans left by the pre-notifee scheduler (clearStaleCalls).
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking, PermissionsAndroid } from 'react-native';
import { getPersona, type PersonaId } from './personaTheme';
import {
  getCallCopy as sharedCallCopy,
  incomingCallTitle,
  DECLINE_LINES,
  DECLINE_VOICE,
  type CallKind,
} from './coachCallScheduler';

// Declared once in coachCallScheduler; re-exported so existing importers of
// either module keep working.
export type { CallKind };

// v3: the channel SOUND is cached at creation, so changing it requires a new
// channel id. v2 used the system 'default' sound = a single notification "ding".
// v3 points at the bundled `coach_call` ringtone (res/raw/coach_call.wav) and the
// notification loops it (loopSound) so a scheduled call RINGS continuously like a
// real incoming call instead of dinging once. (Also keeps bypass-DnD/public/HIGH.)
const CHANNEL_ID = 'coach-incoming-calls-v3';
// Raw resource name for the ringtone (android/app/src/main/res/raw/coach_call.wav).
const CALL_SOUND = 'coach_call';
const ID_PREFIX  = 'coach-call:';
/**
 * How long the call rings before the OS retires it as a missed call.
 *
 * The notification is `ongoing` (non-dismissable) so it survives a stray swipe
 * while the phone is actually ringing — but without a timeout that same flag
 * makes an ignored call permanent: it cannot be swiped away, and it still reads
 * as "your coach is calling" days later, even after calls have been turned off.
 * 60s is roughly what a real carrier call rings for before going to voicemail.
 */
const RING_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Voice copy per persona — single source in coachCallScheduler.
//
// This file used to keep its own WAKEUP/WORKOUT/DECLINE_LINES/DECLINE_VOICE
// tables "mirroring" that file. They had drifted: dr_mike's workout body was
// missing "deload Friday" here, and the titles used different casing, so the
// preview in settings did not match the notification that actually fired.
// ─────────────────────────────────────────────────────────────────────────────

function getCallCopy(personaId: PersonaId, kind: CallKind) {
  return sharedCallCopy(getPersona(personaId), kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission + setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request notification permission. On Android 13+ this MUST go through
 * PermissionsAndroid.request(POST_NOTIFICATIONS) to actually trigger the
 * system popup — notifee.requestPermission() alone doesn't always fire it
 * on dev builds. We also call notifee.requestPermission() so Notifee's
 * internal cache is in sync.
 *
 * If permission is denied permanently (NEVER_ASK_AGAIN), opens the app's
 * notification settings page so the user can flip it on manually.
 */
export async function ensureNotifeePermission(): Promise<AuthorizationStatus> {
  // Android 13+ requires runtime permission for POST_NOTIFICATIONS
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const result = await PermissionsAndroid.request(
        'android.permission.POST_NOTIFICATIONS' as any,
        {
          title: 'Allow Coach Calls',
          message: 'Evulto needs notification permission to ring you with wake-up + workout calls.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        // System won't show the popup anymore — guide user to settings
        try { await Linking.openSettings(); } catch { /* ignore */ }
        return AuthorizationStatus.DENIED;
      }
      if (result === PermissionsAndroid.RESULTS.DENIED) {
        return AuthorizationStatus.DENIED;
      }
    } catch {
      // PermissionsAndroid failed — fall through to Notifee's API
    }
  }

  // Also sync Notifee's internal state (iOS goes through this entirely)
  try {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
      try { await Linking.openSettings(); } catch { /* ignore */ }
    }
    return settings.authorizationStatus;
  } catch {
    return AuthorizationStatus.DENIED;
  }
}

/**
 * Create the incoming-call notification channel with alarm-grade settings.
 * Idempotent — safe to call on every app start.
 */
export async function setupCallChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Coach Incoming Calls',
    description: 'Wake-up and workout calls — rings as an incoming call',
    importance: AndroidImportance.HIGH,
    sound: CALL_SOUND,                 // bundled ringtone, not the system ding
    vibration: true,
    // Call-style vibration: long buzz / short gap, repeated — reads as "ringing".
    vibrationPattern: [400, 1000, 400, 1000, 400, 1000, 400, 1000, 400, 1000],
    bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
    lights: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fire a CALL notification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Display an incoming call notification using Notifee's `Style.CALL`.
 * On Android 12+ this renders as an actual incoming-call UI (not a banner).
 * With `fullScreenAction` set, it takes over the lock screen.
 *
 * Tap "Answer" → opens app on the incoming-call screen (handled by listener).
 * Tap "Decline" → handled by listener (coach speaks "no excuses" line).
 */
export async function fireIncomingCall(args: {
  kind: CallKind;
  personaId: PersonaId;
  isTest?: boolean;
}): Promise<void> {
  const { kind, personaId, isTest } = args;
  const persona = getPersona(personaId);
  const copy = getCallCopy(personaId, kind);

  await setupCallChannel();

  const id = `${ID_PREFIX}${kind}-${Date.now()}`;

  await notifee.displayNotification({
    id,
    title: copy.title + (isTest ? '  (TEST)' : ''),
    body: copy.body,
    data: { kind, personaId, callId: id, voice: persona.id },
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      // Tapping the notification opens the in-app /incoming-call screen
      pressAction: {
        id: 'open-call-screen',
        launchActivity: 'default',
      },
      // Full-screen takeover when device is locked — THIS is what makes it
      // ring like a real phone call (Android shows our activity full-screen).
      fullScreenAction: {
        id: 'full-screen',
        launchActivity: 'default',
      },
      // OS-level action buttons rendered with the notification
      actions: [
        {
          title: '✓  ANSWER',
          pressAction: { id: 'ANSWER', launchActivity: 'default' },
        },
        {
          title: '✕  DECLINE',
          pressAction: { id: 'DECLINE' },
        },
      ],
      sound: CALL_SOUND,
      loopSound: true,                            // ring continuously until answered/declined
      ongoing: true,                              // sticky — won't dismiss until interacted with
      autoCancel: false,
      // A real call stops ringing and becomes a missed call. Without this the
      // ONGOING flag makes an unanswered call sit in the tray FOREVER — the user
      // cannot swipe it away, and days later it still reads as "the coach is
      // calling", even after coach calls have been switched off. `timeoutAfter`
      // is handled by the OS, so it still fires if the app is killed mid-ring.
      timeoutAfter: RING_TIMEOUT_MS,
      visibility: AndroidVisibility.PUBLIC,
      timestamp: Date.now(),
      showTimestamp: true,
      color: persona.accent,                      // colored bar (no smallIcon → use app default)
    },
    ios: {
      sound: 'default',
      categoryId: 'coach-call-actions',
      critical: true,
      criticalVolume: 1.0,
    },
  });
}

/** Cancel one specific call by its notification id. */
export async function cancelCall(id: string): Promise<void> {
  try { await notifee.cancelNotification(id); } catch { /* noop */ }
}

/** Cancel every coach-call notification currently displayed or scheduled. */
export async function cancelAllCalls(): Promise<void> {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    await Promise.all(
      displayed
        .filter((n) => n.id?.startsWith(ID_PREFIX))
        .map((n) => notifee.cancelNotification(n.id!)),
    );
    const scheduled = await notifee.getTriggerNotifications();
    await Promise.all(
      scheduled
        .filter((n) => {
          const id = n.notification.id ?? '';
          // Cancel one-shot call triggers (recall/test) but NEVER the recurring
          // wake-up/workout schedule (SCHED_PREFIX). Cancelling those silently
          // killed the workout reminder: the morning wake-up's caller screen
          // ran cancelAllCalls(), which wiped that day's scheduled workout call.
          return id.startsWith(ID_PREFIX) && !id.startsWith(SCHED_PREFIX);
        })
        .map((n) => notifee.cancelTriggerNotification(n.notification.id!)),
    );
  } catch {
    // noop
  }
}

/**
 * Clear stale call notifications at app start.
 *
 * A ringing call is a transient event: if the app is only now booting, any call
 * still sitting in the tray was never answered and is stale by definition. It
 * must be cleared, because `ongoing` means the user CANNOT swipe it away.
 *
 * This also retires the pre-notifee scheduler's orphans. `coachCallScheduler`
 * used to schedule through expo-notifications under the id `coach-call:<kind>`,
 * with no `sched-` segment. Nothing schedules those any more, but ones already
 * on a device outlive the upgrade, and none of the current cancel paths match
 * them: toggling calls off cancels `coach-call:sched-*`. So an ignored wake-up
 * call from an old build stays in the tray permanently, in whichever coach's
 * voice was active when it was scheduled — reading as a live call from a coach
 * the user no longer has, months after they switched calls off.
 */
export async function clearStaleCalls(): Promise<void> {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    await Promise.all(
      displayed
        .filter((n) => n.id?.startsWith(ID_PREFIX))
        .map((n) => notifee.cancelNotification(n.id!)),
    );
  } catch {
    // Never let tray cleanup block startup.
  }
  // The legacy ids were created by expo-notifications, so they live in ITS
  // scheduled set — notifee.getTriggerNotifications() does not list them.
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => {
          const id = n.identifier ?? '';
          return id.startsWith(ID_PREFIX) && !id.startsWith(SCHED_PREFIX);
        })
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}),
        ),
    );
  } catch {
    // noop
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED calls (daily) — the real fix for "scheduled wake-up never fires"
// ─────────────────────────────────────────────────────────────────────────────
//
// The old path scheduled via expo-notifications, which on Android 12+ silently
// fails to fire without the exact-alarm permission. We schedule through Notifee
// with an AlarmManager-backed TimestampTrigger (allowWhileIdle) + DAILY repeat +
// the SAME full-screen call config as fireIncomingCall — so the scheduled call
// fires reliably AND rings as an actual incoming call (not just a banner).

const SCHED_PREFIX = `${ID_PREFIX}sched-`;

/**
 * On Android 12+ exact alarms need the "Alarms & reminders" special permission.
 * Returns true if already granted; otherwise opens the system settings page so
 * the user can enable it (scheduled calls won't fire reliably until they do).
 */
export async function ensureExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.android.alarm === AndroidNotificationSetting.ENABLED) return true;

    // Send the user somewhere they can ACTUALLY grant it. Verified on Android 17:
    // notifee.openAlarmPermissionSettings() lands on the generic App info page,
    // which has no "Alarms & reminders" row at all — the user is stranded and the
    // scheduled call never fires. This action opens the Alarms & reminders
    // special-access list with our app in it instead.
    // (The variant that opens our app's toggle directly needs a `package:` data
    // URI, and RN's Linking.sendIntent can only send extras — so we use the list.)
    try {
      await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
    } catch {
      // OEM without that action: fall back to notifee, then to app settings.
      try { await notifee.openAlarmPermissionSettings(); }
      catch { try { await Linking.openSettings(); } catch { /* ignore */ } }
    }
    return false;
  } catch {
    return true; // older Android / API unavailable — exact alarms allowed
  }
}

/**
 * Samsung (and other OEMs) kill background alarms unless the app is exempt from
 * battery optimization — that's why scheduled wake-up/workout calls don't fire
 * even when the alarm is registered. If optimization is on, open the system
 * dialog so the user can allow it. Best-effort; never throws.
 */
export async function ensureBackgroundCallDelivery(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const optimized = await notifee.isBatteryOptimizationEnabled();
    if (optimized) {
      await notifee.openBatteryOptimizationSettings();
    }
  } catch { /* ignore */ }

  // Android 14+ (API 34): full-screen intents need the "Full screen
  // notifications" special access. Without it a perfectly-fired call silently
  // degrades to a small banner — no ring screen. JS can't QUERY the grant
  // state (needs a native module), so nudge ONCE to the exact settings page.
  try {
    if (Number(Platform.Version) < 34) return;
    const FSI_FLAG = 'evulto_fsi_nudged_v1';
    if (await AsyncStorage.getItem(FSI_FLAG)) return;
    await AsyncStorage.setItem(FSI_FLAG, '1');
    // Opens Settings → Full screen notifications (app list). Falls back to the
    // app's settings page if the OEM doesn't expose the action.
    try {
      await Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT');
    } catch {
      try { await Linking.openSettings(); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** Next Date that lands on weekday `dow` (0=Sun..6=Sat) at hour:minute. */
function nextWeekdayOccurrence(dow: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  let add = (dow - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= Date.now()) add = 7; // today's slot passed → next week
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * Schedule a full-screen coach call at hour:minute (local).
 *
 * `days` = the calendar weekdays (0=Sun..6=Sat) on which the coach may ring.
 * Pass the user's TRAINING days here so the coach NEVER disturbs them on a rest
 * day — rest days simply get no alarm registered. We do this by registering one
 * WEEKLY-repeat trigger per training weekday (instead of a single DAILY repeat),
 * so the OS fires each on its own day even when the app is killed. Omit `days`
 * (or pass all 7) to ring every day.
 */
export async function scheduleIncomingCall(args: {
  kind: CallKind; personaId: PersonaId; hour: number; minute: number;
  days?: number[];
}): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { kind, personaId, hour, minute, days } = args;
  const persona = getPersona(personaId);
  const copy = getCallCopy(personaId, kind);

  await setupCallChannel();
  // Replace any existing schedule for this kind (daily OR per-weekday triggers).
  await cancelScheduledCall(kind);

  // Same notification payload for every trigger — only the id varies.
  const notif = (id: string) => ({
    id,
    title: copy.title,
    body: copy.body,
    data: { kind, personaId, callId: id, voice: persona.id },
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      pressAction:      { id: 'open-call-screen', launchActivity: 'default' },
      fullScreenAction: { id: 'full-screen',      launchActivity: 'default' },
      actions: [
        { title: '✓  ANSWER',  pressAction: { id: 'ANSWER', launchActivity: 'default' } },
        { title: '✕  DECLINE', pressAction: { id: 'DECLINE' } },
      ],
      sound: CALL_SOUND,
      loopSound: true,                            // ring continuously like a real call
      ongoing: true,
      autoCancel: false,
      visibility: AndroidVisibility.PUBLIC,
      color: persona.accent,
    },
    ios: { sound: 'default', categoryId: 'coach-call-actions', critical: true, criticalVolume: 1.0 },
  });

  const uniqueDays = days ? [...new Set(days)].filter((d) => d >= 0 && d <= 6) : [];

  // Specific training days → one WEEKLY trigger each; rest days get nothing.
  if (uniqueDays.length > 0 && uniqueDays.length < 7) {
    for (const dow of uniqueDays) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: nextWeekdayOccurrence(dow, hour, minute).getTime(),
        repeatFrequency: RepeatFrequency.WEEKLY,
        alarmManager: { allowWhileIdle: true }, // exact, fires in Doze
      };
      await notifee.createTriggerNotification(notif(`${SCHED_PREFIX}${kind}-${dow}`), trigger);
    }
    return;
  }

  // Every day (no rest-day restriction, or trains 7 days/week).
  const fire = new Date();
  fire.setHours(hour, minute, 0, 0);
  if (fire.getTime() <= Date.now()) fire.setDate(fire.getDate() + 1);
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: fire.getTime(),
    repeatFrequency: RepeatFrequency.DAILY,
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(notif(`${SCHED_PREFIX}${kind}`), trigger);
}

/** Cancel every scheduled call for one kind (the daily id AND per-weekday ids),
 * PLUS any pending one-shot callback + the recall counter. Without the last two,
 * toggling a reminder OFF still let a queued callback ring afterwards. */
export async function cancelScheduledCall(kind: CallKind): Promise<void> {
  try {
    const prefix = `${SCHED_PREFIX}${kind}`;
    const scheduled = await notifee.getTriggerNotifications();
    await Promise.all(
      scheduled
        .filter((n) => n.notification.id?.startsWith(prefix))
        .map((n) => notifee.cancelTriggerNotification(n.notification.id!)),
    );
    // Kill any pending "call you back" one-shot for this kind…
    try { await notifee.cancelTriggerNotification(`${ID_PREFIX}recall-${kind}`); } catch { /* none */ }
    // …and clear the recall counter/flag so the chain truly stops.
    try { await AsyncStorage.multiRemove([RECALL_COUNT_KEY, RECALL_TS_KEY, RECALL_FLAG_KEY]); } catch { /* ignore */ }
  } catch { /* noop */ }
}

// ── Capped wake-up callback ("call me back") ────────────────────────────────
const RECALL_FLAG_KEY  = 'coachCall:pendingRecall';
const RECALL_COUNT_KEY = 'coachCall:recallCount';
const RECALL_TS_KEY    = 'coachCall:recallTs';
const MAX_RECALLS      = 2;   // at most 2 callbacks per wake-up session
const RECALL_GAP_MIN   = 5;   // minutes between callbacks

/**
 * Schedule a wake-up CALLBACK, but CAPPED. Both the live-call screen (on hang-up)
 * and the incoming-call screen (on decline) route through here, so the cap holds
 * however the call ended. Self-resets after a 30-min gap (each morning is fresh).
 * Returns true if a callback was scheduled, false if capped/skipped.
 *
 * Fixes the "rings every 5 min for an hour" bug: decline used to schedule an
 * UNCAPPED chain (scheduleCallIn with no counter).
 */
export async function scheduleRecall(kind: CallKind, personaId: PersonaId): Promise<boolean> {
  if (kind !== 'wakeup') return false;   // only wake-ups call back; workouts don't nag
  try {
    const now = Date.now();
    const lastTs = parseInt((await AsyncStorage.getItem(RECALL_TS_KEY)) || '0', 10) || 0;
    let count = parseInt((await AsyncStorage.getItem(RECALL_COUNT_KEY)) || '0', 10) || 0;
    if (now - lastTs > 30 * 60 * 1000) count = 0;  // new session → reset the counter
    if (count >= MAX_RECALLS) return false;         // capped — stop calling back
    await AsyncStorage.multiSet([
      [RECALL_COUNT_KEY, String(count + 1)],
      [RECALL_TS_KEY, String(now)],
      [RECALL_FLAG_KEY, personaId + ':' + now],     // greet the callback as a check-in
    ]);
    await scheduleCallIn(RECALL_GAP_MIN, kind, personaId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedule a ONE-SHOT "calling back" in `minutes` minutes — used for the decline
 * snooze and the after-call check-in. Uses the SAME v3 ring channel + full-screen
 * config as the main scheduled call, so the callback rings + shows the call
 * screen identically (not a quiet ding on a different/old channel).
 */
export async function scheduleCallIn(minutes: number, kind: CallKind, personaId: PersonaId): Promise<void> {
  if (Platform.OS !== 'android') return;
  const persona = getPersona(personaId);
  const copy = getCallCopy(personaId, kind);
  await setupCallChannel();
  const id = `${ID_PREFIX}recall-${kind}`;
  try { await notifee.cancelTriggerNotification(id); } catch { /* none */ }
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + minutes * 60 * 1000,
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(
    {
      id,
      title: incomingCallTitle(getPersona(personaId), 'CALLING BACK'),
      body: copy.body,
      data: { kind, personaId, callId: id, voice: persona.id },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        pressAction:      { id: 'open-call-screen', launchActivity: 'default' },
        fullScreenAction: { id: 'full-screen',      launchActivity: 'default' },
        actions: [
          { title: '✓  ANSWER',  pressAction: { id: 'ANSWER', launchActivity: 'default' } },
          { title: '✕  DECLINE', pressAction: { id: 'DECLINE' } },
        ],
        sound: CALL_SOUND,
        loopSound: true,
        ongoing: true,
        autoCancel: false,
        visibility: AndroidVisibility.PUBLIC,
        color: persona.accent,
      },
      ios: { sound: 'default', categoryId: 'coach-call-actions', critical: true, criticalVolume: 1.0 },
    },
    trigger,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DECLINE handler — coach speaks, fires angry follow-up
// ─────────────────────────────────────────────────────────────────────────────

export async function handleDecline(args: { kind: CallKind; personaId: PersonaId }): Promise<void> {
  const { kind, personaId } = args;
  const persona = getPersona(personaId);
  const line  = DECLINE_LINES[personaId] ?? DECLINE_LINES.cbum;
  const voice = DECLINE_VOICE[personaId] ?? DECLINE_VOICE.cbum;

  // Cancel the current ringing call
  await cancelAllCalls();

  // Speak the "no excuses" line via TTS — stop any in-flight speech first so
  // it never overlaps a greeting/ring teardown into garbled double audio.
  try {
    Speech.stop();
    Speech.speak(line, { language: 'en-US', pitch: voice.pitch, rate: voice.rate, volume: 1.0 });
  } catch { /* TTS unavailable */ }

  // Fire an angry follow-up call in 60 seconds
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + 60_000,
  };
  await notifee.createTriggerNotification(
    {
      id: `${ID_PREFIX}NOEXCUSES-${kind}-${Date.now()}`,
      title: `📞  ${persona.shortName.toUpperCase()}  ·  CALLING BACK`,
      body: line,
      data: { kind, personaId, noexcuses: '1', callId: `${ID_PREFIX}NOEXCUSES-${kind}` },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        sound: CALL_SOUND,
        loopSound: true,
        pressAction:     { id: 'open-call-screen', launchActivity: 'default' },
        fullScreenAction:{ id: 'full-screen',      launchActivity: 'default' },
        actions: [
          { title: '✓  ANSWER',  pressAction: { id: 'ANSWER', launchActivity: 'default' } },
          { title: '✕  DECLINE', pressAction: { id: 'DECLINE' } },
        ],
        ongoing: true,
        autoCancel: false,
        visibility: AndroidVisibility.PUBLIC,
        color: persona.accent,
      },
    },
    trigger,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT: notifee.onBackgroundEvent MUST be registered at module-load time
// (top-level), not inside React. Notifee's docs are explicit: it has to run
// once, OUTSIDE the component tree. We register it here unconditionally,
// wrapped in try/catch so a Notifee failure can't break app startup.
//
// onForegroundEvent CAN be subscribed/unsubscribed per component, so that
// stays in `registerCallEventHandler` below.

// JS-thread callback the background handler invokes when the user pressed
// DECLINE on a notification while the app was killed/backgrounded.
async function handleBackgroundEvent(type: EventType, detail: any): Promise<void> {
  const data = detail?.notification?.data as { kind?: CallKind; personaId?: PersonaId; callId?: string } | undefined;
  if (!data?.kind || !data?.personaId) return;
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'DECLINE') {
    await handleDecline({ kind: data.kind, personaId: data.personaId });
  } else if (data.callId) {
    await cancelCall(data.callId);
  }
}

// Register at MODULE LOAD time. Wrapped so any failure is non-fatal.
try {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    try {
      await handleBackgroundEvent(type, detail);
    } catch {
      // background event failures must never throw — would crash the JS thread
    }
  });
} catch {
  // Notifee native module isn't available (e.g. running in Expo Go) — degrade gracefully
}

let foregroundUnsub: (() => void) | null = null;
type NavigateFn = (kind: CallKind, personaId: PersonaId) => void;

/**
 * Subscribe the foreground action handler. ANSWER / body-tap → `onAnswer`;
 * DECLINE → speaks + reschedules. Returns an unsubscribe.
 * Wrapped in try/catch so a Notifee failure doesn't block app startup.
 */
export function registerCallEventHandler(onAnswer: NavigateFn): () => void {
  // Avoid double-subscribing if called twice
  if (foregroundUnsub) return foregroundUnsub;

  try {
    foregroundUnsub = notifee.onForegroundEvent(async ({ type, detail }) => {
      try {
        const data = detail.notification?.data as { kind?: CallKind; personaId?: PersonaId; callId?: string } | undefined;
        if (!data?.kind || !data?.personaId) return;

        if (type === EventType.ACTION_PRESS) {
          if (detail.pressAction?.id === 'DECLINE') {
            await handleDecline({ kind: data.kind, personaId: data.personaId });
            return;
          }
          if (data.callId) await cancelCall(data.callId);
          onAnswer(data.kind, data.personaId);
        } else if (type === EventType.PRESS) {
          if (data.callId) await cancelCall(data.callId);
          onAnswer(data.kind, data.personaId);
        } else if (type === EventType.DELIVERED) {
          // Notification just arrived while the app is in the foreground.
          // Auto-route to the in-app call UI so the user gets the full-screen
          // call experience without having to tap the banner first.
          onAnswer(data.kind, data.personaId);
        }
      } catch {
        // never let an event handler error propagate
      }
    });
  } catch {
    // Notifee not available — registration is a no-op
    foregroundUnsub = () => undefined;
  }

  return () => {
    if (foregroundUnsub) {
      try { foregroundUnsub(); } catch { /* ignore */ }
      foregroundUnsub = null;
    }
  };
}
