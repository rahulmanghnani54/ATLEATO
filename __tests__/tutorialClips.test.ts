/**
 * Tutorial clips live in a public bucket and are downloaded ONCE per device.
 * The pure helpers decide where a clip lives (remote URL, local cache path);
 * `ensureClipCached` decides whether a download happens at all. A wrong path
 * or a swallowed failure does not crash anything — it silently means "the
 * clip never plays and the poster shows forever", which is why both halves
 * are pinned here.
 *
 * The cache path is the hit test, so the invariant under test is: nothing
 * but a rename of a confirmed-200 body ever creates a file there. Every
 * failure path is checked for touching the TEMP name and never the cache
 * path.
 */

// expo-file-system is a device boundary. Jest maps every `expo-*` import to an
// empty stub, so the legacy API is replaced with spies the tests drive directly.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CLIP_MISSING_MESSAGE,
  MISSING_TTL_MS,
  TUTORIAL_BUCKET,
  _resetClipMissingForTests,
  clipCachePath,
  clipObjectPath,
  clipPublicUrl,
  ensureClipCached,
  evictClip,
  isClipKnownMissing,
} from '@/lib/tutorialClips';

const getInfoAsync = jest.mocked(FileSystem.getInfoAsync);
const makeDirectoryAsync = jest.mocked(FileSystem.makeDirectoryAsync);
const downloadAsync = jest.mocked(FileSystem.downloadAsync);
const moveAsync = jest.mocked(FileSystem.moveAsync);
const deleteAsync = jest.mocked(FileSystem.deleteAsync);

const SUPABASE_URL = 'https://abc.supabase.co';
const OBJECT = 'bench_press_v1.mp4';
const CACHED = 'file:///cache/tutorial-clips/bench_press_v1.mp4';
/** A per-call temp name beside the cache path: `<cached>.<time>-<seq>.part`. */
const TEMP = /^file:\/\/\/cache\/tutorial-clips\/bench_press_v1\.mp4\.[0-9a-z]+-[0-9a-z]+\.part$/;

/** The temp path the n-th download in this test was pointed at. */
function tempPathOf(call = 0): string {
  const target = downloadAsync.mock.calls[call]?.[1];
  if (typeof target !== 'string') throw new Error(`no downloadAsync call #${call}`);
  return target;
}

/**
 * A download whose outcome the test decides — typically after the caller has
 * already timed out and moved on. Only resolution is offered: `downloadAsync`
 * resolves for every HTTP status, so a rejection would model a transport
 * failure, which the non-200 path already covers.
 */
function deferredDownload() {
  let resolve!: (result: FileSystem.FileSystemDownloadResult) => void;
  downloadAsync.mockReturnValue(
    new Promise<FileSystem.FileSystemDownloadResult>((res) => {
      resolve = res;
    }),
  );
  return { resolve };
}

