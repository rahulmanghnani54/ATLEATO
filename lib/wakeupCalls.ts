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
// react-native-callkeep doesn't support the New Architecture (it declares
// duplicate `displayIncomingCall` methods that the TurboModule interop layer
// rejects). We CAN'T disable New Arch because react-native-worklets — needed
// by the Form Coach via vision-camera — REQUIRES it. So we lazy-load
// CallKeep inside a try/catch. When it works (legacy arch builds) we use it;
// when it doesn't (current setup) we fall through to a Notifee-based ring.
let RNCallKeep: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNCallKeep = require('react-native-callkeep').default;
} catch {
  RNCallKeep = null;
}

import notifee, {
  TriggerType, AndroidImportance, AndroidVisibility, AndroidCategory,
  type TimestampTrigger,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { getPersona, type PersonaId } from './personaTheme';

const APP_NAME    = 'Atleato';
const HANDLE_TYPE = 'generic' as const;
const RING_CHANNEL = 'atleato-wakeup-call';
const WAKEUP_NOTIFEE_ID_PREFIX = 'atleato-wakeup:';

let callKeepReady = false;

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * Initialize CallKeep once at app boot. Idempotent — safe to call multiple
 * times. On Android we register a phone account; iOS sets up the CallKit
 * provider configuration.
 */
export async function setupCallKeep(): Promise<void> {
  if (callKeepReady) return;
  if (!RNCallKeep) return; // native module not available — Notifee handles ringing
  try {
    await RNCallKeep.setup({
      ios: {
        appName: APP_NAME,
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false,
      },
      android: {
        // CallKeep Android setup options
        alertTitle: 'Permission required',
        alertDescription:
          'Atleato needs permission to act as a calling app so your coach can wake you up.',
        cancelButton: 'Not now',
        okButton: 'Allow',
        additionalPermissions: [],
        selfManaged: false,
      },
    } as any);
    // Tell Android we're an "online" calling provider so it'll route to us
    if (Platform.OS === 'android') {
      RNCallKeep.setAvailable(true);
      (RNCallKeep as any).registerPhoneAccount({
        alertTitle: 'Allow wake-up calls',
        alertDescription: 'So your coach can ring you, not just notify you.',
        cancelButton: 'Not now',
        okButton: 'Allow',
        additionalPermissions: [],
      });
    }
    callKeepReady = true;
  } catch (err: any) {
    if (__DEV__) console.warn('[wakeup] CallKeep setup failed:', err?.message ?? err);
  }
}

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
  await setupCallKeep();
  const callUUID = generateUUID();

  // Path A — CallKeep is available (legacy arch builds): real system ring.
  if (RNCallKeep) {
    const persona = getPersona(opts.persona);
    const handle = persona.shortName.toLowerCase();
    const localizedCallerName = `${persona.shortName} · ${opts.reason ?? 'WAKE UP'}`;
    RNCallKeep.displayIncomingCall(
      callUUID, handle, localizedCallerName, HANDLE_TYPE, false,
    );
    return callUUID;
  }

  // Path B — New Arch / no CallKeep: fire a persistent-ring loop of Notifee
  // notifications every 3s for 60s so the system call sound + vibration
  // keep triggering. The /incoming-call screen calls stopPersistentRing()
  // on mount.
  await startPersistentRing(opts.persona, opts.reason ?? 'WAKE UP');
  return callUUID;
}

// ─── Persistent ring loop (used when CallKeep isn't available) ─────────────

let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringNotificationIds: string[] = [];

/**
 * Fire a series of high-priority CALL-category notifications every 3 seconds
 * for the given duration. Each notification re-triggers the system call
 * sound + vibration on Android. Total impact = real-call-feeling ring that
 * keeps going for ~60s until the user actively answers or declines.
 */
async function startPersistentRing(
  personaId: PersonaId,
  reason: string,
  durationSec = 60,
): Promise<void> {
  await ensureChannel();
  await stopPersistentRing(); // clear any previous loop

  const persona = getPersona(personaId);
  const start = Date.now();
  const callerName = `${persona.shortName} · ${reason}`;

  const fire = async () => {
    if (Date.now() - start > durationSec * 1000) {
      await stopPersistentRing();
      return;
    }
    try {
      const nid = await notifee.displayNotification({
        id: `${WAKEUP_NOTIFEE_ID_PREFIX}ring-${Date.now()}`,
        title: callerName,
        body: 'Incoming call · swipe to answer',
        data: { kind: 'wakeup-call', persona: personaId },
        android: {
          channelId: RING_CHANNEL,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          category: AndroidCategory.CALL,
          sound: 'default',
          fullScreenAction: { id: 'default', launchActivity: 'default' },
          pressAction:      { id: 'default', launchActivity: 'default' },
          ongoing: true,
          autoCancel: false,
        },
      });
      ringNotificationIds.push(nid);
    } catch (e: any) {
      if (__DEV__) console.warn('[wakeup] ring fire failed:', e?.message);
    }
  };

  await fire();
  ringTimer = setInterval(fire, 3000);
}

/** Called by /incoming-call when the user opens it. Stops the loop. */
export async function stopPersistentRing(): Promise<void> {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  for (const id of ringNotificationIds) {
    try { await notifee.cancelNotification(id); } catch { /* ignore */ }
  }
  ringNotificationIds = [];
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

export async function listScheduledWakeupIds(): Promise<string[]> {
  const ids = await notifee.getTriggerNotificationIds();
  return ids.filter((x) => x.startsWith(WAKEUP_NOTIFEE_ID_PREFIX) || true);
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
  try {
    await triggerIncomingCall({ persona, reason: 'WAKE UP' });
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

// ─── CallKeep event wiring (call from app boot) ─────────────────────────────

/**
 * Wire CallKeep events so when the user answers / declines the call we route
 * them appropriately. Call this ONCE at app boot, after setupCallKeep.
 */
export function wireCallKeepEvents(opts: {
  onAnswered: (uuid: string) => void;
  onDeclined: (uuid: string) => void;
}): void {
  if (!RNCallKeep) return; // safe no-op when native module missing
  RNCallKeep.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) => {
    try { opts.onAnswered(callUUID); } finally {
      RNCallKeep.setCurrentCallActive(callUUID);
    }
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }: { callUUID: string }) => {
    opts.onDeclined(callUUID);
  });
}
