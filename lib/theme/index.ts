/**
 * Public surface of the Bold Canvas theme runtime — import from '@/lib/theme',
 * never from the files behind it.
 *
 * TOKENS is re-exported for the few places that cannot use a hook (navigation
 * options, StatusBar config); anything rendering inside the tree should read
 * tokens from useTheme() so it follows scheme changes.
 */

export { ThemeProvider, useTheme, useThemedStyles, type ThemeContextValue } from './ThemeProvider';
export { TOKENS } from '@/constants/tokens';
export type { ColorScheme, SemanticTokens, ThemeMode } from '@/constants/tokens';
