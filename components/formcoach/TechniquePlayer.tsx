/**
 * TechniquePlayer — the looping technique clip, with the poster as the floor.
 *
 * The poster is not a loading spinner that gets replaced; it is the complete
 * fallback state and the only state most exercises have until a clip is
 * uploaded. So it renders FIRST, unconditionally, and everything else is
 * layered over it: a shimmer while the download runs, the video once the file
 * is on disk. If anything fails — no env, a 404, a timeout, a file the decoder
 * rejects — the layers come off and the poster is simply what the user sees.
 * No "coming soon" copy, no error card: the parent hears `onError` once and
 * changes its CTA from WATCH TECHNIQUE to CONTINUE.
 *
 * Plays from the cache file, never from the URL (see lib/tutorialClips.ts for
 * why). All expo-av usage in the app's technique path lives in this one
 * component so the eventual move to expo-video is a single-file change.
 */
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { Skeleton } from '@/components/ui/motion';
import { ensureClipCached, evictClip } from '@/lib/tutorialClips';

export interface TechniquePlayerProps {
  /** Object name inside the tutorial bucket; NULL means "no clip for this exercise". */
  objectPath: string | null;
  /** Rendered underneath everything, and alone when there is no playable clip. */
  poster: ReactNode;
  height: number;
  /** The clip is on disk and the player is mounting. */
  onReady?: () => void;
  /** Fired at most once per clip: the poster is now the final state. */
  onError?: () => void;
  /**
   * Spoken name for the <Video> once it is playing. Without it TalkBack has
   * only the poster's label to read, which describes a still figure.
   */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * What sits on top of the poster right now. The playing layer carries the
 * object it was built from: for the one render between an `objectPath` prop
 * change and the effect resetting to 'loading', the previous clip's <Video>
 * is still mounted, and a decoder error in that window must evict THAT file
 * rather than whatever the props name by then.
 */
type Layer = 'poster' | 'loading' | { source: { uri: string }; objectPath: string };

export function TechniquePlayer({
  objectPath,
  poster,
  height,
  onReady,
  onError,
  accessibilityLabel,
  testID,
}: TechniquePlayerProps): JSX.Element {
  const [layer, setLayer] = useState<Layer>(objectPath === null ? 'poster' : 'loading');

  // Held in refs so inline arrow props neither re-run the effect (which would
  // restart the download) nor fire a stale closure.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Two failure sources (download, decoder) funnel through one gate so the
  // parent sees exactly one `onError` per clip.
  const errorFired = useRef(false);
  const fail = useCallback(() => {
    setLayer('poster');
    if (errorFired.current) return;
    errorFired.current = true;
    onErrorRef.current?.();
  }, []);

  // A file that downloaded fine but will not decode is the same to the user
  // as no file at all — and it must not stay a cache hit, or every later
  // visit fails the same way. Eviction is fire-and-forget: it never throws,
  // and the poster is already the outcome either way. The path comes from
  // the layer, not the props (see `Layer`).
  const failDecode = useCallback(
    (rejected: string) => {
      void evictClip(rejected);
      fail();
    },
    [fail],
  );

  useEffect(() => {
    errorFired.current = false;
    setLayer(objectPath === null ? 'poster' : 'loading');
    if (objectPath === null) return;

    // The download outlives an unmount (nothing cancels it, and the cached
    // file is still worth having), but its result must not touch a dead tree.
    let alive = true;
    ensureClipCached(objectPath).then(
      (fileUri) => {
        if (!alive) return;
        setLayer({ source: { uri: fileUri }, objectPath });
        onReadyRef.current?.();
      },
      () => {
        if (alive) fail();
      },
    );
    return () => {
      alive = false;
    };
  }, [objectPath, fail]);

  return (
    <View style={[styles.root, { height }]} testID={testID}>
      {poster}

      {layer === 'loading' ? (
        // The plate is a translucent token, so the poster shows through the
        // sweep instead of being blanked by it.
        <Skeleton height={height} radius={0} style={StyleSheet.absoluteFill} />
      ) : null}

      {typeof layer === 'object' ? (
        <Video
          source={layer.source}
          isLooping
          shouldPlay
          isMuted
          resizeMode={ResizeMode.COVER}
          useNativeControls={false}
          accessible={accessibilityLabel !== undefined}
          accessibilityLabel={accessibilityLabel}
          style={[styles.video, { height }]}
          onError={() => failDecode(layer.objectPath)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', overflow: 'hidden' },
  // Over the poster, not instead of it: the poster covers the first-frame
  // decode gap so the slab never flashes black.
  video: { position: 'absolute', top: 0, left: 0, width: '100%' },
});
