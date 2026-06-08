/**
 * Coach Calls Scheduler
 *
 * Wraps expo-notifications to schedule daily wake-up and workout-time
 * notifications that LOOK and SOUND like an incoming call from your coach.
 *
 * Each notification:
 *   - Uses the coach's voice in the title and body (CT shouts in CAPS,
 *     The Governor inspires, The Scientist data-talks, Dr. Growth calculates, THE SCULPTOR is calm)
 *   - Is tagged with a persistent ID so we can cancel/replace cleanly
 *   - On tap, deep-links into the right screen via the `data` payload
 *     (consumed by `app/_layout.tsx`'s notification response listener)
 *
 * Permission handling, scheduling, and cancellation are all here so the UI
 * can stay declarative.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { getPersona, type PersonaTheme, type PersonaId } from './personaTheme';

export type CallKind = 'wakeup' | 'workout';

const IDENTIFIER_PREFIX = 'coach-call:';
const CHANNEL_ID        = 'coach-calls-alarm';   // v2 channel — Android caches old props, so new name
const CATEGORY_ID       = 'coach-call-actions'; // for ANSWER / SNOOZE buttons

const idFor = (kind: CallKind) => `${IDENTIFIER_PREFIX}${kind}`;

// ─────────────────────────────────────────────────────────────────────────────
// Coach-voice templates
// ─────────────────────────────────────────────────────────────────────────────

interface CallCopy { title: string; body: string }

const WAKEUP_LINES: Record<PersonaId, CallCopy> = {
  cbum: {
    title: '📞 THE SCULPTOR CALLING',
    body: "Good morning. The mat's ready. Are you?",
  },
  arnold: {
    title: '📞 THE GOVERNOR CALLING',
    body: 'Rise up, champion. Today is yours to take.',
  },
  nippard: {
    title: '📞 THE SCIENTIST CALLING',
    body: 'Morning check-in: hydrate, eat protein, get moving.',
  },
  ct_fletcher: {
    title: '📞 THE COMMANDER CALLING',
    body: 'WAKE THE HELL UP! I COMMAND YOU TO MOVE!',
  },
  dr_mike: {
    title: '📞 DR. GROWTH CALLING',
    body: 'Mesocycle progress check — your day starts now.',
  },
};

const WORKOUT_LINES: Record<PersonaId, CallCopy> = {
  cbum: {
    title: '📞 THE SCULPTOR CALLING',
    body: "Session time. Let's get to work — control every rep.",
  },
  arnold: {
    title: '📞 THE GOVERNOR CALLING',
    body: 'The gym is waiting. The last three reps build the muscle.',
  },
  nippard: {
    title: '📞 THE SCIENTIST CALLING',
    body: 'Training window open. RIR 1-3 on top sets today.',
  },
  ct_fletcher: {
    title: '📞 THE COMMANDER CALLING',
    body: 'GET TO THAT GYM! NO EXCUSES! I COMMAND YOU TO GROW!',
  },
  dr_mike: {
    title: '📞 DR. GROWTH CALLING',
    body: 'Volume window: now. Hit your sets, log the data, deload Friday.',
  },
};

export function getCallCopy(persona: PersonaTheme, kind: CallKind): CallCopy {
  const table = kind === 'wakeup' ? WAKEUP_LINES : WORKOUT_LINES;
  return table[persona.id] ?? table.cbum;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission + handler setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configure how notifications behave while the app is in the foreground.
 * Call this once during app startup (in `_layout.tsx`).
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Ensure we have permission to send notifications. Returns final status. */
export async function ensureNotificationPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  const next = await Notifications.requestPermissionsAsync({
    android: { allowAlert: true, allowSound: true } as any,
    ios: { allowAlert: true, allowSound: true },
  } as any);
  return (next.status as any) ?? 'undetermined';
}

/**
 * Wake-up-call grade notification setup:
 *   - MAX importance (the cap — louder than HIGH, bypasses silent if user allowed)
 *   - bypassDnd: true (rings during Do Not Disturb)
 *   - Long ring-pattern vibration (mimics a phone call's 1s-on / 0.5s-off pulse)
 *   - PUBLIC lockscreen visibility (full content shown on lock screen)
 *   - Lights enabled
 *
 * Plus a notification CATEGORY with ANSWER + SNOOZE 5 MIN action buttons,
 * so it visually behaves like an incoming call.
 *
 * Android caches channel properties at first creation — that's why this is
 * `coach-calls-alarm` (v2) instead of upgrading the old `coach-calls` channel.
 */
