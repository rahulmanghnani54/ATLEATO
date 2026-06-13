/**
 * Atleato Theme — Direction C (Nike/Telegram)
 *
 * Migrated from v0 (Apple/Stark dark + volt-green everywhere + Anton+Mono+Inter triad)
 * to v1 (warmer dark + persona-accent primary + Plus Jakarta Sans + Inter +
 * volt-green RESERVED for system actions only).
 *
 * Migration discipline:
 *   - Existing screens keep working — every v0 token name has been preserved
 *     and just re-pointed to the v1 equivalent. No breaking changes.
 *   - New screens should use the new tokens directly (Colors.bgWarm,
 *     Fonts.displayBold, etc).
 *   - The volt-green is still accessible as Colors.systemAccent — use ONLY
 *     for toggles, switches, and other system controls.
 */

// ─────────────────────────────────────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────────────────────────────────────
export const Colors = {
  // ── Surfaces (warmer than v0 — cinematic, not clinical) ────────────────────
  bg: '#0a0b0d',              // deep base
  background: '#0a0b0d',
  bgWarm: '#0d0a0a',          // slightly warmer for hero backgrounds
  surface: '#15171b',          // card surface (legacy)
  surfaceWarm: '#181a1f',     // slightly warmer card surface — preferred for new screens
  raised: '#1d2026',
  raisedWarm: '#22242a',

  // ── Borders ────────────────────────────────────────────────────────────────
  border: 'rgba(255,255,255,0.07)' as string,
  borderStrong: 'rgba(255,255,255,0.14)' as string,
  borderWarm: 'rgba(255,180,120,0.10)' as string,  // tinted border for warm cards

  // ── Text ───────────────────────────────────────────────────────────────────
  text: '#f5f5f4',
  textSecondary: 'rgba(245,245,244,0.62)',
  textTertiary: 'rgba(245,245,244,0.38)',
  textMuted: 'rgba(245,245,244,0.50)',

  // ── PRIMARY — Atleato brand orange (replaces volt-green default) ───────────
  // This is the new default accent. Used for non-persona buttons, brand
  // moments, and the logo.
  primary: '#e05a26',
  primaryDeep: '#c4471a',
  primaryLight: 'rgba(224,90,38,0.14)',
  accentInk: '#ffffff',                              // text on primary buttons

  // ── SYSTEM accent — RESERVED for OS-level controls ONLY ───────────────────
  // Per Direction C spec: volt green moves to ONLY system actions (toggles,
  // switches, push-notification dots, etc). DO NOT use as a brand color.
  systemAccent: '#dfff1f',
  systemAccentSoft: 'rgba(223,255,31,0.12)',

  // ── Status ─────────────────────────────────────────────────────────────────
  success: '#39e08a',
  warning: '#ffb13a',
  error: '#ff5b3a',
  info: '#5b8cff',
  danger: '#ff5b3a',
  good: '#39e08a',
  warn: '#ffb13a',

  // ── Macros ─────────────────────────────────────────────────────────────────
  macroProtein: '#5b8cff',
  macroCarbs: '#ffb13a',                             // (was volt — moved to warn-yellow)
  macroFat: '#ff8c3a',

  // ── Persona accents (for ref — actual per-persona colors live in
  //     lib/personaTheme.ts; these are just so screens that don't have a
  //     persona context can fall back gracefully) ──────────────────────────
  personaSculptor:  '#c8ff3d',
  personaMonument:  '#f5b942',
  personaAnalyst:   '#5DD3FA',
  personaCommander: '#ef4444',
  personaArchitect: '#7be38c',

  // ── Legacy aliases (DO NOT REMOVE — existing screens reference these) ────
  dark: '#0a0b0d',
  ink: '#0a0b0d',
  primaryDim: '#b4d018',                             // legacy v0 — now points at olive
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SPACING
//   v0 was perfectly on the 4/8/12/16/24/32 ladder (an "AI tell"). v1 loosens
//   it with deliberate asymmetric values (3px, 13px) used in HeroBlock/Stat.
// ─────────────────────────────────────────────────────────────────────────────
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  // Deliberate off-ladder values for the human-touch spots
  micro: 3,
  cardGap: 13,     // RowCard vertical rhythm — intentionally not 12 or 14
  heroPad: 22,     // edge-to-edge hero content inset
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RADIUS — slightly rounder than v0 (Nike-card feel, not sharp utility-tool)
// ─────────────────────────────────────────────────────────────────────────────
export const Radius = {
  xs: 4,            // (was 3)
  sm: 8,            // (was 6)
  md: 10,           // (was 8)
  lg: 14,           // (was 12) — RowCard
  xl: 18,           // (was 16) — HeroBlock
  pill: 100,
  full: 9999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// FONTS
//   v0: Anton (display) + JetBrains Mono (labels) + Inter (body) — three-font
//        triad that reads as "AI-designed tech magazine."
//   v1: Plus Jakarta Sans (display) + Inter (body). Anton & JetBrains Mono
//        kept as `legacyDisplay` / `legacyMono` so existing screens still
//        compile — they should be removed during per-screen migration.
// ─────────────────────────────────────────────────────────────────────────────
export const Fonts = {
  // v1 — preferred
  display:         'PlusJakartaSans_700Bold',         // section headlines
  displayBold:     'PlusJakartaSans_800ExtraBold',    // hero / huge moments
  displayMedium:   'PlusJakartaSans_600SemiBold',     // sub-headlines
  body:            'Inter_400Regular',
  bodyMedium:      'Inter_500Medium',
  bodySemi:        'Inter_600SemiBold',
  bodyBold:        'Inter_700Bold',

  // v0 — legacy (kept so non-migrated screens compile)
  legacyDisplay:   'ArchivoBlack_400Regular',
  legacyMono:      'JetBrainsMono_400Regular',
  mono:            'JetBrainsMono_400Regular',         // legacy alias
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
//   New presets for Direction C, legacy presets retained.
// ─────────────────────────────────────────────────────────────────────────────
export const Typography = {
  // ── v1 (Direction C) ──────────────────────────────────────────────────────
  heroName:     { fontFamily: Fonts.displayBold,   fontSize: 30, color: Colors.text, letterSpacing: -1 },
  heroSub:      { fontFamily: Fonts.bodySemi,      fontSize: 11, color: Colors.text, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  sectionTitle: { fontFamily: Fonts.display,       fontSize: 20, color: Colors.text, letterSpacing: -0.4 },
  cardTitle:    { fontFamily: Fonts.displayMedium, fontSize: 15, color: Colors.text, letterSpacing: -0.2 },
  cardMeta:     { fontFamily: Fonts.body,          fontSize: 12.5, color: Colors.textSecondary },
  statNum:      { fontFamily: Fonts.displayBold,   fontSize: 26, color: Colors.text, letterSpacing: -0.8 },
  statLabel:    { fontFamily: Fonts.bodyMedium,    fontSize: 10.5, color: Colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  ctaText:      { fontFamily: Fonts.displayMedium, fontSize: 14.5, color: '#fff', letterSpacing: 0.3 },

  // ── v0 (legacy — keep for non-migrated screens) ───────────────────────────
  h1: { fontSize: 28, fontFamily: Fonts.legacyDisplay, color: Colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontFamily: Fonts.legacyDisplay, color: Colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontFamily: Fonts.bodySemi, color: Colors.text },
  display: { fontFamily: Fonts.legacyDisplay, color: Colors.text, letterSpacing: -0.5 },
  monoLabel: { fontFamily: Fonts.legacyMono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, textTransform: 'uppercase' as const },
  body: { fontSize: 15, fontFamily: Fonts.body, color: Colors.text },
  bodyMedium: { fontSize: 15, fontFamily: Fonts.bodyMedium, color: Colors.text },
  caption: { fontSize: 12, fontFamily: Fonts.body, color: Colors.textSecondary },
  label: { fontSize: 13, fontFamily: Fonts.bodyMedium, color: Colors.textSecondary },
} as const;
