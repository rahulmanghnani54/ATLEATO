/**
 * Evulto Theme — Bold Canvas.
 *
 * `Colors` is the STATIC light palette, kept only for backward compatibility:
 * ~85 files still import it, so every key name it has ever exported must stay
 * exported. The NAMES are frozen; the VALUES now come from the Bold Canvas
 * light tokens, so non-migrated screens pick up the new palette for free.
 *
 * Screens migrate off this object to useTheme() wave by wave — useTheme() is
 * the only way to get the dark scheme and the crown tokens, which a static
 * light-only object cannot express. Do not add keys here; add them to
 * constants/tokens.ts instead.
 */

import { TOKENS } from '@/constants/tokens';

const L = TOKENS.light;

// ─────────────────────────────────────────────────────────────────────────────
// COLORS — legacy surface. Left column = frozen legacy name, right = Bold Canvas.
// ─────────────────────────────────────────────────────────────────────────────
export const Colors = {
  // ── Surfaces ───────────────────────────────────────────────────────────────
  // Legacy `bg` is the tinted page that white cards sit ON, so it maps to
  // bgAlt, not bg — pure white here would flatten every un-migrated card.
  bg: L.bgAlt,
  background: L.bgAlt,
  bgWarm: L.surfaceAlt,        // one step deeper than the page (hero backgrounds)
  surface: L.surface,
  surfaceWarm: L.surface,      // no warm variant in Bold Canvas
  raised: L.surface,
  raisedWarm: L.surfaceAlt,

  // ── Borders ────────────────────────────────────────────────────────────────
  border: L.border,
  borderStrong: L.borderStrong,
  borderWarm: L.accentLine,    // emerald-tinted border → the emerald line token

  // ── Text ───────────────────────────────────────────────────────────────────
  text: L.text,
  textSecondary: L.textSecondary,
  textTertiary: L.textTertiary,
  // Legacy 0.50 alpha sits between the two rungs; secondary is the safe side —
  // tertiary (0.42) would drop muted body copy below AA.
  textMuted: L.textSecondary,

  // ── PRIMARY — Bold Canvas emerald ──────────────────────────────────────────
  primary: L.accent,
  primaryDeep: L.accentText,   // the AA-on-light emerald; safe as text
  primaryLight: L.accentSoft,
  accentInk: L.accentInk,      // text on emerald fills

  // ── SYSTEM accent — OS-level controls (toggles/switches) ───────────────────
  systemAccent: L.accent,
  systemAccentSoft: L.accentSoft,

  // ── Status ─────────────────────────────────────────────────────────────────
  success: L.success,
  warning: L.warning,
  error: L.danger,             // Bold Canvas has one negative token
  info: L.info,
  danger: L.danger,
  good: L.success,
  warn: L.warning,

  // ── Macros ─────────────────────────────────────────────────────────────────
  macroProtein: L.macroProtein,
  macroCarbs: L.macroCarbs,
  macroFat: L.macroFat,

  // ── Persona accents — fallbacks only; the real per-persona colors live in
  //     lib/personaTheme.ts. Bold Canvas has no persona ramp, so each one
  //     borrows the closest semantic hue.
  personaSculptor:  L.accent,
  personaMonument:  L.warning,
  personaAnalyst:   L.info,
  personaCommander: L.danger,
  personaArchitect: L.accentText,

  // ── Legacy aliases (DO NOT REMOVE — existing screens reference these) ────
  dark: L.crown,
  ink: L.text,
  primaryDim: L.accentText,    // v0 olive, retired — nearest is the deep emerald
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
  // mono is now aliased to Inter Medium — this single change re-themes every
  // not-yet-migrated screen away from the JetBrains 'tech magazine' feel.
  // The letterSpacing in legacy stylesheets stays high (was tuned for mono),
  // which reads as 'sparse caps' but no longer 'code'. Per-screen migrations
  // can drop letterSpacing closer to 0 for proper Inter aesthetics.
  mono:            'Inter_500Medium',
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