export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Coach Calls (Alarm)',
    description: 'Wake-up and workout calls from your coach — rings like an alarm',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    // Long pulse pattern — 6 seconds of "ring" cycle (1s on, 0.5s off, repeat)
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true,
    showBadge: true,
  });
}

/**
 * Register the ANSWER / DECLINE action buttons that appear on every coach call.
 * Behaves like an incoming-call UI. Call once at app startup.
 */
export async function setupCallActionCategory() {
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: 'ANSWER',
      buttonTitle: '✓  Answer',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'DECLINE',
      buttonTitle: '✕  Decline',
      options: { opensAppToForeground: false },
    },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring-chain + decline configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Number of follow-up rings after the main one (so total = 1 + N). */
const FOLLOWUP_RING_COUNT = 5;       // 1 main + 5 follow-ups = 6 rings total
/** Seconds between each follow-up ring. */
const RING_INTERVAL_SEC   = 4;       // 6 rings × 4s ≈ 25s of "ringing"
/** Seconds to wait before the angry follow-up after user taps DECLINE. */
const NOEXCUSES_DELAY_SEC = 60;

/** Persona-specific "you said no? Wrong." line — spoken via TTS when DECLINE pressed. */
const DECLINE_LINES: Record<PersonaId, string> = {
  cbum:        "Not today? I'll be back. Set the bar higher tomorrow.",
  arnold:      "There are no excuses. The iron does not wait. Rise.",
  nippard:     "Adherence is your single biggest variable. Don't break the streak.",
  ct_fletcher: "WHAT?! NO?! I COMMANDED YOU TO GET UP! NO EXCUSES! I'LL BE BACK!",
  dr_mike:     "Compliance percentile just dropped. You're sabotaging your own mesocycle.",
};

/** Voice profile per persona (mirrors the one in voiceCues.ts — kept local for self-containment). */
const DECLINE_VOICE: Record<PersonaId, { pitch: number; rate: number }> = {
  cbum:        { pitch: 1.00, rate: 0.95 },
  arnold:      { pitch: 0.82, rate: 0.88 },
  nippard:     { pitch: 1.05, rate: 1.05 },
  ct_fletcher: { pitch: 0.92, rate: 1.10 },
  dr_mike:     { pitch: 1.00, rate: 1.10 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule (or replace) one of the two daily coach calls.
 *
 * Cancels any prior notification with the same identifier so we never
 * end up with stale or duplicate reminders.
 */
export async function scheduleCoachCall(args: {
  kind: CallKind;
  hour: number;
  minute: number;
  personaId: PersonaId;
}): Promise<void> {
  const { kind, hour, minute, personaId } = args;
  const persona = getPersona(personaId);
  const copy = getCallCopy(persona, kind);

  // Always cancel the prior schedule for this kind first
  await cancelCoachCall(kind);

  await Notifications.scheduleNotificationAsync({
    identifier: idFor(kind),
    content: {
      title: copy.title,
      body: copy.body,
      sound: 'default',
      data: { kind, personaId, snoozeable: true },
      categoryIdentifier: CATEGORY_ID,        // ANSWER / SNOOZE buttons
      sticky: true,                            // stays until tapped
      autoDismiss: false,
      ...(Platform.OS === 'android'
        ? ({
            channelId: CHANNEL_ID,
            priority: Notifications.AndroidNotificationPriority.MAX,
          } as any)
        : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    } as any,
  });
}

/** Cancel a specific coach call. Safe to call even if none is scheduled. */
export async function cancelCoachCall(kind: CallKind): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(idFor(kind));
  } catch {
    // ignore — nothing was scheduled
  }
}

/** List currently-scheduled coach calls (for debugging / status). */
export async function listScheduledCoachCalls(): Promise<Array<{ kind: CallKind; identifier: string }>> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((n) => n.identifier.startsWith(IDENTIFIER_PREFIX))
    .map((n) => ({
      kind: n.identifier.replace(IDENTIFIER_PREFIX, '') as CallKind,
      identifier: n.identifier,
    }));
}

/**
 * Fire a TEST coach call right now using the full ringing-chain experience.
 * Fires 6 notifications spaced ~4s apart over ~25 seconds — gives the user a
 * real "incoming call" ringing feel using the alarm-grade channel sound,
 * without bundling a custom audio file.
 *
 * Tap ANSWER on any of them → opens app, cancels remaining rings.
 * Tap DECLINE → coach speaks "no excuses" line + schedules angry follow-up.
 */
export async function sendTestCall(args: { kind: CallKind; personaId: PersonaId }): Promise<void> {
  await fireRingingChain({ ...args, isTest: true });
}

