/**
 * render-app-icon.js — Generates the Atleato app icon PNGs from SVG.
 *
 * Run with:  node scripts/render-app-icon.js
 *
 * Outputs:
 *   assets/icon.png             — 1024×1024 — main app icon (iOS + Android legacy)
 *   assets/adaptive-icon.png    — 1024×1024 — foreground for Android adaptive icon
 *                                              (the bg color is set in app.json
 *                                              to #ff6b35 so this PNG only
 *                                              renders the dark canvas + glyph,
 *                                              safe-zone padded)
 *   assets/splash-icon.png      —  512× 512 — splash screen mark (smaller, no bg)
 *   assets/notification-icon.png — 96×96   — white-only Android notification
 *                                              (silhouette of the A only)
 *   assets/favicon.png          —  64× 64  — web favicon
 *
 * After running, rebuild the app to see the new icon:
 *   npx expo prebuild --clean
 *   npx expo run:android
 */
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.resolve(__dirname, '..', 'assets');

/* ── The mark, as SVG ─────────────────────────────────────────────────── */

/**
 * Full app icon — dark background + orange A + form bar.
 * iOS already rounds corners for us, so the SVG itself is a square.
 */
const FULL_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ff6b35"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="65%" r="55%">
      <stop offset="0%"  stop-color="rgba(255,107,53,0.22)"/>
      <stop offset="100%" stop-color="rgba(255,107,53,0)"/>
    </radialGradient>
  </defs>

  <!-- dark canvas -->
  <rect width="100" height="100" fill="#0a0b0d"/>
  <!-- soft glow -->
  <rect width="100" height="100" fill="url(#glow)"/>

  <!-- The angular A: apex (50,8) → bottom-left (14,92) → inner-left (30,92)
       → centre-low (50,42) → inner-right (70,92) → bottom-right (86,92) -->
  <polygon points="50,8 14,92 30,92 50,42 70,92 86,92" fill="url(#gA)"/>

  <!-- Form bar — barbell at golden-ratio height -->
  <rect x="29" y="64" width="42" height="6" rx="3" fill="#0a0b0d"/>

  <!-- 5 subtle inner step lines (the 5 coaches) — kept faint so the mark stays clean -->
  <g opacity="0.18" fill="#0a0b0d">
    <rect x="36" y="50" width="28" height="1.6"/>
    <rect x="34" y="56" width="32" height="1.6"/>
    <rect x="32" y="62" width="36" height="1.6"/>
    <rect x="30" y="74" width="40" height="1.6"/>
    <rect x="28" y="80" width="44" height="1.6"/>
  </g>
</svg>
`.trim();

/**
 * Adaptive icon foreground — Android places this on top of a solid bg (set in
 * app.json to #0a0b0d). We keep the same A glyph but inset it inside the
 * 66% safe-zone Android requires (so the system can crop it to circle, squircle, etc.).
 *
 * Safe zone: glyph occupies ~66% of the canvas, centred.
 */
const ADAPTIVE_FG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="gAdapt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ff6b35"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
  </defs>
  <!-- transparent bg (the bg colour comes from app.json adaptiveIcon.backgroundColor) -->
  <g transform="translate(17 17) scale(0.66)">
    <polygon points="50,8 14,92 30,92 50,42 70,92 86,92" fill="url(#gAdapt)"/>
    <rect x="29" y="64" width="42" height="6" rx="3" fill="#0a0b0d"/>
  </g>
</svg>
`.trim();

/**
 * Splash screen mark — smaller, no glow, no inner rungs. Just the A + bar.
 */
const SPLASH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="gSplash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ff6b35"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
  </defs>
  <polygon points="50,8 14,92 30,92 50,42 70,92 86,92" fill="url(#gSplash)"/>
  <rect x="29" y="64" width="42" height="6" rx="3" fill="#0d0d0d"/>
</svg>
`.trim();

/**
 * Notification icon — Android requires a WHITE-only silhouette on a
 * transparent bg. The system tints it later.
 */
const NOTIFICATION_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 100 100">
  <polygon points="50,8 14,92 30,92 50,42 70,92 86,92" fill="#ffffff"/>
</svg>
`.trim();

/**
 * Favicon — same as splash mark but at 64px.
 */
const FAVICON_SVG = SPLASH_SVG.replace('width="512" height="512"', 'width="64" height="64"');

/* ── Render queue ────────────────────────────────────────────────────────── */

const renders = [
  { name: 'icon.png',              svg: FULL_ICON_SVG,   size: 1024 },
  { name: 'adaptive-icon.png',     svg: ADAPTIVE_FG_SVG, size: 1024 },
  { name: 'splash-icon.png',       svg: SPLASH_SVG,      size:  512 },
  { name: 'splash.png',            svg: FULL_ICON_SVG,   size: 1242 }, // legacy splash
  { name: 'notification-icon.png', svg: NOTIFICATION_SVG, size: 96  },
  { name: 'favicon.png',           svg: FAVICON_SVG,     size: 64  },
];

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const r of renders) {
    const outPath = path.join(OUT_DIR, r.name);
    await sharp(Buffer.from(r.svg))
      .resize(r.size, r.size)
      .png()
      .toFile(outPath);
    const bytes = fs.statSync(outPath).size;
    console.log(`✓ ${r.name.padEnd(24)} ${r.size}×${r.size}  (${(bytes / 1024).toFixed(1)} KB)`);
  }

  console.log('\nDone. Now rebuild the app to see the new icon:');
  console.log('  npx expo prebuild --clean');
  console.log('  npx expo run:android');
})().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
