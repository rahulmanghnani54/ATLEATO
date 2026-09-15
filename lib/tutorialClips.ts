/**
 * Tutorial clips — remote, download-once, placeholder-first.
 *
 * Clips are 10–12 s looping mp4s in the public `tutorial-clips` bucket. They
 * are fetched with `downloadAsync` into the cache directory and played from
 * the local file, never streamed: expo-av's ExoPlayer has no cache and its
 * repeat mode re-fetches from byte 0, so a 2 MB clip looping every 12 s would
 * cost ~10 MB/min on cellular. One fetch per exercise per device also gives
 * offline replay and a hitch-free loop.
 *
 * Object names carry the content version (`bench_press_v1.mp4`) because public
 * objects are CDN-cached — overwriting in place serves stale bytes.
 *
 * The cache path doubles as the hit test, so it is only ever written by a
 * rename after a complete 200 body is on disk — see `ensureClipCached`.
 *
 * This module reads the project URL from the build-time env directly rather
 * than importing `lib/supabase`: the clip path must stay reachable from a
 * presentational component without dragging the auth client along with it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export const TUTORIAL_BUCKET = 'tutorial-clips';

/**
 * Clips are looked up BY CONVENTION (`<form.id>_v1.mp4`), not from a list in
 * the app, so uploading a file to the bucket is all it takes to light an
 * exercise up — no release. The price of that is a probe for exercises that
 * have no clip yet, which today is all of them. A 404 is cheap, but not on
 * every open of every exercise: the answer is remembered here for
 * MISSING_TTL_MS, in memory and on disk, so a card opens straight to its
 * poster. The TTL is the longest a freshly uploaded clip can take to appear.
 */
const MISSING_KEY = 'tutorial_clips:missing:v1';
export const MISSING_TTL_MS = 60 * 60 * 1000;
export const CLIP_MISSING_MESSAGE = 'tutorial clip: not in bucket';

let missing: Record<string, number> | null = null;
let missingLoad: Promise<Record<string, number>> | null = null;

function loadMissing(): Promise<Record<string, number>> {
  if (missing) return Promise.resolve(missing);
  if (!missingLoad) {
    missingLoad = AsyncStorage.getItem(MISSING_KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const out: Record<string, number> = {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
          }
        }
        return out;
      })
      .catch(() => ({}))
      .then((out) => {
        missing = out;
        return out;
      });
  }
  return missingLoad;
}

function persistMissing(): void {
  if (!missing) return;
  AsyncStorage.setItem(MISSING_KEY, JSON.stringify(missing)).catch(() => {});
}

/** The HTTP statuses that mean "no such object" on this endpoint (see the call site). */
export function isMissingStatus(status: number): boolean {
  return status === 404 || status === 400;
}

/** True while a recent 404 for this object is on record. */
export async function isClipKnownMissing(objectPath: string, now: number = Date.now()): Promise<boolean> {
  const map = await loadMissing();
  const at = map[objectPath];
  if (at === undefined) return false;
  if (now - at < MISSING_TTL_MS) return true;
  delete map[objectPath];
  persistMissing();
  return false;
}

async function markClipMissing(objectPath: string, now: number = Date.now()): Promise<void> {
  const map = await loadMissing();
  map[objectPath] = now;
  persistMissing();
}

async function clearClipMissing(objectPath: string): Promise<void> {
  const map = await loadMissing();
  if (objectPath in map) {
    delete map[objectPath];
    persistMissing();
  }
}

/** Test seam: forget every remembered 404 and the loaded state. */
export function _resetClipMissingForTests(): void {
  missing = null;
  missingLoad = null;
}

/**
 * Which VERSION of a clip to ask for comes from a manifest in the same bucket,
 * so replacing a clip (say, an illustrated placeholder with licensed footage)
 * is an upload of `<id>_v2.mp4` plus a one-line manifest edit — no release.
 *
 *   manifest.json  →  {"version":1,"clips":{"bench_press":2,"squat":1}}
 *
 * The manifest can only move a clip FORWARD: the resolved version is the
 * larger of the manifest's number and the one compiled into the app
 * (`resolveClipVersion`). An app that ships knowing about v3 never asks for
 * v2 because a stale CDN copy of the manifest still says so, and a manifest
 * that goes missing or unparseable simply leaves every clip where the code
 * put it. A public object like any other, the manifest is CDN-cached too,
 * which is another reason to remember it for MANIFEST_TTL_MS rather than
 * fetch it on every open: within that window the CDN would answer the same
 * bytes anyway. Same memory + AsyncStorage shape as the 404 record above.
 *
 * `loadClipManifest` never throws. Anything short of a 200 with a parseable
 * body returns the last good copy (however old) or `{}` — the caller's
 * fallback version is always a valid answer.
 */
