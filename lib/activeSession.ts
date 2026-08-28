/**
 * Active workout session — survives leaving the screen.
 *
 * A lifter who taps back mid-workout (to check form video, answer a call, or by
 * accident) used to lose every logged set. This is the single source of truth
 * for "there is a workout in progress": the session screen writes to it, and a
 * "Continue your workout" entry point reads from it.
 *
 * Two hard rules, because this runs on the critical path of a live workout:
 *   - Nothing here may throw. A corrupt or half-written payload resolves to
 *     "no session" (and is deleted), never to a crash or a blocked render.
 *   - A session is only offered back while it is plausibly still the SAME
 *     workout. Waking up to yesterday's abandoned session being "resumed" is
 *     worse than losing it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ActiveSession {
  programId: string;
  dayIndex: number;
  startedAt: number;
  exerciseIndex: number;
  /** Screen-owned progress blob (keyed by exercise name). Opaque to this module. */
  setsLogged: Record<string, unknown>;
  volumeModifier: number;
  lastTouchedAt: number;
}

/** Single key — there is at most ONE workout in progress. */
const KEY = 'evulto:activeWorkoutSession:v1';

/**
 * Beyond this the session is abandoned, not paused. 12h covers a workout
 * interrupted for most of a day but never spans to the next morning's session.
 */
export const SESSION_STALE_MS = 12 * 60 * 60 * 1000;

/**
 * Notification id of the ongoing-workout chip.
 *
 * Lives here, beside the session state it mirrors, because two places need it:
 * workout-session raises and clears it, and app/_layout cancels a leftover one at
 * boot when no session survives. Duplicating the string in both is how they drift.
 */
export const WORKOUT_SESSION_NOTIF_ID = 'workout-session-ongoing';

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce an unknown parsed payload into an ActiveSession, or null if unusable. */
function coerce(raw: unknown): ActiveSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.programId !== 'string' || r.programId.length === 0) return null;

  const startedAt = toFiniteNumber(r.startedAt, 0);
  if (startedAt <= 0) return null; // without a start time staleness can't be judged

  const setsLogged =
    r.setsLogged && typeof r.setsLogged === 'object' && !Array.isArray(r.setsLogged)
      ? (r.setsLogged as Record<string, unknown>)
      : {};

  return {
    programId: r.programId,
    dayIndex: Math.max(0, Math.trunc(toFiniteNumber(r.dayIndex, 0))),
    startedAt,
    exerciseIndex: Math.max(0, Math.trunc(toFiniteNumber(r.exerciseIndex, 0))),
    setsLogged,
    volumeModifier: toFiniteNumber(r.volumeModifier, 1) || 1,
    lastTouchedAt: toFiniteNumber(r.lastTouchedAt, startedAt),
  };
}

/**
 * Persist the in-progress session. `lastTouchedAt` is stamped here rather than
 * trusted from the caller — a save only ever happens because the session was
 * just touched, and a stale value would expire a live workout early.
 */
export async function saveActiveSession(session: ActiveSession): Promise<void> {
  try {
    const payload = JSON.stringify({ ...session, lastTouchedAt: Date.now() });
    await AsyncStorage.setItem(KEY, payload);
  } catch {
    // Storage full / serialisation failure — losing the checkpoint must never
    // interrupt the set the user is logging.
  }
}

/**
 * The session to resume, or null. Anything unreadable, malformed or older than
 * SESSION_STALE_MS is deleted on the way out, so a bad payload can't wedge the
 * "Continue your workout" affordance permanently.
 */
export async function getActiveSession(): Promise<ActiveSession | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let session: ActiveSession | null = null;
  try {
    session = coerce(JSON.parse(raw));
  } catch {
    session = null;
  }
  if (!session) {
    await clearActiveSession();
    return null;
  }

  // Age from the last touch (falling back to start) — a workout paused for 20
  // minutes is live; one untouched since last night is not.
  const age = Date.now() - Math.max(session.lastTouchedAt, session.startedAt);
  if (age > SESSION_STALE_MS || age < -SESSION_STALE_MS) {
    // Negative age = clock moved backwards / timezone edit; the timestamp can no
    // longer be trusted, so treat it as abandoned rather than resume blind.
    await clearActiveSession();
    return null;
  }

  return session;
}

export async function clearActiveSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // noop
  }
}

export async function hasActiveSession(): Promise<boolean> {
  return (await getActiveSession()) !== null;
}
