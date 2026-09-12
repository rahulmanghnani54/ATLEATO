/**
 * Tutorial clips live in a public bucket and are downloaded ONCE per device.
 * The pure helpers decide where a clip lives (remote URL, local cache path);
 * `ensureClipCached` decides whether a download happens at all. A wrong path
 * or a swallowed failure does not crash anything — it silently means "the
 * clip never plays and the poster shows forever", which is why both halves
 * are pinned here.
 */

// expo-file-system is a device boundary. Jest maps every `expo-*` import to an
// empty stub, so the legacy API is replaced with spies the tests drive directly.
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  TUTORIAL_BUCKET,
  clipCachePath,
  clipObjectPath,
  clipPublicUrl,
  ensureClipCached,
} from '@/lib/tutorialClips';

const getInfoAsync = jest.mocked(FileSystem.getInfoAsync);
const makeDirectoryAsync = jest.mocked(FileSystem.makeDirectoryAsync);
const downloadAsync = jest.mocked(FileSystem.downloadAsync);
const deleteAsync = jest.mocked(FileSystem.deleteAsync);

const SUPABASE_URL = 'https://abc.supabase.co';
const OBJECT = 'bench_press_v1.mp4';
const CACHED = 'file:///cache/tutorial-clips/bench_press_v1.mp4';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  getInfoAsync.mockResolvedValue({ exists: false, uri: CACHED, isDirectory: false });
  makeDirectoryAsync.mockResolvedValue(undefined);
  deleteAsync.mockResolvedValue(undefined);
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

  it('downloads into the cache folder on a miss and resolves the file uri', async () => {
    downloadAsync.mockResolvedValue({ status: 200, uri: CACHED, headers: {}, mimeType: 'video/mp4' });

    await expect(ensureClipCached(OBJECT)).resolves.toBe(CACHED);

    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///cache/tutorial-clips/', { intermediates: true });
    expect(downloadAsync).toHaveBeenCalledWith(clipPublicUrl(SUPABASE_URL, OBJECT), CACHED);
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it('rejects on a non-200 response and leaves no file behind', async () => {
    // Storage answers a missing object with a 404 JSON body — and downloadAsync
    // happily writes that body to the destination. Left in place it would be a
    // permanent "cache hit" that the player can never decode.
    downloadAsync.mockResolvedValue({ status: 404, uri: CACHED, headers: {}, mimeType: 'application/json' });

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/404/);

    expect(deleteAsync).toHaveBeenCalledWith(CACHED, { idempotent: true });
  });

  it('rejects when the download outlives the timeout and removes the partial file', async () => {
    downloadAsync.mockReturnValue(new Promise(() => {}));

    await expect(ensureClipCached(OBJECT, { timeoutMs: 5 })).rejects.toThrow(/timed out/);

    expect(deleteAsync).toHaveBeenCalledWith(CACHED, { idempotent: true });
  });

  it('rejects without touching the network when the project URL is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;

    await expect(ensureClipCached(OBJECT)).rejects.toThrow(/EXPO_PUBLIC_SUPABASE_URL/);

    expect(getInfoAsync).not.toHaveBeenCalled();
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('treats an empty file as a miss and re-downloads', async () => {
    // A process killed mid-download leaves a truncated file at the final path;
    // `exists` alone would report it as cached and the clip would never play.
    getInfoAsync.mockResolvedValue({
      exists: true, uri: CACHED, isDirectory: false, size: 0, modificationTime: 0,
    });
    downloadAsync.mockResolvedValue({ status: 200, uri: CACHED, headers: {}, mimeType: 'video/mp4' });

    await expect(ensureClipCached(OBJECT)).resolves.toBe(CACHED);

    expect(downloadAsync).toHaveBeenCalledTimes(1);
  });
});
