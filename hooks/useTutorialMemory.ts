/**
 * useTutorialMemory
 *
 * React face of `lib/tutorialMemory` for ONE exercise. Hydrates the shared
 * cache once, then mirrors the exercise's entry into state so the technique
 * screen re-renders after each write (the lib replaces entries rather than
 * mutating them, so a plain `setEntry` is enough).
 *
 * `loaded` is false for the first frame; `entry` is null until then AND for a
 * genuine first-timer, so callers must render a placeholder while `!loaded`
 * instead of reading null as "never seen".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadTutorialMemory,
  getEntry,
  recordWatched,
  recordSkipped,
  markKnown,
  markSetupSeen,
  shouldShowFastPath,
  type TutorialMemoryEntry,
} from '@/lib/tutorialMemory';

export function useTutorialMemory(key: string) {
  const [loaded, setLoaded] = useState(false);
  const [entry, setEntry] = useState<TutorialMemoryEntry | null>(null);
  // Writes outlive the screen (CAMERA READY hands off to form-coach mid-await);
  // a state update after unmount is a warning at best.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Hydrate once per key. The lib never rejects, but the finally keeps the
  // screen from hanging on a skeleton if that contract ever slips.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      try {
        await loadTutorialMemory();
        if (alive) setEntry(getEntry(key));
      } catch {
        // treat as never seen
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [key]);

  const apply = useCallback((next: TutorialMemoryEntry) => {
    if (mounted.current) setEntry(next);
  }, []);

  const watched = useCallback(async () => { apply(await recordWatched(key)); }, [key, apply]);
  const skipped = useCallback(async () => { apply(await recordSkipped(key)); }, [key, apply]);
  const setKnown = useCallback(async (v: boolean) => { apply(await markKnown(key, v)); }, [key, apply]);
  const setupSeen = useCallback(async () => { apply(await markSetupSeen(key)); }, [key, apply]);

  return {
    loaded,
    entry,
    fastPath: shouldShowFastPath(entry),
    watched,
    skipped,
    setKnown,
    setupSeen,
  };
}
