/**
 * generate-og-image.js — Produces the Open Graph image for atleato.com.
 *
 * Output: docs/og-image.png  (1200×630 — Facebook/Twitter/LinkedIn canonical)
 *
 * Same SVG pipeline as the app icon: synth in SVG, rasterise via sharp.
 */
const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const OG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#0a0b0d"/>
      <stop offset="100%" stop-color="#15171b"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%"  stop-color="rgba(255,107,53,0.32)"/>
      <stop offset="100%" stop-color="rgba(255,107,53,0)"/>
    </radialGradient>
    <linearGradient id="orange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ff6b35"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
  </defs>

  <!-- bg + glow -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Mark (the A icon) — left side, vertically centred -->
  <g transform="translate(80, 175) scale(2.8)">
    <polygon points="50,8 14,92 30,92 50,42 70,92 86,92" fill="url(#orange)"/>
    <rect x="29" y="64" width="42" height="6" rx="3" fill="#0a0b0d"/>
  </g>

  <!-- Wordmark "Atleato" + ™ -->
  <text x="430" y="240"
        font-family="Inter, sans-serif" font-weight="900"
        font-size="118" letter-spacing="-3" fill="#fafafa">Atleato</text>
  <text x="935" y="180"
        font-family="JetBrains Mono, monospace" font-weight="700"
        font-size="32" fill="#9ca3af">™</text>

  <!-- Tagline -->
  <text x="430" y="320"
        font-family="JetBrains Mono, monospace" font-weight="700"
        font-size="34" letter-spacing="6" fill="#ff6b35">YOUR COACH CALLS.</text>

  <!-- Sub-tagline -->
  <text x="430" y="385"
        font-family="Inter, sans-serif" font-weight="500"
        font-size="24" fill="#9ca3af">5 world-class coaches. Live form check.</text>
  <text x="430" y="420"
        font-family="Inter, sans-serif" font-weight="500"
        font-size="24" fill="#9ca3af">Real wake-up calls. No excuses.</text>

  <!-- Bottom strip -->
  <rect x="0" y="610" width="1200" height="6" fill="url(#orange)"/>
  <text x="80" y="580"
        font-family="JetBrains Mono, monospace" font-weight="700"
        font-size="18" letter-spacing="3" fill="#6b7280">ATLEATO.COM</text>
  <text x="1120" y="580" text-anchor="end"
        font-family="JetBrains Mono, monospace" font-weight="500"
        font-size="14" letter-spacing="2" fill="#6b7280">JOIN THE WAITLIST →</text>
</svg>
`.trim();

(async () => {
  const outPath = path.join(__dirname, '..', 'docs', 'og-image.png');
  await sharp(Buffer.from(OG_SVG)).png().toFile(outPath);
  const bytes = fs.statSync(outPath).size;
  console.log(`✓ ${path.relative(process.cwd(), outPath)}  ${(bytes / 1024).toFixed(1)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
