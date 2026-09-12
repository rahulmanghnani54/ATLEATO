/**
 * Tutorial memory — has this lifter already been shown the technique for an
 * exercise, and did they take it in?
 *
 * Two screens read it:
 *   - `/technique` decides between the full walkthrough (video + key points +
 *     camera setup) and the two-tap fast path for someone who has been here.
 *   - Form Check decides whether a fault repeating across a set is worth
 *     interrupting the set to send them back to the walkthrough.
 *
 * Keyed by `ExerciseForm.id` (a stable slug), never by the display name — a
 * rename must not make every lifter a first-timer again.
 *
 * Device-scoped in AsyncStorage like every other preference, under ONE versioned
 * key holding one JSON document. Read once into a module cache so `getEntry` is
 * synchronous (Form Check consults it from inside the per-rep callback, which
 * must not await). Rules, because this sits between a user and their workout:
 *   - Nothing here throws. A corrupt or foreign payload reads as "never seen".
 *   - Writes never wait on storage to report back: the cache advances first,
 *     the write is best-effort, and callers get the new entry either way.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TUTORIAL_MEMORY_KEY = 'tutorial_memory:v1';

export interface TutorialMemoryEntry {
  /** Full plays of the walkthrough (or CONTINUE past the poster when no clip exists). */
  watched: number;
  /** "I know this — skip" taps. */
  skipped: number;
  /** Last time the walkthrough was watched or skipped. 0 = never. */
  lastSeenAt: number;
  /** Explicit "mark as known" toggle — the lifter's word overrides the counts. */
  knowsIt: boolean;
  /** Camera-setup step has been shown once; it is not repeated on the fast path. */
  setupSeen: boolean;
  /** Last time Form Check interrupted a set to suggest the walkthrough. */
  lastRetriggerAt?: number;
}

/** `ExerciseForm.id` → entry. */
export type TutorialMemory = Record<string, TutorialMemoryEntry>;

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

let cache: TutorialMemory = {};
let cacheLoaded = false;
// Two callers hydrating at once (the screen's hook and a direct `recordX`) must
// share ONE read, or the slower read lands after the first write and rolls the
// cache back to the pre-write payload.
let inflight: Promise<void> | null = null;

const EMPTY_ENTRY: TutorialMemoryEntry = {
  watched: 0,
  skipped: 0,
  lastSeenAt: 0,
  knowsIt: false,
  setupSeen: false,
};

/** Non-negative whole count, or `fallback` for anything that is not a number. */
function toCount(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

/** Coerce one stored entry; null when it is not an object at all. */
function coerceEntry(raw: unknown): TutorialMemoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const entry: TutorialMemoryEntry = {
    watched: toCount(r.watched, 0),
    skipped: toCount(r.skipped, 0),
    lastSeenAt: toCount(r.lastSeenAt, 0),
    // Strict equality: a truthy string ("yes") is a bug upstream, not a fact.
    knowsIt: r.knowsIt === true,
    setupSeen: r.setupSeen === true,
  };
  // Optional field stays absent unless it is a real timestamp, so an entry that
  // never re-triggered round-trips byte-for-byte.
  if (typeof r.lastRetriggerAt === 'number' && Number.isFinite(r.lastRetriggerAt)) {
    entry.lastRetriggerAt = Math.max(0, Math.trunc(r.lastRetriggerAt));
  }
  return entry;
}

/** Coerce a parsed payload into a TutorialMemory, dropping anything unusable. */
function coerce(raw: unknown): TutorialMemory {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TutorialMemory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = coerceEntry(value);
    if (entry) out[key] = entry;
  }
  return out;
}

async function ensureLoaded(): Promise<void> {
  if (cacheLoaded) return;
  if (!inflight) {
    inflight = (async () => {
      let next: TutorialMemory = {};
      try {
        const raw = await AsyncStorage.getItem(TUTORIAL_MEMORY_KEY);
        if (raw) next = coerce(JSON.parse(raw));
      } catch {
        // Unreadable or unparseable — "never seen" is the safe default; the next
        // write replaces the bad payload wholesale.
        next = {};
      }
      cache = next;
      cacheLoaded = true;
      inflight = null;
    })();
  }
  await inflight;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_MEMORY_KEY, JSON.stringify(cache));
  } catch {
    // Storage full / serialisation failure — the cache already holds the new
    // state, so this session behaves correctly; only the next launch forgets.
  }
}

/**
 * Apply `patch` to the entry for `key`, persist, return the new entry.
 *
 * The entry is REPLACED, not mutated in place: callers hold the previous object
 * in React state, and a same-reference update would not re-render.
 */
