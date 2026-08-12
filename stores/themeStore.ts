import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '@/constants/tokens';

const STORAGE_KEY = 'evulto_theme_mode';

// Product decision: LIGHT is the default scheme — Bold Canvas is a light page
// with a dark crown, so dark is opt-in, not system-driven.
const DEFAULT_MODE: ThemeMode = 'light';

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

const parseMode = (raw: string | null): ThemeMode =>
  MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : DEFAULT_MODE;

interface ThemeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode: (m: ThemeMode) => void;
  hydrate: () => Promise<void>;
}

// Two callers race to hydrate (RootLayout, to unblock the splash early, and
// ThemeProvider, so the provider stands alone). Both must be safe: a second
// read landing AFTER a setMode would write the stale stored value back over it.
let inflight: Promise<void> | null = null;

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: DEFAULT_MODE,
  hydrated: false,
  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem(STORAGE_KEY, mode).catch((err) => {
      if (__DEV__) console.warn('[themeStore] persist failed:', err);
    });
  },
  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    const run =
      inflight ??
      (async () => {
        try {
          set({ mode: parseMode(await AsyncStorage.getItem(STORAGE_KEY)) });
        } catch (err) {
          if (__DEV__) console.warn('[themeStore] hydrate failed:', err);
        } finally {
          // Must always flip: a storage failure can never leave the app on splash.
          set({ hydrated: true });
        }
      })();
    inflight = run;
    return run;
  },
}));
