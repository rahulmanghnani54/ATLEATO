/**
 * Bold Canvas theme runtime.
 *
 * The persisted preference (`ThemeMode`) and the scheme actually painted
 * (`ColorScheme`) are different things: 'system' has no colour of its own, it
 * defers to the OS. This provider is the single place that collapses the two,
 * so no screen ever has to reason about Appearance directly.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { TOKENS, type ColorScheme, type SemanticTokens, type ThemeMode } from '@/constants/tokens';
import { useThemeStore } from '@/stores/themeStore';

export interface ThemeContextValue {
  tokens: SemanticTokens;
  scheme: ColorScheme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

// null rather than a default value: a missing provider must be a loud failure,
// not a screen silently rendering light tokens.
const ThemeContext = createContext<ThemeContextValue | null>(null);

// Appearance reports null on platforms/OS versions with no stated preference.
// Bold Canvas is light-by-default, so anything that is not explicitly dark is light.
function toScheme(value: string | null | undefined): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const hydrate = useThemeStore((s) => s.hydrate);

  const [systemScheme, setSystemScheme] = useState<ColorScheme>(() =>
    toScheme(Appearance.getColorScheme()),
  );

  // Store actions are stable references, so this fires once per mount. Without
  // it the persisted mode is never read back and every launch starts on the
  // store's default.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Only 'system' tracks the OS — while pinned to light/dark we hold no
    // listener at all. That means the OS may have flipped behind our back, so
    // re-read on every (re)subscribe instead of trusting the stale state.
    if (mode !== 'system') return;
    setSystemScheme(toScheme(Appearance.getColorScheme()));
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(toScheme(colorScheme));
    });
    return () => subscription.remove();
  }, [mode]);

  const scheme: ColorScheme = mode === 'system' ? systemScheme : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ tokens: TOKENS[scheme], scheme, mode, setMode }),
    [scheme, mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error(
      'useTheme() was called outside <ThemeProvider>. Wrap the app root ' +
        "(app/_layout.tsx) in <ThemeProvider> from '@/lib/theme'.",
    );
  }
  return context;
}

/**
 * Builds themed styles once per scheme.
 *
 * The factory should return a StyleSheet-shaped object and wrap it in
 * StyleSheet.create so RN's own validation/optimisation still applies:
 *
 *   const styles = useThemedStyles((t) => StyleSheet.create({
 *     card: { backgroundColor: t.surface, borderColor: t.border },
 *   }));
 */
export function useThemedStyles<T>(factory: (t: SemanticTokens, scheme: ColorScheme) => T): T {
  // Tokens come from the context, not TOKENS[scheme] — otherwise any future
  // provider-level override (persona tinting, high-contrast) would silently
  // skip every themed stylesheet.
  const { tokens, scheme } = useTheme();
  // Keyed on scheme alone. Factories are inline closures with a fresh identity
  // every render, so including `factory` in the deps would rebuild the sheet on
  // each render and defeat the memo entirely. `tokens` is derived from `scheme`,
  // so it is never stale relative to this key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(tokens, scheme), [scheme]);
}
