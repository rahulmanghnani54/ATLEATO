/**
 * Implementation Intentions
 *
 * Pre-commitment system based on Gollwitzer & Oettingen's research:
 * a vague goal ("I'll work out tomorrow") has ~35% follow-through.
 * Naming WHEN, WHERE, and WHAT TO WEAR before the moment of choice
 * jumps follow-through to 70-90%. The brain treats the future commitment
 * as already made.
 *
 * Tomorrow's intention is set the night before (or right after today's
 * workout — we trigger from post-workout). Stored per-date so we can show
 * "TOMORROW'S COMMITMENT" on the home screen until that day's session is logged.
 *
 * Storage: AsyncStorage under `intention:YYYY-MM-DD` so old keys auto-cleanup
 * on app launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

const KEY_PREFIX = 'intention:';

export interface Intention {
  date: string;        // 'YYYY-MM-DD' — the date this commitment is FOR
  timeOfDay: string;   // 'HH:MM' 24h
  location: string;    // free text: 'Gold's Gym', 'Home garage', etc.
  wearing: string;     // chip choice: 'Full gear', 'Shorts + tee', etc.
  setAt: string;       // ISO timestamp when committed
}

function todayISO(): string { return format(new Date(), 'yyyy-MM-dd'); }
function tomorrowISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return format(t, 'yyyy-MM-dd');
}

/** Get the intention for a specific date (today/tomorrow most common). */
export async function getIntention(dateISO: string): Promise<Intention | null> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${dateISO}`);
    if (!raw) return null;
    return JSON.parse(raw) as Intention;
  } catch {
    return null;
  }
}

export async function getTomorrowIntention(): Promise<Intention | null> {
  return getIntention(tomorrowISO());
}

export async function getTodayIntention(): Promise<Intention | null> {
  return getIntention(todayISO());
}

/** Save a commitment for a specific date. */
export async function setIntention(args: Omit<Intention, 'setAt'>): Promise<Intention> {
  const intention: Intention = { ...args, setAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${args.date}`, JSON.stringify(intention));
  } catch {
    // best effort
  }
  return intention;
}

export async function clearIntention(dateISO: string): Promise<void> {
  try { await AsyncStorage.removeItem(`${KEY_PREFIX}${dateISO}`); } catch { /* ignore */ }
}

/** Sweep AsyncStorage and delete any intention keys older than today. */
export async function cleanupOldIntentions(): Promise<void> {
  try {
    const today = todayISO();
    const allKeys = await AsyncStorage.getAllKeys();
    const stale = allKeys.filter((k) => k.startsWith(KEY_PREFIX) && k.replace(KEY_PREFIX, '') < today);
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch { /* ignore */ }
}

/** Format a 24h time string ('06:30') as a friendly 12h string ('6:30 AM'). */
export function formatTime12h(hm: string): string {
  const [hStr, mStr] = hm.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}
