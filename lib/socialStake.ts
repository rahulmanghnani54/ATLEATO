/**
 * Social Stake — accountability witness system
 *
 * The user picks ONE person (the "witness") who gets notified if they
 * skip a training week. Kelly McGonigal's research: public commitment
 * pushes adherence from ~35% (private goals) to ~78%.
 *
 * Privacy-first design:
 *   - Witness contact is stored LOCALLY only (AsyncStorage) — never sent
 *     to our servers, never shared cross-device
 *   - SMS is NEVER sent silently — we open the phone's SMS app with a
 *     pre-composed message and let the user tap Send
 *   - User can change or remove their witness anytime
 *
 * Trigger: each Sunday evening, if user trained fewer than 3 days this
 * week, the home screen surfaces a "Text [Witness Name] about this week"
 * banner. Tapping opens SMS with the message pre-filled.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_WITNESS         = 'social_stake_witness:v1';
const KEY_LAST_NUDGE_WEEK = 'social_stake_last_nudge_week:v1';

export interface Witness {
  name:        string;
  phone:       string;   // E.164 format ideally, but stored as user entered
  relationship?: string; // 'partner', 'friend', 'sibling' — optional context
  setAt:       string;
}

// In-memory cache for sync UI
let cachedWitness: Witness | null = null;
let cachedLastNudgeWeek: string | null = null;
let cacheLoaded = false;

async function ensureLoaded(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const [w, n] = await Promise.all([
      AsyncStorage.getItem(KEY_WITNESS),
      AsyncStorage.getItem(KEY_LAST_NUDGE_WEEK),
    ]);
    cachedWitness        = w ? (JSON.parse(w) as Witness) : null;
    cachedLastNudgeWeek  = n ?? null;
  } catch {
    cachedWitness = null;
    cachedLastNudgeWeek = null;
  }
  cacheLoaded = true;
}

export async function getWitness(): Promise<Witness | null> {
  await ensureLoaded();
  return cachedWitness;
}

export async function setWitness(input: Omit<Witness, 'setAt'>): Promise<Witness> {
  const w: Witness = { ...input, setAt: new Date().toISOString() };
  cachedWitness = w;
  try { await AsyncStorage.setItem(KEY_WITNESS, JSON.stringify(w)); } catch { /* ignore */ }
  return w;
}

export async function clearWitness(): Promise<void> {
  cachedWitness = null;
  try { await AsyncStorage.removeItem(KEY_WITNESS); } catch { /* ignore */ }
}

/**
 * "Week key" identifies the week — ISO year + week number.
 * Used to make sure we don't nudge twice in the same week.
 */
export function weekKey(d: Date = new Date()): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;       // make Monday = 0
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const wk = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/** Mark the nudge as fired for the current week so we don't repeat it. */
export async function markNudged(): Promise<void> {
  await ensureLoaded();
  cachedLastNudgeWeek = weekKey();
  try { await AsyncStorage.setItem(KEY_LAST_NUDGE_WEEK, cachedLastNudgeWeek); } catch { /* ignore */ }
}

/**
 * Should we show the "text your witness" nudge today?
 *
 * Yes when:
 *   - User has a witness configured
 *   - It's Sunday OR Monday (giving up-to-2-day window in case they missed Sun)
 *   - We haven't already nudged this week
 *   - Their actual session count this week is below the threshold (passed in)
 */
export async function shouldShowWitnessNudge(args: {
  sessionsThisWeek: number;
  thresholdSessions?: number;        // default 3
  now?: Date;
}): Promise<boolean> {
  await ensureLoaded();
  if (!cachedWitness) return false;
  const { sessionsThisWeek, thresholdSessions = 3, now = new Date() } = args;
  if (sessionsThisWeek >= thresholdSessions) return false;
  const dow = now.getDay(); // 0=Sun, 1=Mon
  if (dow !== 0 && dow !== 1) return false;
  const wk = weekKey(now);
  if (cachedLastNudgeWeek === wk) return false;
  return true;
}

/**
 * Build the message the user will (optionally) send to their witness.
 * Coach-specific tone, includes the user's first name + week summary.
 */
export function buildWitnessMessage(args: {
  userName: string;
  witnessName: string;
  sessionsThisWeek: number;
  thresholdSessions?: number;
  personaShortName?: string;
}): string {
  const { userName, witnessName, sessionsThisWeek, thresholdSessions = 3 } = args;
  const missed = Math.max(0, thresholdSessions - sessionsThisWeek);
  return (
    `Hey ${witnessName}, it's ${userName}.\n\n` +
    `Quick accountability check-in via Atleato — I committed to ${thresholdSessions} workouts this week ` +
    `but only hit ${sessionsThisWeek}. I'm ${missed} short. ` +
    `Holding myself accountable by telling you. Next week I'm back on it.\n\n` +
    `(You don't have to reply — just wanted to keep it honest.)`
  );
}
