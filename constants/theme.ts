export const Colors = {
  // Core palette (dark theme)
  bg: '#0a0b0d',
  background: '#0a0b0d',
  surface: '#15171b',
  raised: '#1d2026',

  // Borders
  border: 'rgba(255,255,255,0.07)' as string,
  borderStrong: 'rgba(255,255,255,0.14)' as string,

  // Text
  text: '#f5f5f4',
  textSecondary: 'rgba(245,245,244,0.62)',
  textTertiary: 'rgba(245,245,244,0.38)',

  // Accent — electric lime
  primary: '#dfff1f',
  primaryLight: 'rgba(223,255,31,0.12)',
  accentInk: '#0a0b0d',

  // Status
  success: '#39e08a',
  warning: '#ffb13a',
  error: '#ff5b3a',
  info: '#5b8cff',
  danger: '#ff5b3a',
  good: '#39e08a',
  warn: '#ffb13a',

  // Macro colors
  macroProtein: '#5b8cff',
  macroCarbs: '#dfff1f',
  macroFat: '#ff8c3a',

  // Legacy aliases (keep existing references working)
  dark: '#0a0b0d',
} as const;

export const Spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const;

export const Radius = {
  xs: 3, sm: 6, md: 8, lg: 12, xl: 16, full: 9999,
} as const;

// Font family strings — loaded in app/_layout.tsx
export const Fonts = {
  display: 'ArchivoBlack_400Regular',
  mono: 'JetBrainsMono_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const Typography = {
  h1: { fontSize: 28, fontFamily: Fonts.display, color: Colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontFamily: Fonts.display, color: Colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontFamily: Fonts.bodySemi, color: Colors.text },
  display: { fontFamily: Fonts.display, color: Colors.text, letterSpacing: -0.5 },
  mono: { fontFamily: Fonts.mono, color: Colors.textTertiary, letterSpacing: 1.4 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, textTransform: 'uppercase' as const },
  body: { fontSize: 15, fontFamily: Fonts.body, color: Colors.text },
  bodyMedium: { fontSize: 15, fontFamily: Fonts.bodyMedium, color: Colors.text },
  caption: { fontSize: 12, fontFamily: Fonts.body, color: Colors.textSecondary },
  label: { fontSize: 13, fontFamily: Fonts.bodyMedium, color: Colors.textSecondary },
} as const;
