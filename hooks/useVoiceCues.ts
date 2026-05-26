/**
 * useVoiceCues
 *
 * Stateful wrapper around the voiceCues service. Tracks whether voice is
 * enabled (persisted in AsyncStorage) and exposes `speak()` that's a no-op
 * when disabled — so callers don't need to gate themselves.
 *
 * Also exposes a `toggle()` for the profile setting row.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import { speakCue, speakAs, silence, type CueId } from '@/lib/voiceCues';

const STORAGE_KEY = 'voice_cues:enabled:v1';
const DEFAULT_ENABLED = true; // ship voice ON by default — it's the headline feature

export function useVoiceCues() {
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_ENABLED);
  const [loaded, setLoaded] = useState(false);

  // Hydrate preference once on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw !== null) setEnabled(raw === '1');
      } catch {
        // keep default
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  /** Persist + apply toggle. Stops any in-flight speech when turning off. */
  const toggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
    if (!next) silence();
  }, [enabled]);

  /** Fire a built-in cue. No-op when voice is disabled. */
  const cue = useCallback(
    (cueId: CueId, params: Parameters<typeof speakCue>[2] = {}) => {
      if (!enabled) return;
      speakCue(cueId, persona.id, params);
    },
    [enabled, persona.id],
  );

  /** Speak arbitrary text in the active coach voice. No-op when disabled. */
  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      speakAs(persona.id, text);
    },
    [enabled, persona.id],
  );

  return { enabled, loaded, toggle, cue, speak, stop: silence, persona };
}
