/**
 * Tutorial memory decides whether a lifter sees the technique walkthrough or
 * gets the two-tap fast path, and whether Form Check interrupts a set to send
 * them back to it. Get the thresholds wrong in one direction and every session
 * starts with a video they have watched five times; wrong in the other and a
 * first-timer is dropped straight in front of the camera. Both are pinned here,
 * along with the storage round-trip, because a corrupt payload must degrade to
 * "never seen" — not to a crash on the way into a workout.
 */

// The official AsyncStorage jest mock: an in-memory map behind the real API
// surface, so the module's own read/write/coerce path runs unmodified.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TUTORIAL_MEMORY_KEY,
  RETRIGGER_COOLDOWN_MS,
  loadTutorialMemory,
  getEntry,
  recordWatched,
  recordSkipped,
  markKnown,
  markSetupSeen,
  recordRetrigger,
  shouldShowFastPath,
  shouldRetrigger,
  _resetTutorialMemoryForTests,
  type TutorialMemoryEntry,
} from '@/lib/tutorialMemory';

const KEY = 'bench_press';

function entry(patch: Partial<TutorialMemoryEntry> = {}): TutorialMemoryEntry {
  return { watched: 0, skipped: 0, lastSeenAt: 0, knowsIt: false, setupSeen: false, ...patch };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetTutorialMemoryForTests();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Storage round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('storage round-trip', () => {
  it('starts empty and getEntry is null before anything is loaded', async () => {
    expect(getEntry(KEY)).toBeNull();
    expect(await loadTutorialMemory()).toEqual({});
    expect(getEntry(KEY)).toBeNull();
  });

  it('persists every write and reads it back through a cold cache', async () => {
    await recordWatched(KEY);
    await recordWatched(KEY);
    await recordSkipped(KEY);
    await markKnown(KEY, true);
    await markSetupSeen(KEY);
    await recordRetrigger(KEY, 123_456);

    // Same process, warm cache.
    const warm = getEntry(KEY);
    expect(warm).toMatchObject({ watched: 2, skipped: 1, knowsIt: true, setupSeen: true, lastRetriggerAt: 123_456 });
    expect(warm!.lastSeenAt).toBeGreaterThan(0);

    // "Next launch": drop the cache, read from storage.
    _resetTutorialMemoryForTests();
    expect(getEntry(KEY)).toBeNull();
    const mem = await loadTutorialMemory();
    expect(mem[KEY]).toEqual(warm);
    expect(getEntry(KEY)).toEqual(warm);

    // And it lives under the versioned key, as one JSON document.
    const raw = await AsyncStorage.getItem(TUTORIAL_MEMORY_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)[KEY]).toEqual(warm);
  });

  it('keeps entries for different exercises apart', async () => {
    await recordWatched('bench_press');
    await recordSkipped('barbell_squat');
    expect(getEntry('bench_press')).toMatchObject({ watched: 1, skipped: 0 });
    expect(getEntry('barbell_squat')).toMatchObject({ watched: 0, skipped: 1 });
  });

  it('each write returns a fresh entry object (so React state updates re-render)', async () => {
    const a = await recordWatched(KEY);
    const b = await recordWatched(KEY);
    expect(a).not.toBe(b);
    expect(a.watched).toBe(1);
    expect(b.watched).toBe(2);
  });

  it('markKnown(false) unsets a previous markKnown(true)', async () => {
    await markKnown(KEY, true);
    expect(getEntry(KEY)!.knowsIt).toBe(true);
    await markKnown(KEY, false);
    expect(getEntry(KEY)!.knowsIt).toBe(false);
  });

  it('recordRetrigger defaults `now` to the wall clock', async () => {
    const before = Date.now();
    const e = await recordRetrigger(KEY);
    expect(e.lastRetriggerAt).toBeGreaterThanOrEqual(before);
    expect(e.lastRetriggerAt).toBeLessThanOrEqual(Date.now());
  });

  it('a failed setItem never reaches the caller and the cache still advances', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(recordWatched(KEY)).resolves.toMatchObject({ watched: 1 });
    expect(getEntry(KEY)!.watched).toBe(1);
  });

  it('a failed getItem loads as empty rather than throwing', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('io'));
    await expect(loadTutorialMemory()).resolves.toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Corrupt / foreign payloads
// ─────────────────────────────────────────────────────────────────────────────

describe('corrupt payloads', () => {
  it('unparseable JSON loads as {}', async () => {
    await AsyncStorage.setItem(TUTORIAL_MEMORY_KEY, '{"bench_press": {watched: 1');
    expect(await loadTutorialMemory()).toEqual({});
  });

  it.each([
    ['a string', '"hello"'],
    ['a number', '42'],
    ['null', 'null'],
    ['an array', '[{"watched":1}]'],
  ])('a JSON payload that is %s loads as {}', async (_label, raw) => {
    await AsyncStorage.setItem(TUTORIAL_MEMORY_KEY, raw);
    expect(await loadTutorialMemory()).toEqual({});
  });

  it('coerces malformed fields to safe defaults and drops non-object entries', async () => {
    await AsyncStorage.setItem(
      TUTORIAL_MEMORY_KEY,
      JSON.stringify({
        bench_press: { watched: '3', skipped: 'lots', lastSeenAt: null, knowsIt: 'yes', setupSeen: true, lastRetriggerAt: 'never' },
        barbell_squat: 'seen',
        deadlift: null,
        pullup: { watched: -2, skipped: 1.7, knowsIt: true },
      }),
    );
    const mem = await loadTutorialMemory();
    expect(Object.keys(mem).sort()).toEqual(['bench_press', 'pullup']);
    // '3' is a number in disguise; 'lots' and 'never' are not. Booleans must be
    // real booleans — a truthy string is not consent.
    expect(mem.bench_press).toEqual(entry({ watched: 3, skipped: 0, lastSeenAt: 0, knowsIt: false, setupSeen: true }));
    expect('lastRetriggerAt' in mem.bench_press).toBe(false);
    // Counts are non-negative integers.
    expect(mem.pullup).toEqual(entry({ watched: 0, skipped: 1, knowsIt: true }));
  });

  it('a corrupt payload is replaced on the next write, not merged with', async () => {
    await AsyncStorage.setItem(TUTORIAL_MEMORY_KEY, 'not json');
    await recordWatched(KEY);
    _resetTutorialMemoryForTests();
    const mem = await loadTutorialMemory();
    expect(Object.keys(mem)).toEqual([KEY]);
    expect(mem[KEY].watched).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fast path
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldShowFastPath', () => {
  it('never for an exercise with no memory', () => {
    expect(shouldShowFastPath(null)).toBe(false);
    expect(shouldShowFastPath(entry())).toBe(false);
  });

  it('knowsIt alone is enough', () => {
    expect(shouldShowFastPath(entry({ knowsIt: true }))).toBe(true);
  });

  it('one full watch is enough', () => {
    expect(shouldShowFastPath(entry({ watched: 1 }))).toBe(true);
  });

  it('one skip is not enough; two are', () => {
    expect(shouldShowFastPath(entry({ skipped: 1 }))).toBe(false);
    expect(shouldShowFastPath(entry({ skipped: 2 }))).toBe(true);
  });

  it('setupSeen on its own does not unlock the fast path', () => {
    expect(shouldShowFastPath(entry({ setupSeen: true }))).toBe(false);
  });

  it('follows the live cache after writes', async () => {
    expect(shouldShowFastPath(getEntry(KEY))).toBe(false);
    await recordSkipped(KEY);
    expect(shouldShowFastPath(getEntry(KEY))).toBe(false);
    await recordSkipped(KEY);
    expect(shouldShowFastPath(getEntry(KEY))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Smart re-trigger
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldRetrigger', () => {
  const NOW = 1_700_000_000_000;
  const FLARE = 'press.elbow_flare';
  const WRIST = 'press.wrist_stack';

  it('fires when a check id shows up in 3 of the last 4 reps', () => {
    const reps = [[FLARE], [], [FLARE, WRIST], [FLARE]];
    expect(shouldRetrigger(reps, null, NOW, false)).toEqual({ checkId: FLARE });
  });

  it('fires on 3 reps that all carry the id (3 of 3)', () => {
    const reps = [[FLARE], [FLARE], [FLARE]];
    expect(shouldRetrigger(reps, null, NOW, false)).toEqual({ checkId: FLARE });
  });

  it('does not fire on 2 of 4', () => {
    const reps = [[FLARE], [], [WRIST], [FLARE]];
    expect(shouldRetrigger(reps, null, NOW, false)).toBeNull();
  });

  it('does not fire with only 2 reps banked, even if both are flawed', () => {
    expect(shouldRetrigger([[FLARE], [FLARE]], null, NOW, false)).toBeNull();
    expect(shouldRetrigger([], null, NOW, false)).toBeNull();
  });

  it('only the last 4 reps count', () => {
    // Rep 1 is flawed but has scrolled out of the window: last 4 hold only 2 hits.
    const reps = [[FLARE], [], [FLARE], [FLARE], []];
    expect(shouldRetrigger(reps, null, NOW, false)).toBeNull();
    // One more flawed rep slides the window to 3 of 4.
    expect(shouldRetrigger([...reps, [FLARE]], null, NOW, false)).toEqual({ checkId: FLARE });
  });

  it('a duplicated id inside one rep counts once', () => {
    const reps = [[FLARE, FLARE, FLARE], [], [FLARE], []];
    expect(shouldRetrigger(reps, null, NOW, false)).toBeNull();
  });

  it('is blocked once a prompt has already been shown this set', () => {
    const reps = [[FLARE], [FLARE], [FLARE], [FLARE]];
    expect(shouldRetrigger(reps, null, NOW, true)).toBeNull();
  });

  it('is blocked inside the per-exercise cooldown and free after it', () => {
    const reps = [[FLARE], [FLARE], [FLARE], [FLARE]];
    const recent = entry({ lastRetriggerAt: NOW - RETRIGGER_COOLDOWN_MS + 1 });
    expect(shouldRetrigger(reps, recent, NOW, false)).toBeNull();
    const boundary = entry({ lastRetriggerAt: NOW - RETRIGGER_COOLDOWN_MS });
    expect(shouldRetrigger(reps, boundary, NOW, false)).toEqual({ checkId: FLARE });
    const old = entry({ lastRetriggerAt: NOW - RETRIGGER_COOLDOWN_MS - 60_000 });
    expect(shouldRetrigger(reps, old, NOW, false)).toEqual({ checkId: FLARE });
  });

  it('an entry that has never re-triggered does not block', () => {
    const reps = [[FLARE], [FLARE], [FLARE], [FLARE]];
    expect(shouldRetrigger(reps, entry({ watched: 3 }), NOW, false)).toEqual({ checkId: FLARE });
  });

  it('cooldown is 10 minutes', () => {
    expect(RETRIGGER_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });

  it('tie-break: most occurrences wins', () => {
    // WRIST in 4 of 4, FLARE in 3 of 4 — FLARE was seen first but WRIST is worse.
    const reps = [[FLARE, WRIST], [WRIST], [FLARE, WRIST], [FLARE, WRIST]];
    expect(shouldRetrigger(reps, null, NOW, false)).toEqual({ checkId: WRIST });
  });

  it('tie-break: equal occurrences → the id seen first', () => {
    const reps = [[WRIST, FLARE], [FLARE, WRIST], [], [WRIST, FLARE]];
    expect(shouldRetrigger(reps, null, NOW, false)).toEqual({ checkId: WRIST });
    const flipped = [[FLARE, WRIST], [WRIST, FLARE], [], [WRIST, FLARE]];
    expect(shouldRetrigger(flipped, null, NOW, false)).toEqual({ checkId: FLARE });
  });

  it('does not mutate the rep arrays it is given', () => {
    const reps = [[FLARE], [FLARE], [FLARE]];
    const snapshot = JSON.stringify(reps);
    shouldRetrigger(reps, null, NOW, false);
    expect(JSON.stringify(reps)).toBe(snapshot);
  });
});
