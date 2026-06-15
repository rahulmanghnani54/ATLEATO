/**
 * Wearable Health — real smartwatch data via Apple HealthKit (iOS) and
 * Android Health Connect (the hub Wear OS / Fitbit / Samsung / Garmin write to).
 *
 * Feeds the existing recovery system (lib/healthIntegration.ts): when a watch
 * is connected, getRecoveryScore() uses real steps / HRV / resting-HR / sleep
 * instead of the phone pedometer + manually-typed values.
 *
 * FAIL-SAFE: both native modules are lazy-required in try/catch (same pattern as
 * Branch + CallKeep). Before the native rebuild that includes them — or on a
 * platform/device without health data — every function no-ops and returns null,
 * so the app falls back to manual entry and never crashes.
 */
import { Platform } from 'react-native';

export interface WearableReading {
  steps: number | null;
  restingHeartRate: number | null; // bpm
  hrv: number | null;              // ms (RMSSD)
  sleepHours: number | null;
}

export type HealthStatus = 'unavailable' | 'available';

// ─── lazy module loaders (never throw at import time) ─────────────────────────
function loadHC(): any {
  try { return require('react-native-health-connect'); } catch { return null; }
}
function loadHK(): any {
  try { return require('@kingstinct/react-native-healthkit'); } catch { return null; }
}

const HC_RECORDS = ['Steps', 'HeartRate', 'RestingHeartRate', 'HeartRateVariabilityRmssd', 'SleepSession'];

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: now.toISOString() };
}

// ─── Availability ─────────────────────────────────────────────────────────────
export async function getHealthStatus(): Promise<HealthStatus> {
  try {
    if (Platform.OS === 'android') {
      const HC = loadHC();
      if (!HC) return 'unavailable';
      const status = await HC.getSdkStatus?.();
      // 3 === SDK_AVAILABLE in react-native-health-connect
      return status === 3 || status === HC.SdkAvailabilityStatus?.SDK_AVAILABLE
        ? 'available' : 'unavailable';
    }
    if (Platform.OS === 'ios') {
      const HK = loadHK();
      if (!HK) return 'unavailable';
      const ok = await (HK.isHealthDataAvailable?.() ?? HK.default?.isHealthDataAvailable?.());
      return ok ? 'available' : 'unavailable';
    }
  } catch { /* fall through */ }
  return 'unavailable';
}

// ─── Permission request ───────────────────────────────────────────────────────
/** Returns true if the user granted (at least some) health read permissions. */
export async function connectHealth(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const HC = loadHC();
      if (!HC) return false;
      const ready = await HC.initialize();
      if (!ready) return false;
      const granted = await HC.requestPermission(
        HC_RECORDS.map((recordType) => ({ accessType: 'read', recordType })),
      );
      return Array.isArray(granted) ? granted.length > 0 : !!granted;
    }
    if (Platform.OS === 'ios') {
      const HK = loadHK();
      if (!HK) return false;
      const reqAuth = HK.requestAuthorization ?? HK.default?.requestAuthorization;
      if (!reqAuth) return false;
      // Read-only: steps, resting HR, HRV, sleep
      await reqAuth(
        [
          'HKQuantityTypeIdentifierStepCount',
          'HKQuantityTypeIdentifierRestingHeartRate',
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          'HKCategoryTypeIdentifierSleepAnalysis',
        ],
        [],
      );
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Read today's data ────────────────────────────────────────────────────────
export async function readTodayHealth(): Promise<WearableReading | null> {
  try {
    if (Platform.OS === 'android') return await readAndroid();
    if (Platform.OS === 'ios') return await readIOS();
  } catch { /* fail safe */ }
  return null;
}

async function readAndroid(): Promise<WearableReading | null> {
  const HC = loadHC();
  if (!HC) return null;
  const ready = await HC.initialize();
  if (!ready) return null;

  const range = todayRange();
  const filter = { timeRangeFilter: { operator: 'between', ...range } };
  const recordsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.records ?? []);

  let steps: number | null = null;
  try {
    const recs = recordsOf(await HC.readRecords('Steps', filter));
    steps = recs.reduce((s, x) => s + (x.count ?? 0), 0);
  } catch { /* ignore */ }

  let restingHeartRate: number | null = null;
  try {
    const recs = recordsOf(await HC.readRecords('RestingHeartRate', filter));
    if (recs.length) restingHeartRate = recs[recs.length - 1].beatsPerMinute ?? null;
  } catch { /* ignore */ }

  let hrv: number | null = null;
  try {
    const recs = recordsOf(await HC.readRecords('HeartRateVariabilityRmssd', filter));
    if (recs.length) hrv = recs[recs.length - 1].heartRateVariabilityMillis ?? null;
  } catch { /* ignore */ }

  // Sleep: look back 24h, sum session durations
  let sleepHours: number | null = null;
  try {
    const sleepFilter = {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        endTime: range.endTime,
      },
    };
    const recs = recordsOf(await HC.readRecords('SleepSession', sleepFilter));
    let ms = 0;
    for (const s of recs) ms += new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
    if (ms > 0) sleepHours = ms / 3_600_000;
  } catch { /* ignore */ }

  if (steps === null && restingHeartRate === null && hrv === null && sleepHours === null) return null;
  return { steps, restingHeartRate, hrv, sleepHours };
}

async function readIOS(): Promise<WearableReading | null> {
  const HK = loadHK();
  if (!HK) return null;
  const range = todayRange();
  const get = (name: string) => HK[name] ?? HK.default?.[name];

  let steps: number | null = null;
  let restingHeartRate: number | null = null;
  let hrv: number | null = null;
  let sleepHours: number | null = null;

  // queryStatisticsForQuantity / queryQuantitySamples names vary across HK
  // versions — call defensively, any miss just leaves the field null.
  try {
    const q = get('queryQuantitySamples');
    if (q) {
      const stepSamples = await q('HKQuantityTypeIdentifierStepCount', { from: range.startTime, to: range.endTime });
      const arr = Array.isArray(stepSamples) ? stepSamples : stepSamples?.samples ?? [];
      steps = arr.reduce((s: number, x: any) => s + (x.quantity ?? x.value ?? 0), 0) || null;

      const rhr = await q('HKQuantityTypeIdentifierRestingHeartRate', { from: range.startTime, to: range.endTime });
      const rhrArr = Array.isArray(rhr) ? rhr : rhr?.samples ?? [];
      if (rhrArr.length) restingHeartRate = rhrArr[rhrArr.length - 1].quantity ?? null;

      const hrvSamples = await q('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { from: range.startTime, to: range.endTime });
      const hrvArr = Array.isArray(hrvSamples) ? hrvSamples : hrvSamples?.samples ?? [];
      if (hrvArr.length) hrv = hrvArr[hrvArr.length - 1].quantity ?? null;
    }
  } catch { /* ignore */ }

  if (steps === null && restingHeartRate === null && hrv === null && sleepHours === null) return null;
  return { steps, restingHeartRate, hrv, sleepHours };
}

/** Convert sleep hours → the existing 1-5 self-report scale used by recovery. */
export function sleepHoursToScore(hours: number): 1 | 2 | 3 | 4 | 5 {
  if (hours < 4) return 1;
  if (hours < 5.5) return 2;
  if (hours < 6.5) return 3;
  if (hours < 7.5) return 4;
  return 5;
}