/**
 * Lets the download's own then/catch chain run after the test settles it. A
 * macrotask, not a microtask, so the assertion also sits past the point where
 * Node would have reported an unhandled rejection — which jest-circus turns
 * into a failure of the running test.
 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// `process.env` is shared by every test file a jest worker runs; only the
// module registry is per-file. Put the variable back the way it was found.
const ORIGINAL_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(async () => {
  jest.clearAllMocks();
  _resetClipMissingForTests();
  await AsyncStorage.clear();
  process.env.EXPO_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  getInfoAsync.mockResolvedValue({ exists: false, uri: CACHED, isDirectory: false });
  makeDirectoryAsync.mockResolvedValue(undefined);
  moveAsync.mockResolvedValue(undefined);
  deleteAsync.mockResolvedValue(undefined);
});

afterAll(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure path helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('path helpers', () => {
  it('names objects by form id and content version', () => {
    // Versioned because public objects are CDN-cached: overwriting in place
    // would serve stale bytes, so a re-cut clip MUST get a new filename.
    expect(clipObjectPath('bench_press', 1)).toBe('bench_press_v1.mp4');
    expect(clipObjectPath('romanian_deadlift', 3)).toBe('romanian_deadlift_v3.mp4');
  });

  it('builds the public storage URL for the tutorial bucket', () => {
    expect(TUTORIAL_BUCKET).toBe('tutorial-clips');
    expect(clipPublicUrl(SUPABASE_URL, OBJECT)).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/tutorial-clips/${OBJECT}`,
    );
  });

  it('tolerates a trailing slash on the project URL', () => {
    expect(clipPublicUrl(`${SUPABASE_URL}/`, OBJECT)).toBe(clipPublicUrl(SUPABASE_URL, OBJECT));
  });

  it('places the cached file under a tutorial-clips folder in the cache dir', () => {
    expect(clipCachePath('file:///cache/', OBJECT)).toBe(CACHED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureClipCached
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureClipCached', () => {
  it('returns the cached file without downloading when it already exists', async () => {
    getInfoAsync.mockResolvedValue({
      exists: true, uri: CACHED, isDirectory: false, size: 1_200_000, modificationTime: 0,
    });

    await expect(ensureClipCached(OBJECT)).resolves.toBe(CACHED);

    expect(downloadAsync).not.toHaveBeenCalled();
    expect(makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it('downloads to a temp name on a miss and promotes it to the cache path on 200', async () => {
    // On Android `downloadAsync` streams straight into whatever path it is
    // given, so the cache path itself is never the download target: it must
    // go from absent to complete in one rename, or a half-written file would
    // read as a hit to the next caller.
    downloadAsync.mockImplementation(async (_url, target) => ({
      status: 200, uri: target, headers: {}, mimeType: 'video/mp4',
    }));

    await expect(ensureClipCached(OBJECT)).resolves.toBe(CACHED);

    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///cache/tutorial-clips/', { intermediates: true });
    expect(downloadAsync).toHaveBeenCalledWith(clipPublicUrl(SUPABASE_URL, OBJECT), expect.stringMatching(TEMP));
    expect(moveAsync).toHaveBeenCalledWith({ from: tempPathOf(), to: CACHED });
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it('rejects on a non-200 response, removes the temp file and never promotes', async () => {
    // Storage answers a missing object with a 404 JSON body — and downloadAsync
    // happily writes that body to its target. Promoted, it would be a permanent
    // "cache hit" that the player can never decode.
    downloadAsync.mockResolvedValue({ status: 404, uri: CACHED, headers: {}, mimeType: 'application/json' });

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/404/);

    expect(moveAsync).not.toHaveBeenCalled();
    expect(deleteAsync).toHaveBeenCalledTimes(1);
    expect(deleteAsync).toHaveBeenCalledWith(tempPathOf(), { idempotent: true });
  });

  it('rejects when the download outlives the timeout without touching the temp file', async () => {
    // The timer decides what the caller hears and nothing else. On both
    // platforms the native side creates the temp file only once the response
    // arrives, so a delete fired here — usually while still waiting on
    // headers over a slow link — would run before the file exists and leave
    // an orphan behind when it did. Cleanup belongs to the download.
    deferredDownload();

    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

    expect(moveAsync).not.toHaveBeenCalled();
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it('promotes a 200 that lands after the timeout, so the next visit is a hit', async () => {
    // The caller has already settled for the poster, but the full body still
    // arrived. Throwing it away would make a slow link pay for the whole clip
    // on every visit and never get to play it.
    const download = deferredDownload();
    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

    download.resolve({ status: 200, uri: tempPathOf(), headers: {}, mimeType: 'video/mp4' });
    await flush();

    expect(moveAsync).toHaveBeenCalledWith({ from: tempPathOf(), to: CACHED });
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it('still removes the temp file when a non-200 lands after the timeout', async () => {
    const download = deferredDownload();
    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

    download.resolve({ status: 404, uri: tempPathOf(), headers: {}, mimeType: 'application/json' });
    await flush();

    expect(moveAsync).not.toHaveBeenCalled();
    expect(deleteAsync).toHaveBeenCalledTimes(1);
    expect(deleteAsync).toHaveBeenCalledWith(tempPathOf(), { idempotent: true });
  });

  it('rejects and removes the temp file when the promote itself fails', async () => {
    downloadAsync.mockResolvedValue({ status: 200, uri: CACHED, headers: {}, mimeType: 'video/mp4' });
    moveAsync.mockRejectedValue(new Error('EXDEV'));

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/EXDEV/);

    expect(deleteAsync).toHaveBeenCalledWith(tempPathOf(), { idempotent: true });
  });

  it('never deletes the cache path on any failure', async () => {
    // The cache path is the hit test; only a successful promote may create it
    // and only `evictClip` may remove it. A failed attempt must not be able to
    // unlink a good file that a concurrent, successful attempt just put there.
    downloadAsync.mockResolvedValue({ status: 500, uri: CACHED, headers: {}, mimeType: 'text/plain' });
    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/500/);

    downloadAsync.mockReturnValue(new Promise(() => {}));
    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

    for (const [path] of deleteAsync.mock.calls) expect(path).not.toBe(CACHED);
  });

  it('gives overlapping calls distinct temp names', async () => {
    // Two mounts inside one download window (WATCH AGAIN while the shimmer is
    // up, StrictMode's double effect) must not share a target: on Android the
    // second download would unlink the first's file mid-write, and the first's
    // promote would then rename the second's half-written body into place.
    downloadAsync.mockImplementation(async (_url, target) => ({
      status: 200, uri: target, headers: {}, mimeType: 'video/mp4',
    }));

    await Promise.all([ensureClipCached(OBJECT), ensureClipCached(OBJECT)]);

    const [first, second] = [tempPathOf(0), tempPathOf(1)];
    expect(first).toMatch(TEMP);
    expect(second).toMatch(TEMP);
    expect(first).not.toBe(second);
    expect(moveAsync).toHaveBeenCalledWith({ from: first, to: CACHED });
    expect(moveAsync).toHaveBeenCalledWith({ from: second, to: CACHED });
  });

  it('rejects without touching the network when the project URL is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/EXPO_PUBLIC_SUPABASE_URL/);

    expect(getInfoAsync).not.toHaveBeenCalled();
    expect(downloadAsync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evictClip
// ─────────────────────────────────────────────────────────────────────────────

describe('evictClip', () => {
  it('removes the cache path so the next call re-downloads', async () => {
    // The player calls this when a promoted file will not decode; without it
    // that file is a hit on every visit until the OS clears the cache.
    await expect(evictClip(OBJECT)).resolves.toBeUndefined();

    expect(deleteAsync).toHaveBeenCalledWith(CACHED, { idempotent: true });
  });

  it('never throws, even when the delete fails', async () => {
    deleteAsync.mockRejectedValue(new Error('EACCES'));

    await expect(evictClip(OBJECT)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No cache directory
// ─────────────────────────────────────────────────────────────────────────────

describe('without a cache directory', () => {
  // `cacheDirectory` is null where the platform has none (web). Neither entry
  // point may reach the file system then. The property is swapped on the live
  // mock object rather than by loading the module against a second mock: an
  // already-instantiated mock wins over any new factory even inside
  // `isolateModules`, so a second copy would silently be this same one. The
  // module reads `cacheDirectory` per call (as the product code must, since
  // the value is per platform, not per process), which is what makes this
  // swap observable.
  let replaced: jest.ReplaceProperty<string | null>;

  beforeEach(() => {
    const live = jest.requireMock<{ cacheDirectory: string | null }>('expo-file-system/legacy');
    replaced = jest.replaceProperty(live, 'cacheDirectory', null);
  });

  afterEach(() => {
    replaced.restore();
  });

  it('ensureClipCached rejects before looking for or fetching anything', async () => {
    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/cache directory/);

    expect(getInfoAsync).not.toHaveBeenCalled();
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('evictClip is a no-op', async () => {
    await expect(evictClip(OBJECT)).resolves.toBeUndefined();

    expect(deleteAsync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Remembered 404s — clips are looked up by convention, so "not there" must be
// an answer the app keeps, not a request it repeats on every open.
// ─────────────────────────────────────────────────────────────────────────────

describe('remembered 404s', () => {
  const settled = (status: number) =>
    downloadAsync.mockResolvedValue({ status, uri: '', headers: {}, mimeType: null } as never);

  it('a 404 is remembered: the next call rejects without touching the network', async () => {
    settled(404);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 404');
    await flush();
    expect(downloadAsync).toHaveBeenCalledTimes(1);

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(CLIP_MISSING_MESSAGE);
    expect(downloadAsync).toHaveBeenCalledTimes(1);
    await expect(isClipKnownMissing(OBJECT)).resolves.toBe(true);
  });

  it('survives a restart: the record is read back from storage', async () => {
    settled(404);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 404');
    await flush();

    _resetClipMissingForTests(); // forget the in-memory copy only
    await expect(isClipKnownMissing(OBJECT)).resolves.toBe(true);
  });

  it('expires after the TTL, so a later upload is found', async () => {
    settled(404);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 404');
    await flush();

    await expect(isClipKnownMissing(OBJECT, Date.now() + MISSING_TTL_MS + 1)).resolves.toBe(false);
    // ...and the expiry is durable, not just a read-time answer.
    await expect(isClipKnownMissing(OBJECT)).resolves.toBe(false);
  });

  it('a 5xx is NOT remembered — transient failures must not hide a clip for an hour', async () => {
    settled(503);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 503');
    await flush();
    await expect(isClipKnownMissing(OBJECT)).resolves.toBe(false);

    settled(503);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 503');
    expect(downloadAsync).toHaveBeenCalledTimes(2);
  });

  it('a cached file wins over a stale missing record', async () => {
    settled(404);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 404');
    await flush();

    getInfoAsync.mockResolvedValue({ exists: true, uri: CACHED, isDirectory: false } as never);
    await expect(ensureClipCached(OBJECT)).resolves.toBe(CACHED);
  });

  it('is scoped per object: one missing clip does not hide another', async () => {
    settled(404);
    await expect(ensureClipCached(OBJECT)).rejects.toThrow('HTTP 404');
    await flush();
    await expect(isClipKnownMissing('barbell_squat_v1.mp4')).resolves.toBe(false);
  });
});
