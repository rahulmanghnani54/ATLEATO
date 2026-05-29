/**
 * Ringtone Preference — which sound plays when the coach calls.
 *
 * The user can choose:
 *   - one of the 5 bundled variants (classic / old-bell / soft / alert / gym)
 *   - any audio file from their device storage (picked via expo-document-picker)
 *
 * Storage: AsyncStorage. Bundled choice stored as `bundle:<key>`, custom file
 * as `file:<uri>`. wakeupCalls.ts reads getActiveRingtoneSource() right
 * before playing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AVPlaybackSource } from 'expo-av';

const PREF_KEY = 'ringtone_pref:v1';

export type BundledRingtone = 'classic' | 'old-bell' | 'soft' | 'alert' | 'gym';

interface BundledMeta {
  key:         BundledRingtone;
  label:       string;
  tagline:     string;
  emoji:       string;
  asset:       AVPlaybackSource;     // expo-av require() output
}

export const BUNDLED_RINGTONES: BundledMeta[] = [
  {
    key:     'classic',
    label:   'Classic Phone',
    tagline: 'The familiar 440/480 Hz dual-tone every American phone uses.',
    emoji:   '📞',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asset:   require('../assets/sounds/ring-classic.wav'),
  },
  {
    key:     'old-bell',
    label:   'Old Bell',
    tagline: 'Vintage bell-style with a slight tremolo — telephone nostalgia.',
    emoji:   '🛎',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asset:   require('../assets/sounds/ring-old-bell.wav'),
  },
  {
    key:     'soft',
    label:   'Soft Chime',
    tagline: 'Gentle 880 Hz single tone with long fades — easier wake-up.',
    emoji:   '☁️',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asset:   require('../assets/sounds/ring-soft.wav'),
  },
  {
    key:     'alert',
    label:   'Emergency Alert',
    tagline: 'Alternating high tones — built to be impossible to ignore.',
    emoji:   '🚨',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asset:   require('../assets/sounds/ring-alert.wav'),
  },
  {
    key:     'gym',
    label:   'Boxing Bell',
    tagline: 'Low 200 Hz bell hit with overtones — gym round-start vibe.',
    emoji:   '🥊',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asset:   require('../assets/sounds/ring-gym.wav'),
  },
];

interface CustomPref { kind: 'file';   uri: string;   filename?: string }
interface BundlePref { kind: 'bundle'; bundle: BundledRingtone }
export type RingtonePref = CustomPref | BundlePref;

const DEFAULT_PREF: BundlePref = { kind: 'bundle', bundle: 'classic' };

// ── Read / write ─────────────────────────────────────────────────────────────

export async function getRingtonePref(): Promise<RingtonePref> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREF;
    const parsed = JSON.parse(raw) as RingtonePref;
    if (parsed.kind === 'bundle' && BUNDLED_RINGTONES.some((b) => b.key === parsed.bundle)) {
      return parsed;
    }
    if (parsed.kind === 'file' && typeof parsed.uri === 'string' && parsed.uri.length > 0) {
      return parsed;
    }
    return DEFAULT_PREF;
  } catch {
    return DEFAULT_PREF;
  }
}

export async function setRingtonePref(pref: RingtonePref): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, JSON.stringify(pref));
}

// ── Resolve to an Audio.Sound source ─────────────────────────────────────────

/**
 * Resolve the user's preference to an `AVPlaybackSource` that `Audio.Sound.createAsync`
 * accepts. For bundles → returns the require()'d asset. For custom files →
 * returns `{ uri }`.
 */
export async function getActiveRingtoneSource(): Promise<AVPlaybackSource> {
  const pref = await getRingtonePref();
  if (pref.kind === 'file') {
    return { uri: pref.uri };
  }
  const meta = BUNDLED_RINGTONES.find((b) => b.key === pref.bundle) ?? BUNDLED_RINGTONES[0];
  return meta.asset;
}

/**
 * Same as getActiveRingtoneSource but returns the bundle metadata if the
 * preference is bundled. Useful for the picker UI's "currently selected"
 * indicator.
 */
export async function describeActiveRingtone(): Promise<{
  label: string;
  detail: string;
  emoji: string;
}> {
  const pref = await getRingtonePref();
  if (pref.kind === 'file') {
    return {
      label: pref.filename ?? 'Custom file',
      detail: 'From your device storage',
      emoji: '📁',
    };
  }
  const meta = BUNDLED_RINGTONES.find((b) => b.key === pref.bundle) ?? BUNDLED_RINGTONES[0];
  return { label: meta.label, detail: meta.tagline, emoji: meta.emoji };
}
