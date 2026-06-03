/**
 * Streak Freezes — Duolingo-style "freeze" mechanic
 *
 * Rules:
 *   - User earns 1 freeze every 7 consecutive training days (max 3 stored)
 *   - When user misses a day and has a freeze, it AUTO-APPLIES to save the streak
 *   - Without a freeze, missing a day resets streak to 0
 *   - Freezes are visible as ice-cube icons next to the flame in StreakHero
 *
 * Why this works (research):
 *   - Removes the "I broke my streak so I'm quitting" failure mode
 *   - Creates loss aversion (the freeze itself becomes a precious resource)
 *   - Forgives once but punishes twice — the perfect balance
 *
 * Storage: AsyncStorage (instant, offline-safe).
 *   - `freezes_available:v1` → number 0..MAX
 *   - `frozen_dates:v1`     → string[] of ISO dates ('YYYY-MM-DD') where a freeze
 *                              was consumed to save the streak across that day
 *   - `last_freeze_award:v1` → last streak count at which a freeze was awarded
 *                               (prevents double-award at the same milestone)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canAccess } from '@/lib/featureGates';

const KEY_FREEZES         = 'freezes_available:v1';
const KEY_FROZEN_DATES    = 'frozen_dates:v1';
const KEY_LAST_AWARD      = 'last_freeze_award:v1';

export const MAX_FREEZES_PRO     = 3;
export const MAX_FREEZES_FREE    = 1;

export function getMaxFreezes(): number {
  return canAccess('unlimited_freezes') ? MAX_FREEZES_PRO : MAX_FREEZES_FREE;
}

export const STREAK_PER_FREEZE   = 7;   // earn a freeze every 7 consecutive days

// In-memory cache so sync UI reads don't hit AsyncStorage every render
let cachedFreezes: number       = 0;
let cachedFrozenDates: string[] = [];
let cachedLastAward: number     = 0;
let cacheLoaded = false;

async function ensureLoaded(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const [f, d, l] = await Promise.all([
      AsyncStorage.getItem(KEY_FREEZES),
      AsyncStorage.getItem(KEY_FROZEN_DATES),
      AsyncStorage.getItem(KEY_LAST_AWARD),
    ]);
    cachedFreezes      = f ? Math.max(0, Math.min(getMaxFreezes(), parseInt(f, 10) || 0)) : 0;
    cachedFrozenDates  = d ? JSON.parse(d) : [];
    cachedLastAward    = l ? (parseInt(l, 10) || 0) : 0;
  } catch {
    cachedFreezes = 0; cachedFrozenDates = []; cachedLastAward = 0;
  }
  cacheLoaded = true;
}

async function flush(): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEY_FREEZES, String(cachedFreezes)],
      [KEY_FROZEN_DATES, JSON.stringify(cachedFrozenDates)],
      [KEY_LAST_AWARD, String(cachedLastAward)],
    ]);
  } catch { /* best effort */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface FreezeState {
  freezes:       number;
  frozenDates:   string[];
  lastAwardAt:   number;
}

export async function getFreezeState(): Promise<FreezeState> {
  await ensureLoaded();
  return {
    freezes: cachedFreezes,
    frozenDates: [...cachedFrozenDates],
    lastAwardAt: cachedLastAward,
  };
}

/**
 * Award a freeze if the user just crossed a STREAK_PER_FREEZE milestone
 * (i.e. their streak is 7, 14, 21, ... and we haven't already awarded at this count).
 * Capped at MAX_FREEZES.
 *
 * Returns true if a new freeze was actually awarded this call.
 */
export async function checkAndAwardFreeze(currentStreak: number): Promise<boolean> {
  await ensureLoaded();
  if (currentStreak < STREAK_PER_FREEZE) return false;
  if (currentStreak <= cachedLastAward) return false;   // already awarded for this run

  // Only award if user crossed a 7-day boundary they haven't been awarded for
  const earnedMilestone = Math.floor(currentStreak / STREAK_PER_FREEZE) * STREAK_PER_FREEZE;
  if (earnedMilestone <= cachedLastAward) return false;

  if (cachedFreezes >= getMaxFreezes()) {
    // Inventory full — still update lastAward so we don't award again until next milestone
    cachedLastAward = earnedMilestone;
    await flush();
    return false;
  }

  cachedFreezes += 1;
  cachedLastAward = earnedMilestone;
  await flush();
  return true;
}

/**
 * Consume one freeze to save the streak across a specific missed day.
 * Idempotent — won't double-consume if called twice for the same date.
 *
 * Returns true if a freeze was successfully consumed.
 */
export async function consumeFreezeForDate(missedDateISO: string): Promise<boolean> {
  await ensureLoaded();
  if (cachedFrozenDates.includes(missedDateISO)) return true; // already frozen
  if (cachedFreezes <= 0) return false;
  cachedFreezes -= 1;
  cachedFrozenDates = [...cachedFrozenDates, missedDateISO];
  await flush();
  return true;
}

/** Check if a particular missed date was saved by a freeze (no mutation). */
export async function isFrozen(dateISO: string): Promise<boolean> {
  await ensureLoaded();
  return cachedFrozenDates.includes(dateISO);
}

/** Reset the streak's frozen-dates trail when the streak fully breaks. */
export async function resetFrozenDates(): Promise<void> {
  await ensureLoaded();
  cachedFrozenDates = [];
  cachedLastAward   = 0;
  await flush();
}

/** Manual debug/admin: zero out everything. */
export async function clearAll(): Promise<void> {
  cachedFreezes = 0;
  cachedFrozenDates = [];
  cachedLastAward = 0;
  cacheLoaded = true;
  await flush();
}
