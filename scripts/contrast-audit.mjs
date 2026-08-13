#!/usr/bin/env node
/**
 * WCAG contrast audit for the Bold Canvas tokens.
 *
 *   node scripts/contrast-audit.mjs
 *
 * Zero dependencies, plain ESM. The token files are TypeScript, so they are read
 * as TEXT and parsed with a small regex parser — importing them would need a
 * transpiler and drag the whole RN module graph in.
 *
 * Exits 1 if any pair fails, so it can gate CI.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_FILE = join(ROOT, 'constants', 'tokens.ts');
const PERSONA_FILE = join(ROOT, 'lib', 'personaTheme.ts');

// ─── colour math ─────────────────────────────────────────────────────────────

/** Parse '#RGB' | '#RRGGBB' | '#RRGGBBAA' | 'rgb(...)' | 'rgba(...)' -> {r,g,b,a}. */
function parseColor(raw) {
  const s = String(raw).trim();

  if (s[0] === '#') {
    const h = s.slice(1);
    const hex = h.length === 3 || h.length === 4 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

/**
 * Source-over composite in 8-bit sRGB — that is how RN/the GPU actually blends,
 * and the composited value is the colour the eye receives, so it is what WCAG
 * must be measured against. Backdrop is assumed opaque.
 */
function flatten(fg, backdrop) {
  if (fg.a >= 1) return fg;
  const a = fg.a;
  return {
    r: fg.r * a + backdrop.r * (1 - a),
    g: fg.g * a + backdrop.g * (1 - a),
    b: fg.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** WCAG 2.x relative luminance. */
function luminance({ r, g, b }) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ─── TS text parsing ─────────────────────────────────────────────────────────

/** Top-level `const NAME = '#hex';` primitives, so identifier values resolve. */
function constMap(src) {
  const map = new Map();
  const re = /^const\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*'([^']*)'\s*;/gm;
  let m;
  while ((m = re.exec(src))) map.set(m[1], m[2]);
  return map;
}

/** Body of the object literal that follows `marker`, via brace matching. */
function objectAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const open = src.indexOf('{', at + marker.length);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

/** First `key: 'literal'` or `key: IDENTIFIER` in `body`, identifiers resolved. */
function readKey(body, key, consts) {
  const re = new RegExp(`(?:^|[\\s{,])${key}\\s*:\\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\\w$]*))`, 'm');
  const m = re.exec(body);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  if (m[2] !== undefined) return m[2];
  return consts.get(m[3]) ?? null;
}

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    console.error(`contrast-audit: cannot read ${relative(ROOT, file)}`);
    process.exit(1);
  }
}

// ─── load tokens ─────────────────────────────────────────────────────────────

const tokenSrc = read(TOKENS_FILE);
const tokenConsts = constMap(tokenSrc);

/** Scheme objects are matched by their declaration, not by name order. */
function loadScheme(declMarkers) {
  for (const marker of declMarkers) {
    const body = objectAfter(tokenSrc, marker);
    if (body) return body;
  }
  return null;
}

const SCHEME_BODIES = {
  light: loadScheme(['const LIGHT: SemanticTokens =', 'const LIGHT =', 'light:']),
  dark: loadScheme(['const DARK: SemanticTokens =', 'const DARK =', 'dark:']),
};

const TOKENS = {};
for (const [scheme, body] of Object.entries(SCHEME_BODIES)) {
  if (!body) {
    console.error(`contrast-audit: could not locate the ${scheme} token object in constants/tokens.ts`);
    process.exit(1);
  }
  TOKENS[scheme] = new Proxy(
    {},
    {
      get: (_t, key) => (typeof key === 'string' ? readKey(body, key, tokenConsts) : null),
    }
  );
}