async function write(
  key: string,
  patch: (prev: TutorialMemoryEntry) => TutorialMemoryEntry,
): Promise<TutorialMemoryEntry> {
  await ensureLoaded();
  const next = patch(cache[key] ?? EMPTY_ENTRY);
  cache[key] = next;
  await persist();
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hydrate the cache (first call reads storage; later calls are free) and return
 * a snapshot. Never rejects — anything unreadable resolves to `{}`.
 */
export async function loadTutorialMemory(): Promise<TutorialMemory> {
  await ensureLoaded();
  return { ...cache };
}

/**
 * Synchronous read from the cache. `null` for an exercise never seen — and for
 * EVERYTHING before `loadTutorialMemory()` has resolved, so screens must gate
 * on `loaded` rather than treat null as "first time".
 */
export function getEntry(key: string): TutorialMemoryEntry | null {
  return cache[key] ?? null;
}

export function recordWatched(key: string): Promise<TutorialMemoryEntry> {
  return write(key, (e) => ({ ...e, watched: e.watched + 1, lastSeenAt: Date.now() }));
}

export function recordSkipped(key: string): Promise<TutorialMemoryEntry> {
  return write(key, (e) => ({ ...e, skipped: e.skipped + 1, lastSeenAt: Date.now() }));
}

export function markKnown(key: string, knowsIt: boolean): Promise<TutorialMemoryEntry> {
  return write(key, (e) => ({ ...e, knowsIt }));
}

export function markSetupSeen(key: string): Promise<TutorialMemoryEntry> {
  return write(key, (e) => ({ ...e, setupSeen: true }));
}

export function recordRetrigger(key: string, now: number = Date.now()): Promise<TutorialMemoryEntry> {
  return write(key, (e) => ({ ...e, lastRetriggerAt: now }));
}

/** Test seam: forget the cache so the next call re-reads storage. */
export function _resetTutorialMemoryForTests(): void {
  cache = {};
  cacheLoaded = false;
  inflight = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — pure rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skip straight to "START FORM CHECK"? One full watch is proof enough; a single
 * skip is not (people skip by reflex, then wish they hadn't), two skips is a
 * clear signal; and the lifter's own "I know this" always wins.
 */
export function shouldShowFastPath(e: TutorialMemoryEntry | null): boolean {
  return !!e && (e.knowsIt || e.watched >= 1 || e.skipped >= 2);
}

/** Minimum gap between two set-interrupting prompts for the same exercise. */
export const RETRIGGER_COOLDOWN_MS = 10 * 60 * 1000;

/** How many recent reps the rule looks at, and how many of them must agree. */
const RETRIGGER_WINDOW = 4;
const RETRIGGER_MIN_HITS = 3;

/**
 * Should Form Check pause the set and offer the walkthrough?
 *
 * `recentReps` is the check-id set of each of the last ≤4 completed reps,
 * oldest first (a rep's array may repeat an id; it counts once). Fires for a
 * check id present in ≥3 of the last 4 reps — one bad rep is noise, three of
 * four is a pattern — provided at least 3 reps exist, nothing has been prompted
 * this set, and this exercise has not prompted inside RETRIGGER_COOLDOWN_MS.
 * Ties: most occurrences, then the id seen first.
 */
export function shouldRetrigger(
  recentReps: ReadonlyArray<ReadonlyArray<string>>,
  entry: TutorialMemoryEntry | null,
  now: number,
  promptedThisSet: boolean,
): { checkId: string } | null {
  if (promptedThisSet) return null;
  // `-Infinity` when never prompted: `now - (-Infinity)` is Infinity, never < cooldown.
  if (now - (entry?.lastRetriggerAt ?? -Infinity) < RETRIGGER_COOLDOWN_MS) return null;

  const window = recentReps.slice(-RETRIGGER_WINDOW);
  if (window.length < RETRIGGER_MIN_HITS) return null;

  // Map keeps insertion order, which IS first-seen order — the tie-break.
  const hits = new Map<string, number>();
  for (const rep of window) {
    for (const id of new Set(rep)) hits.set(id, (hits.get(id) ?? 0) + 1);
  }

  let best: { checkId: string; count: number } | null = null;
  for (const [checkId, count] of hits) {
    if (count < RETRIGGER_MIN_HITS) continue;
    // Strictly greater, so an equal count keeps the earlier id.
    if (!best || count > best.count) best = { checkId, count };
  }
  return best ? { checkId: best.checkId } : null;
}
