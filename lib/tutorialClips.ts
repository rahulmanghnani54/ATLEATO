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
 * This module reads the project URL from the build-time env directly rather
 * than importing `lib/supabase`: the clip path must stay reachable from a
 * presentational component without dragging the auth client along with it.
 */
import * as FileSystem from 'expo-file-system/legacy';

export const TUTORIAL_BUCKET = 'tutorial-clips';

/** Folder under the cache directory that holds every downloaded clip. */
const CACHE_FOLDER = `${TUTORIAL_BUCKET}/`;

/**
 * Long enough for ~2 MB on a poor cellular link, short enough that the user
 * is not staring at a shimmer — the poster is a complete fallback, so giving
 * up is cheap.
 */
const DEFAULT_TIMEOUT_MS = 8000;

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
 * Rejects when the project URL is not configured, when storage answers with
 * anything but 200 (a missing object comes back as a 404 JSON body, which
 * `downloadAsync` writes to disk as if it were the video), or when the
 * download outlives the timeout. On every failure the destination is removed
 * so a truncated or bogus file can never masquerade as a cache hit.
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

  // A process killed mid-download leaves a truncated file at the final path,
  // so `exists` alone is not a hit — an empty file is re-fetched.
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists && info.size > 0) return dest;

  // `intermediates` also makes this a no-op when the folder is already there.
  await FileSystem.makeDirectoryAsync(`${cacheDir}${CACHE_FOLDER}`, { intermediates: true });

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('tutorial clip: download timed out')), timeoutMs);
  });

  try {
    const res = await Promise.race([
      FileSystem.downloadAsync(clipPublicUrl(supabaseUrl, objectPath), dest),
      timeout,
    ]);
    if (res.status !== 200) throw new Error(`tutorial clip: HTTP ${res.status}`);
    return dest;
  } catch (e) {
    // Best effort: the failure being reported is the download, not the cleanup.
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