/** Resolve a token name to an opaque colour as rendered on `backdropName`. */
function color(scheme, name, backdropName) {
  const raw = TOKENS[scheme][name];
  if (raw == null) {
    console.error(`contrast-audit: token "${name}" missing from the ${scheme} scheme`);
    process.exit(1);
  }
  const parsed = parseColor(raw);
  if (!parsed) {
    console.error(`contrast-audit: token "${name}" in ${scheme} has an unparseable value: ${raw}`);
    process.exit(1);
  }
  if (parsed.a >= 1) return parsed;
  // Translucent tokens are flattened onto whatever they actually sit on — the
  // pair's own background, falling back to the page bg for backgrounds themselves.
  const under = backdropName ? color(scheme, backdropName, null) : parseColor(TOKENS[scheme].bg);
  return flatten(parsed, under);
}

// ─── load persona accents ────────────────────────────────────────────────────

const personaSrc = read(PERSONA_FILE);
const personaConsts = constMap(personaSrc);

function loadPersonas() {
  const out = [];
  const re = /const\s+([A-Z0-9_]+)\s*:\s*PersonaTheme\s*=/g;
  let m;
  while ((m = re.exec(personaSrc))) {
    const body = objectAfter(personaSrc, m[0]);
    if (!body) continue;
    const accent = readKey(body, 'accent', personaConsts);
    if (!accent) continue;
    out.push({
      id: readKey(body, 'id', personaConsts) ?? m[1].toLowerCase(),
      accent,
      accentDark: readKey(body, 'accentDark', personaConsts),
      accentText: readKey(body, 'accentText', personaConsts),
      ink: readKey(body, 'ink', personaConsts),
      inkDark: readKey(body, 'inkDark', personaConsts),
    });
  }
  return out;
}

const PERSONAS = loadPersonas();

// ─── the checks ──────────────────────────────────────────────────────────────

// [foreground, background, minimum ratio]
const PAIRS = [
  ['text', 'bg', 4.5],
  ['textSecondary', 'bg', 4.5],
  // Full 4.5:1 — NOT the large-text allowance. Bold Canvas spends this token on
  // 8-9px mono labels (BigStat captions, Section headers, Crown eyebrows), and
  // those are the smallest type in the app, not metadata that can afford to be faint.
  ['textTertiary', 'bg', 4.5],
  ['accentText', 'bg', 4.5],
  ['accentInk', 'accent', 4.5],
  ['crownText', 'crown', 4.5],
  ['crownTextDim', 'crown', 3.0],
  ['crownAccent', 'crown', 3.0],
  ['tabActive', 'tabBar', 4.5],
  ['tabInactive', 'tabBar', 3.0],
  ['danger', 'bg', 3.0],
  ['warning', 'bg', 3.0],
  ['info', 'bg', 3.0],
  ['success', 'bg', 3.0],
];

const rows = [];
let fallbacks = 0;

for (const scheme of ['light', 'dark']) {
  for (const [fg, bg, min] of PAIRS) {
    const ratio = contrast(color(scheme, fg, bg), color(scheme, bg, null));
    rows.push({ group: `tokens:${scheme}`, pair: `${fg} / ${bg}`, scheme, ratio, min });
  }
}

