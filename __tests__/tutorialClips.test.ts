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
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  TUTORIAL_BUCKET,
  clipCachePath,
  clipObjectPath,
  clipPublicUrl,
  ensureClipCached,
  evictClip,
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

// `process.env` is shared by every test file a jest worker runs; only the
// module registry is per-file. Put the variable back the way it was found.
const ORIGINAL_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
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

  it('rejects when the download outlives the timeout and removes the temp file', async () => {
    downloadAsync.mockReturnValue(new Promise(() => {}));

    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

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