export const CLIP_MANIFEST_OBJECT = 'manifest.json';
export const MANIFEST_TTL_MS = 60 * 60 * 1000;
const MANIFEST_KEY = 'tutorial_clips:manifest:v1';
/** Shorter than the clip download's: nothing waits behind a slow manifest but the poster. */
const MANIFEST_TIMEOUT_MS = 4000;

type ClipManifest = { fetchedAt: number; clips: Record<string, number> };

let manifest: ClipManifest | null = null;
let manifestLoad: Promise<ClipManifest | null> | null = null;
/** The one network fetch in flight, shared by overlapping callers (StrictMode, two players). */
let manifestFetch: Promise<Record<string, number>> | null = null;

/** Keeps only `<string>: <integer ≥ 1>` pairs; everything else in the body is noise. */
function coerceClipVersions(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) out[k] = v;
  }
  return out;
}

/** The on-disk copy, read once per process; `null` when absent or unreadable. */
function loadStoredManifest(): Promise<ClipManifest | null> {
  if (manifest) return Promise.resolve(manifest);
  if (!manifestLoad) {
    manifestLoad = AsyncStorage.getItem(MANIFEST_KEY)
      .then((raw): ClipManifest | null => {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const { fetchedAt, clips } = parsed as Record<string, unknown>;
        if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null;
        return { fetchedAt, clips: coerceClipVersions(clips) };
      })
      .catch(() => null)
      .then((stored) => {
        // A fetch that finished while the disk read was pending wins.
        if (stored && !manifest) manifest = stored;
        return manifest;
      });
  }
  return manifestLoad;
}

function persistManifest(): void {
  if (!manifest) return;
  AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest)).catch(() => {});
}

/**
 * `{ "<form.id>": <version> }` from the bucket's manifest. Fresh cache → no
 * network. Stale or absent → one fetch with a timeout; on ANY failure the
 * stale copy (if any) or `{}`. Never rejects.
 */
export async function loadClipManifest(opts?: {
  timeoutMs?: number;
  now?: number;
}): Promise<Record<string, number>> {
  const now = opts?.now ?? Date.now();
  const cached = await loadStoredManifest();
  if (cached) {
    const age = now - cached.fetchedAt;
    if (age >= 0 && age < MANIFEST_TTL_MS) return cached.clips;
  }
  const stale = cached?.clips ?? {};

  if (!manifestFetch) {
    manifestFetch = fetchManifest(opts?.timeoutMs ?? MANIFEST_TIMEOUT_MS)
      .then((clips) => {
        if (clips === null) return stale;
        manifest = { fetchedAt: now, clips };
        persistManifest();
        return clips;
      })
      .finally(() => {
        manifestFetch = null;
      });
  }
  return manifestFetch;
}