// A persona `accent` is a FILL (button, ring, chip) — WCAG 1.4.11 asks 3:1 of a
// non-text UI element, not the 4.5:1 owed to text. The text cases are measured
// separately and STRICTLY: `ink` sitting on the fill, and `accentText` used as
// type on the page. Measuring the brand fill as if it were text is what pushed
// an earlier pass into darkening #12B981 away — the brand was never the defect.
for (const scheme of ['light', 'dark']) {
  const bg = color(scheme, 'bg', null);
  for (const p of PERSONAS) {
    // accentDark is the dark-scheme variant; until it exists the app renders
    // `accent` on both, so that is what gets measured.
    const missing = scheme === 'dark' && !p.accentDark;
    const raw = scheme === 'light' ? p.accent : p.accentDark ?? p.accent;
    if (missing) fallbacks++;
    const parsed = parseColor(raw);
    if (!parsed) {
      console.error(`contrast-audit: persona "${p.id}" has an unparseable accent: ${raw}`);
      process.exit(1);
    }
    const fill = flatten(parsed, bg);
    // SC 1.4.11 wants 3:1 for the BOUNDARY that identifies a control. A brand fill
    // lighter than that stays brand — it gets a hairline outline in the persona's
    // deep tone instead, and the outline is what is measured. See ACCENT_OUTLINE
    // in constants/tokens.ts; any emerald-family fill on a light page must carry it.
    const outlineRaw = scheme === 'light' ? p.accentText ?? p.accent : p.accentDark ?? p.accent;
    const outline = parseColor(outlineRaw);
    const fillRatio = contrast(fill, bg);
    const outlined = outline && fillRatio < 3.0;
    rows.push({
      group: `persona:${scheme}`,
      pair: `persona:${p.id}.${scheme === 'light' ? 'accent' : 'accentDark'}${missing ? '*' : ''} / bg  [${outlined ? 'fill+outline' : 'fill'}]`,
      scheme,
      ratio: outlined ? contrast(flatten(outline, bg), bg) : fillRatio,
      min: 3.0,
    });

    // Text ON the fill — this is the one that decides whether a label is readable.
    const inkRaw = scheme === 'light' ? p.ink : p.inkDark ?? p.ink;
    const ink = inkRaw && parseColor(inkRaw);
    if (ink) {
      rows.push({
        group: `persona:${scheme}`,
        pair: `persona:${p.id}.ink / accent  [text on fill]`,
        scheme,
        ratio: contrast(flatten(ink, fill), fill),
        min: 4.5,
      });
    }

    // The accent used AS text on the page. Falls back to `accent`, so a persona
    // that omits accentText is still held to the full 4.5:1 here.
    const textRaw = scheme === 'light' ? p.accentText ?? p.accent : p.accentDark ?? p.accent;
    const asText = parseColor(textRaw);
    if (asText) {
      rows.push({
        group: `persona:${scheme}`,
        pair: `persona:${p.id}.accentText / bg  [as text]`,
        scheme,
        ratio: contrast(flatten(asText, bg), bg),
        min: 4.5,
      });
    }
  }
}

// ─── report ──────────────────────────────────────────────────────────────────

const HEAD = { pair: 'PAIR', scheme: 'SCHEME', ratio: 'RATIO', min: 'REQUIRED', res: 'RESULT' };
const fmt = (r) => ({
  pair: r.pair,
  scheme: r.scheme,
  ratio: `${r.ratio.toFixed(2)}:1`,
  min: `${r.min.toFixed(1)}:1`,
  res: r.ratio >= r.min ? 'PASS' : 'FAIL',
});

const cells = rows.map((r) => ({ ...fmt(r), group: r.group }));
const w = (k) => Math.max(HEAD[k].length, ...cells.map((c) => c[k].length));
const W = { pair: w('pair'), scheme: w('scheme'), ratio: w('ratio'), min: w('min'), res: w('res') };
const line = (c) =>
  `${c.pair.padEnd(W.pair)} | ${c.scheme.padEnd(W.scheme)} | ${c.ratio.padStart(W.ratio)} | ` +
  `${c.min.padStart(W.min)} | ${c.res}`;

console.log('');
console.log('Bold Canvas — WCAG contrast audit');
console.log(`  ${relative(ROOT, TOKENS_FILE).replace(/\\/g, '/')}`);
console.log(`  ${relative(ROOT, PERSONA_FILE).replace(/\\/g, '/')}  (${PERSONAS.length} personas)`);
console.log('');
console.log(line(HEAD));
console.log('-'.repeat(W.pair + W.scheme + W.ratio + W.min + W.res + 12));

let prev = null;
for (const c of cells) {
  if (prev && prev !== c.group) console.log('');
  console.log(line(c));
  prev = c.group;
}

const failed = rows.filter((r) => r.ratio < r.min);
console.log('');
if (fallbacks) {
  console.log(`* personaTheme.ts defines no accentDark — ${fallbacks} dark row(s) measured against \`accent\`.`);
}
console.log(`${rows.length} checks · ${rows.length - failed.length} pass · ${failed.length} fail`);
if (failed.length) {
  for (const f of failed) {
    console.log(`  FAIL  ${f.pair} (${f.scheme}) ${f.ratio.toFixed(2)}:1 < ${f.min.toFixed(1)}:1`);
  }
}
console.log('');
process.exit(failed.length ? 1 : 0);
