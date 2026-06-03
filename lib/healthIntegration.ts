/**
 * Health Integration — lite wearable data layer
 *
 * Uses expo-sensors Pedometer for step counting.
 * Manual HRV entry and sleep quality self-report.
 * Recovery score drives a volume modifier for workout-lobby.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const HRV_KEY       = 'hrv_readings:v1';
const SLEEP_KEY     = 'sleep_quality:v1';
const MODIFIER_KEY  = 'workout_modifier:v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HRVEntry {
  value: number;
  date: string; // YYYY-MM-DD
}

export interface SleepEntry {
  value: 1 | 2 | 3 | 4 | 5;
  date: string; // YYYY-MM-DD
}

export interface RecoveryBreakdown {
  hrv: number | null;       // raw HRV value (or null if none today)
  sleepQuality: number;     // 1-5
  steps: number;            // steps today
  hrvScore: number;         // normalized 0-1
  sleepScore: number;       // normalized 0-1
  stepsScore: number;       // normalized 0-1
}

export interface RecoveryResult {
  score: number;            // 0-100
  modifier: number;         // volume modifier e.g. 0.8, 1.0, 1.2
  breakdown: RecoveryBreakdown;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export async function getStepsToday(): Promise<number> {
  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) return 0;

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const result = await Pedometer.getStepCountAsync(start, now);
    return result.steps;
  } catch {
    return 0;
  }
}

// ─── HRV ─────────────────────────────────────────────────────────────────────

async function loadHRVEntries(): Promise<HRVEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HRV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function logHRV(value: number): Promise<void> {
  const entries = await loadHRVEntries();
  const date = todayISO();
  // Replace today's entry if exists
  const filtered = entries.filter((e) => e.date !== date);
  filtered.push({ value, date });
  // Keep last 30 days
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = filtered.slice(-30);
  await AsyncStorage.setItem(HRV_KEY, JSON.stringify(trimmed));
}

export async function getTodayHRV(): Promise<number | null> {
  const entries = await loadHRVEntries();
  const today = todayISO();
  return entries.find((e) => e.date === today)?.value ?? null;
}

// ─── Sleep Quality ────────────────────────────────────────────────────────────

async function loadSleepEntries(): Promise<SleepEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SLEEP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function logSleepQuality(value: 1 | 2 | 3 | 4 | 5): Promise<void> {
  const entries = await loadSleepEntries();
  const date = todayISO();
  const filtered = entries.filter((e) => e.date !== date);
  filtered.push({ value, date });
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = filtered.slice(-30);
  await AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(trimmed));
}

export async function getTodaySleepQuality(): Promise<number> {
  const entries = await loadSleepEntries();
  const today = todayISO();
  return entries.find((e) => e.date === today)?.value ?? 3; // default mid
}

// ─── Recovery Score ───────────────────────────────────────────────────────────

/**
 * Recovery score formula:
 *   score = (hrv/100 * 0.4) + (sleep/5 * 0.4) + (steps/10000 * 0.2)  capped 0-1
 *
 * Volume modifier mapping:
 *   score >= 0.75 → 1.1 (slight boost)
 *   score >= 0.55 → 1.0 (normal)
 *   score >= 0.35 → 0.9 (reduce slightly)
 *   below 0.35   → 0.8 (significant reduction)
 */
export async function getRecoveryScore(): Promise<RecoveryResult> {
  const [hrv, sleep, steps] = await Promise.all([
    getTodayHRV(),
    getTodaySleepQuality(),
    getStepsToday(),
  ]);

  const hrvNorm  = hrv !== null ? Math.min(1, hrv / 100) : 0.5; // assume mid if no reading
  const sleepNorm = Math.min(1, sleep / 5);
  const stepsNorm = Math.min(1, steps / 10000);

  const rawScore = (hrvNorm * 0.4) + (sleepNorm * 0.4) + (stepsNorm * 0.2);
  const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

  const modifier =
    score >= 75 ? 1.1 :
    score >= 55 ? 1.0 :
    score >= 35 ? 0.9 : 0.8;

  return {
    score,
    modifier,
    breakdown: {
      hrv,
      sleepQuality: sleep,
      steps,
      hrvScore: hrvNorm,
      sleepScore: sleepNorm,
      stepsScore: stepsNorm,
    },
  };
}

// ─── Workout Modifier ─────────────────────────────────────────────────────────

export interface ModifierEntry {
  modifier: number;
  date: string;
}

export async function saveWorkoutModifier(modifier: number): Promise<void> {
  const entry: ModifierEntry = { modifier, date: todayISO() };
  await AsyncStorage.setItem(MODIFIER_KEY, JSON.stringify(entry));
}

export async function getTodayWorkoutModifier(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(MODIFIER_KEY);
    if (!raw) return null;
    const entry: ModifierEntry = JSON.parse(raw);
    if (entry.date !== todayISO()) return null;
    return entry.modifier;
  } catch {
    return null;
  }
}