/** One attempt at the network; `null` for every way it can go wrong. */
async function fetchManifest(timeoutMs: number): Promise<Record<string, number> | null> {
  // Literal member access on purpose — see `ensureClipCached`.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(clipPublicUrl(supabaseUrl, CLIP_MANIFEST_OBJECT), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (res.status !== 200) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return coerceClipVersions((body as Record<string, unknown>).clips);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The version of `formId` to ask the bucket for: the manifest's, unless the
 * app already knows a newer one. Forward only — the manifest can never send
 * a device back to an older object than the code was built with.
 */
export async function resolveClipVersion(formId: string, fallback: number): Promise<number> {
  const clips = await loadClipManifest();
  return Math.max(clips[formId] ?? 0, fallback);
}

/** Test seam: forget the manifest, its disk read and any fetch in flight. */
export function _resetClipManifestForTests(): void {
  manifest = null;
  manifestLoad = null;
  manifestFetch = null;
}

/** Folder under the cache directory that holds every downloaded clip. */
const CACHE_FOLDER = `${TUTORIAL_BUCKET}/`;

/**
 * Long enough for ~2 MB on a poor cellular link, short enough that the user
 * is not staring at a shimmer — the poster is a complete fallback, so giving
 * up is cheap.
 */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Per-process counter folded into every temp file name. Two calls in the same
 * millisecond (StrictMode's double effect, a fast remount) must not share a
 * download target: on Android the second `downloadAsync` would unlink the
 * first's file mid-write and the first's promote would then rename the
 * second's half-written body into place.
 */
let tempSeq = 0;

/** `bench_press_v1.mp4` — the object name inside the bucket. */
export function clipObjectPath(formId: string, version: number): string {
  return `${formId}_v${version}.mp4`;
}

/** Public read URL for an object in the tutorial bucket (no auth, no signing). */
export function clipPublicUrl(supabaseUrl: string, objectPath: string): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${TUTORIAL_BUCKET}/${objectPath}`;
}

/** Where a downloaded object lives locally. The caller creates the folder. */
export function clipCachePath(cacheDir: string, objectPath: string): string {
  return `${cacheDir}${CACHE_FOLDER}${objectPath}`;
}

/**
 * Resolves to a `file://` uri for the clip, downloading it on first use.
 *
 * A file at the cache path is the hit test, so nothing may write there until
 * the bytes are known to be good. `downloadAsync` cannot promise that: on
 * Android it deletes its target and streams the body straight into it in
 * 8 KiB segments, so the target exists — non-empty — for the whole transfer,
 * and it lands a 404 JSON body there just as readily as a video. Downloading
 * to the final name would therefore turn an overlapping second call, a
 * process killed mid-transfer, or a timeout followed by a late 404 into a
 * permanent hit that the decoder can never play.
 *
 * So each call downloads to its own `*.part` name and promotes it with a
 * rename only after a 200 is confirmed. The rename (`File.renameTo` on
 * Android, remove-then-move on iOS) takes the cache path from absent to a
 * complete body in one step and replaces an existing complete file cleanly,
 * which is what two overlapping calls that both succeed end up doing.
 *
 * Rejects when the project URL is not configured, when storage answers with
 * anything but 200, when the promote fails, or when the download outlives the
 * timeout. The timeout only decides what the CALLER hears; it never touches
 * the file system. `downloadAsync` creates its target from inside the response
 * callback on Android and moves its own temp into place on completion on iOS,
 * so a delete fired by the timer while the request is still waiting on
 * headers — the usual slow-link case — would run before the `.part` file
 * exists and orphan it. The outcome is therefore chained onto the download
 * itself, the one party that knows when the temp file is real: a 200 promotes,
 * anything else removes the temp file (best effort), and both happen whether
 * or not the caller has already given up. A late 200 warms the cache for the
 * next visit at no extra cost; a late 404 still leaves nothing behind. The
 * cache path is never written by anything but the promote.
 */
export async function ensureClipCached(
  objectPath: string,
  opts?: { timeoutMs?: number },
): Promise<string> {
  // Literal member access on purpose: babel-preset-expo inlines
  // `process.env.EXPO_PUBLIC_*` at build time only when written this way.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('tutorial clip: EXPO_PUBLIC_SUPABASE_URL is not set');

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('tutorial clip: no cache directory on this platform');

  const dest = clipCachePath(cacheDir, objectPath);

  // Only the promote below ever creates this file, so existence alone means
  // "a complete 200 body". A file the decoder still rejects is removed by
  // `evictClip` so the next visit re-downloads rather than failing forever.
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;

  // A recent 404 is an answer, not a failure to retry on every open.
  if (await isClipKnownMissing(objectPath)) throw new Error(CLIP_MISSING_MESSAGE);

  // `intermediates` also makes this a no-op when the folder is already there.
  await FileSystem.makeDirectoryAsync(`${cacheDir}${CACHE_FOLDER}`, { intermediates: true });

  const tmp = `${dest}.${Date.now().toString(36)}-${(tempSeq++).toString(36)}.part`;

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('tutorial clip: download timed out')), timeoutMs);
  });

  // Promote-or-clean rides on the download, not on the timer (see above), so
  // it runs when the native side knows what the temp file holds — including
  // after the caller has stopped listening.
  const settled = FileSystem.downloadAsync(clipPublicUrl(supabaseUrl, objectPath), tmp)
    .then(async (res) => {
      if (res.status !== 200) {
        // Only "not there" is worth remembering. A 5xx or a captive portal is
        // transient; treating it as missing would hide a clip for an hour.
        // Supabase Storage answers a missing PUBLIC object with HTTP 400 and a
        // JSON body whose statusCode is "404" (verified against the live
        // bucket) — so 400 is "not there" here as much as 404 is.
        if (isMissingStatus(res.status)) void markClipMissing(objectPath);
        throw new Error(`tutorial clip: HTTP ${res.status}`);
      }
      await FileSystem.moveAsync({ from: tmp, to: dest });
      void clearClipMissing(objectPath);
      return dest;
    })
    .catch(async (e: unknown) => {
      // Best effort: the failure being reported is the download, not the cleanup.
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      throw e;
    });
  // A failure that lands after the timeout was already reported has nobody
  // left to hear it; keep it from surfacing as an unhandled rejection.
  settled.catch(() => {});

  try {
    return await Promise.race([settled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drops a cached clip so the next `ensureClipCached` fetches it again. For
 * the player's decoder-error path: the file made it through the 200 check
 * and the promote, yet will not play, and without this it would be served as
 * a hit on every visit until the OS evicts the cache. Never throws — a failed
 * eviction is the same to the caller as no cache at all.
 */
export async function evictClip(objectPath: string): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return;
  await FileSystem.deleteAsync(clipCachePath(cacheDir, objectPath), { idempotent: true }).catch(
    () => {},
  );
}