/**
 * The core ringing-chain: schedules 1 main + N follow-up notifications spaced
 * `RING_INTERVAL_SEC` apart. Each one plays the channel's alarm sound +
 * vibration. Visually they look like an incoming call that keeps ringing.
 */
async function fireRingingChain(args: {
  kind: CallKind;
  personaId: PersonaId;
  isTest?: boolean;
}): Promise<void> {
  const { kind, personaId, isTest } = args;
  const persona = getPersona(personaId);
  const copy = getCallCopy(persona, kind);
  const baseId = `${IDENTIFIER_PREFIX}RING-${kind}`;

  // Clean up any prior ring chain so we don't double up
  await cancelRingingChain(kind);

  const ringContent = (ringIdx: number) => ({
    title: copy.title + (isTest ? ' (TEST)' : '') + (ringIdx > 0 ? `  ·  ${ringIdx + 1}` : ''),
    body: copy.body,
    sound: 'default',
    data: { kind, personaId, ring: ringIdx, test: !!isTest },
    categoryIdentifier: CATEGORY_ID,
    sticky: true,
    autoDismiss: false,
    ...(Platform.OS === 'android'
      ? ({
          channelId: CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.MAX,
        } as any)
      : {}),
  });

  // Main ring fires immediately
  await Notifications.scheduleNotificationAsync({
    identifier: `${baseId}-0`,
    content: ringContent(0),
    trigger: null, // null = fire immediately
  });

  // Follow-up rings stretch the experience to ~25 seconds
  for (let i = 1; i <= FOLLOWUP_RING_COUNT; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${baseId}-${i}`,
      content: ringContent(i),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: i * RING_INTERVAL_SEC,
        repeats: false,
      } as any,
    });
  }
}

/**
 * Cancel all pending follow-up rings AND dismiss any visible rings for `kind`.
 * Called when user taps ANSWER or DECLINE so the phone stops ringing.
 */
export async function cancelRingingChain(kind: CallKind): Promise<void> {
  const baseId = `${IDENTIFIER_PREFIX}RING-${kind}`;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(baseId))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => n.request.identifier.startsWith(baseId))
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
    );
  } catch {
    // best-effort cleanup
  }
}

/**
 * User tapped DECLINE — coach doesn't accept "no":
 *   1. Stop the ringing chain
 *   2. Speak the persona's "you cannot say no" line via TTS
 *   3. Schedule an aggressive follow-up notification in 60 seconds
 */
export async function declineCoachCall(args: {
  kind: CallKind;
  personaId: PersonaId;
}): Promise<void> {
  const { kind, personaId } = args;
  const persona = getPersona(personaId);

  // 1. Silence the current ring chain
  await cancelRingingChain(kind);

  // 2. Speak the persona's "no excuses" line via TTS
  const line = DECLINE_LINES[personaId] ?? DECLINE_LINES.cbum;
  const voice = DECLINE_VOICE[personaId] ?? DECLINE_VOICE.cbum;
  try {
    Speech.speak(line, { language: 'en-US', pitch: voice.pitch, rate: voice.rate, volume: 1.0 });
  } catch {
    // TTS unavailable — the follow-up notification below still lands
  }

  // 3. Coach won't take no for an answer — fires back in 60 seconds
  await Notifications.scheduleNotificationAsync({
    identifier: `${IDENTIFIER_PREFIX}NOEXCUSES-${kind}-${Date.now()}`,
    content: {
      title: `⚠️  ${persona.shortName} IS NOT DONE WITH YOU`,
      body: line,
      sound: 'default',
      data: { kind, personaId, noexcuses: true },
      categoryIdentifier: CATEGORY_ID,
      sticky: true,
      autoDismiss: false,
      ...(Platform.OS === 'android'
        ? ({
            channelId: CHANNEL_ID,
            priority: Notifications.AndroidNotificationPriority.MAX,
          } as any)
        : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: NOEXCUSES_DELAY_SEC,
      repeats: false,
    } as any,
  });
}

// (snoozeCoachCall removed — replaced by declineCoachCall in the ANSWER/DECLINE flow)

/**
 * Compute when the next firing of a daily-scheduled notification at (hour:minute)
 * will be in local time. Used to show "Next call: tomorrow at 6:30 AM" in the UI.
 */
export function getNextFiringDate(hour: number, minute: number, now: Date = new Date()): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    // Time already passed today — next fire is tomorrow
    next.setDate(next.getDate() + 1);
  }
  return next;
}
