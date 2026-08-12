/**
 * Bold Canvas — semantic design tokens.
 *
 * A full-bleed DARK "crown" carries the hero at the top of key screens; the
 * body below it is LIGHT. Light is the default scheme, dark is opt-in.
 *
 * Because those two surfaces sit on the same screen, one emerald cannot serve
 * every job — contrast requirements differ per surface and per role:
 *   accent      — fills/buttons on light. `accentInk` rides on it, so the fill
 *                 itself has to clear 4.5:1 against that ink, not just 3:1.
 *   accentText  — emerald used AS TEXT on light. Needs 4.5:1 AA, so it is darker.
 *   crownAccent — emerald on the dark crown. Needs to be brighter to clear the ink.
 * Using `accent` as text on light (or `accentText` on the crown) fails contrast.
 *
 * This file is additive: constants/theme.ts and its `Colors` export are
 * untouched and remain the source of truth for non-migrated screens.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface SemanticTokens {
  bg: string; bgAlt: string; surface: string; surfaceAlt: string;
  crown: string; crownText: string; crownTextDim: string; crownAccent: string; crownLine: string;
  text: string; textSecondary: string; textTertiary: string;
  accent: string; accentText: string; accentInk: string; accentSoft: string; accentLine: string;
  border: string; borderStrong: string;
  success: string; warning: string; danger: string; info: string;
  macroProtein: string; macroCarbs: string; macroFat: string;
  tabBar: string; tabActive: string; tabInactive: string;
  overlay: string; scrim: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES — raw values only, never consumed by screens.
// The rgba() strings below are these same hexes at alpha; kept inline so the
// alpha ladder stays readable at the point of use.
//   INK   = 11,20,16   BONE = 239,243,238
//   EMERALD 12,133,82 · EMERALD_LIFT 32,209,142
// ─────────────────────────────────────────────────────────────────────────────
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const INK = '#0B1410';          // near-black with a green cast — crown + light-mode text
const BONE = '#EFF3EE';         // dark-mode text; never pure white (halation)

// The BRAND emerald — never darken it to satisfy a contrast check. White ink on
// it is 2.54:1, but INK on it is 7.38:1, so filled controls carry dark ink (which
// is the more premium Bold Canvas look anyway). Emerald used AS TEXT on the page
// switches to EMERALD_DEEP, which clears AA at 5.18:1.
const EMERALD = '#12B981';      // brand — fills: buttons, rings, chips
const EMERALD_DEEP = '#0A7D4D'; // light text-safe emerald (5.18:1 on white)
const EMERALD_BRIGHT = '#31E39C'; // on dark: crown accent + dark-mode text
const EMERALD_LIFT = '#20D18E'; // dark fills

const BLUE = '#3E72D6';
const AMBER = '#C77A0A';
const BLUE_LIFT = '#6E9BFF';
const AMBER_LIFT = '#F0A836';

const NIGHT = '#0A0D0B';        // dark bg
const NIGHT_ALT = '#101512';    // dark bgAlt + tabBar

// ─────────────────────────────────────────────────────────────────────────────
// LIGHT (default)
// ─────────────────────────────────────────────────────────────────────────────
const LIGHT: SemanticTokens = {
  bg: WHITE,
  bgAlt: '#F7F9F8',
  surface: WHITE,
  surfaceAlt: '#F2F5F3',

  crown: INK,
  crownText: WHITE,
  crownTextDim: 'rgba(255,255,255,0.58)',
  crownAccent: EMERALD_BRIGHT,
  crownLine: 'rgba(255,255,255,0.22)',

  text: INK,
  textSecondary: 'rgba(11,20,16,0.66)',
  textTertiary: 'rgba(11,20,16,0.48)',

  accent: EMERALD,
  accentText: EMERALD_DEEP,
  accentInk: INK,                          // dark ink on brand emerald = 7.38:1
  accentSoft: 'rgba(18,185,129,0.12)',
  // REQUIRED on every emerald fill sitting on a light page. Brand emerald is only
  // 2.54:1 against white — below the 3:1 SC 1.4.11 owes a control's boundary — so
  // the hairline in the deep tone (5.18:1) is what makes the control identifiable.
  accentLine: EMERALD_DEEP,

  border: 'rgba(11,20,16,0.09)',
  borderStrong: 'rgba(11,20,16,0.17)',

  success: EMERALD_DEEP,                   // status colours are read as text/icons, not fills
  warning: AMBER,
  danger: '#D6412A',
  info: BLUE,

  macroProtein: BLUE,
  macroCarbs: AMBER,
  macroFat: '#D6752A',

  tabBar: WHITE,
  tabActive: INK,
  tabInactive: 'rgba(11,20,16,0.46)',

  overlay: 'rgba(11,20,16,0.45)',
  scrim: 'rgba(11,20,16,0.72)',
};

// ─────────────────────────────────────────────────────────────────────────────
// DARK — crown goes to pure black so it still separates from the page.
// ─────────────────────────────────────────────────────────────────────────────
const DARK: SemanticTokens = {
  bg: NIGHT,
  bgAlt: NIGHT_ALT,
  surface: '#141915',
  surfaceAlt: '#1A211C',

  crown: BLACK,
  crownText: WHITE,
  crownTextDim: 'rgba(255,255,255,0.56)',
  crownAccent: EMERALD_BRIGHT,
  crownLine: 'rgba(255,255,255,0.16)',

  text: BONE,
  textSecondary: 'rgba(239,243,238,0.66)',
  textTertiary: 'rgba(239,243,238,0.42)',

  accent: EMERALD_LIFT,
  accentText: EMERALD_BRIGHT,
  accentInk: '#04140E',
  accentSoft: 'rgba(32,209,142,0.15)',
  accentLine: 'rgba(32,209,142,0.34)',

  border: 'rgba(239,243,238,0.12)',
  borderStrong: 'rgba(239,243,238,0.22)',

  success: EMERALD_LIFT,
  warning: AMBER_LIFT,
  danger: '#FF6B54',
  info: BLUE_LIFT,

  macroProtein: BLUE_LIFT,
  macroCarbs: AMBER_LIFT,
  macroFat: '#FF9457',

  tabBar: NIGHT_ALT,
  tabActive: BONE,
  tabInactive: 'rgba(239,243,238,0.40)',

  overlay: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.78)',
};

export const TOKENS: Record<ColorScheme, SemanticTokens> = {
  light: LIGHT,
  dark: DARK,
};
