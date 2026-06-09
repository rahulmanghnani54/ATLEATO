// Generate 1600x1200 (4:3) marketing PNGs for Lemon Squeezy / Stripe product images.
// Run: node scripts/gen-marketing-images.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'assets', 'marketing');
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1600, H = 1200;

// Reusable: Atleato A logo (orange gradient + crossbar cutout)
function logoA(x, y, size, barColor = '#0a0b0d') {
  const s = size / 100;
  // polygon: 50,8 14,92 30,92 50,42 70,92 86,92 → scaled by s and offset
  const p = (px, py) => `${(x + px * s).toFixed(1)},${(y + py * s).toFixed(1)}`;
  return `
    <polygon points="${p(50,8)} ${p(14,92)} ${p(30,92)} ${p(50,42)} ${p(70,92)} ${p(86,92)}" fill="url(#logoGrad)"/>
    <rect x="${x + 29*s}" y="${y + 64*s}" width="${42*s}" height="${6*s}" rx="${3*s}" fill="${barColor}"/>
  `;
}

const defs = `
  <defs>
    <linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8050"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0b0d"/>
      <stop offset="100%" stop-color="#1a1c22"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ff6b35" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ff6b35" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="orangeText" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8050"/>
      <stop offset="100%" stop-color="#e84d20"/>
    </linearGradient>
  </defs>
`;

// ── Image 1: HERO — "VIP Vanguard Pass — Atleato" ──
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <circle cx="${W/2}" cy="${H/2}" r="700" fill="url(#glow)"/>
  ${logoA(W/2 - 130, 220, 260)}
  <text x="${W/2}" y="660" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="120" font-weight="900" fill="#ffffff" letter-spacing="-3">VIP VANGUARD PASS</text>
  <text x="${W/2}" y="780" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-size="56" font-weight="800" fill="url(#orangeText)" letter-spacing="6">1 OF 500 · LIFETIME ACCESS</text>
  <line x1="${W/2 - 200}" y1="850" x2="${W/2 + 200}" y2="850" stroke="#ff6b35" stroke-width="3"/>
  <text x="${W/2}" y="930" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="38" font-weight="500" fill="#8b909a">Train under a legend. Your coach calls.</text>
  <text x="${W/2}" y="1100" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="26" font-weight="700" fill="#d4ff3d" letter-spacing="4">$1.99 · ATLEATO.COM</text>
</svg>`;

// ── Image 2: 5 COACHES LINEUP ──
const coaches = [
  { name: 'THE SCULPTOR',  tag: 'Classic Physique',  color: '#c8ff3d', ini: 'TS' },
  { name: 'THE GOVERNOR',  tag: 'Golden Era',        color: '#f5b942', ini: 'TG' },
  { name: 'THE SCIENTIST', tag: 'Evidence-Based',    color: '#5DD3FA', ini: 'SC' },
  { name: 'THE COMMANDER', tag: 'No Excuses',        color: '#ef4444', ini: 'CM' },
  { name: 'DR. GROWTH',    tag: 'Hypertrophy',       color: '#7be38c', ini: 'DG' },
];
const coachCards = coaches.map((c, i) => {
  const x = 100 + (i % 3) * 480;
  const y = 380 + Math.floor(i / 3) * 320;
  return `
    <rect x="${x}" y="${y}" width="440" height="270" rx="20" fill="#15171b" stroke="${c.color}" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="6" height="270" fill="${c.color}"/>
    <circle cx="${x + 80}" cy="${y + 90}" r="50" fill="${c.color}" opacity="0.15"/>
    <circle cx="${x + 80}" cy="${y + 90}" r="50" fill="none" stroke="${c.color}" stroke-width="3"/>
    <text x="${x + 80}" y="${y + 105}" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="32" font-weight="900" fill="${c.color}">${c.ini}</text>
    <text x="${x + 160}" y="${y + 85}" font-family="Arial Black, sans-serif" font-size="32" font-weight="900" fill="${c.color}" letter-spacing="1">${c.name}</text>
    <text x="${x + 160}" y="${y + 125}" font-family="-apple-system, sans-serif" font-size="22" fill="#8b909a">${c.tag}</text>
    <line x1="${x + 30}" y1="${y + 180}" x2="${x + 410}" y2="${y + 180}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${x + 30}" y="${y + 225}" font-family="JetBrains Mono, monospace" font-size="18" fill="#5d626b" letter-spacing="2">UNIQUE VOICE · STYLE · PROGRAM</text>
  `;
}).join('');
const lineup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="${'#0a0b0d'}"/>
  ${logoA(80, 80, 110)}
  <text x="220" y="155" font-family="Arial Black, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-1">Atleato</text>
  <text x="${W - 80}" y="155" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="22" fill="#8b909a" letter-spacing="3">// YOUR LINEUP</text>
  <text x="100" y="290" font-family="Arial Black, sans-serif" font-size="96" font-weight="900" fill="#ffffff" letter-spacing="-3">5 LEGENDS. <tspan fill="url(#orangeText)">1 APP.</tspan></text>
  ${coachCards}
  <text x="${W/2}" y="1130" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="32" fill="#8b909a">App transforms around your pick — colors, programs, voice, nutrition.</text>
</svg>`;

// ── Image 3: WAKE-UP CALL ──
const callImg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="${'#0a0b0d'}"/>
  <radialGradient id="redGlow" cx="50%" cy="40%" r="50%">
    <stop offset="0%" stop-color="#ef4444" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
  </radialGradient>
  <ellipse cx="${W/2}" cy="500" rx="900" ry="600" fill="url(#redGlow)"/>
  ${logoA(80, 80, 110)}
  <text x="220" y="155" font-family="Arial Black, sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="-1">Atleato</text>
  <!-- Phone frame -->
  <rect x="${W/2 - 200}" y="320" width="400" height="700" rx="50" fill="#15171b" stroke="#1d2026" stroke-width="6"/>
  <!-- Call pulse rings -->
  <circle cx="${W/2}" cy="500" r="120" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.5"/>
  <circle cx="${W/2}" cy="500" r="160" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.3"/>
  <circle cx="${W/2}" cy="500" r="200" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.15"/>
  <!-- Avatar -->
  <circle cx="${W/2}" cy="500" r="80" fill="url(#redGrad)" stroke="#ef4444" stroke-width="3"/>
  <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#b91c1c"/>
  </linearGradient>
  <text x="${W/2}" y="518" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="38" font-weight="900" fill="#ffffff">CM</text>
  <!-- Caller info -->
  <text x="${W/2}" y="660" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="32" font-weight="900" fill="#ffffff" letter-spacing="2">THE COMMANDER</text>
  <text x="${W/2}" y="695" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="16" fill="#ef9090" letter-spacing="3">INCOMING · 05:00 AM</text>
  <!-- Buttons -->
  <rect x="${W/2 - 160}" y="850" width="140" height="60" rx="15" fill="#ef4444" opacity="0.2" stroke="#ef4444" stroke-width="2"/>
  <text x="${W/2 - 90}" y="888" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="18" fill="#ff9090">SNOOZE</text>
  <rect x="${W/2 + 20}" y="850" width="140" height="60" rx="15" fill="#39e08a"/>
  <text x="${W/2 + 90}" y="888" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="18" fill="#0a0b0d" font-weight="900">ANSWER</text>
  <!-- Headline -->
  <text x="100" y="270" font-family="Arial Black, sans-serif" font-size="84" font-weight="900" fill="#ffffff" letter-spacing="-3">YOUR COACH <tspan fill="url(#orangeText)">CALLS.</tspan></text>
  <text x="100" y="1110" font-family="-apple-system, sans-serif" font-size="26" fill="#8b909a">Not a notification you can swipe away — an actual incoming call.</text>
  <text x="100" y="1150" font-family="-apple-system, sans-serif" font-size="26" fill="#8b909a">Decline → coach rings back in 5 min. No excuses.</text>
</svg>`;

// ── Image 4: CTA — "$1.99 LOCKS YOUR SPOT" ──
const cta = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="${'#0a0b0d'}"/>
  <circle cx="${W/2}" cy="${H/2}" r="700" fill="url(#glow)"/>
  ${logoA(W/2 - 75, 130, 150)}
  <text x="${W/2}" y="430" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="32" font-weight="700" fill="#d4ff3d" letter-spacing="8">VIP VANGUARD · 1 OF 500</text>
  <text x="${W/2}" y="600" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="180" font-weight="900" fill="url(#orangeText)" letter-spacing="-6">$1.99</text>
  <text x="${W/2}" y="680" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="32" fill="#8b909a">one-time · locks lifetime founder pricing</text>
  <!-- Feature row -->
  <g font-family="-apple-system, sans-serif" font-size="26" fill="#ffffff">
    <text x="${W/2 - 480}" y="830">✓ Unique 1-of-500 generative badge</text>
    <text x="${W/2 + 60}"  y="830">✓ 1 month free Legend tier ($19.99)</text>
    <text x="${W/2 - 480}" y="880">✓ Beta access on launch day</text>
    <text x="${W/2 + 60}"  y="880">✓ Founder-circle community</text>
    <text x="${W/2 - 480}" y="930">✓ Lifetime 50% off all upgrades</text>
    <text x="${W/2 + 60}"  y="930">✓ Refundable until launch (Q3 '26)</text>
  </g>
  <!-- CTA button -->
  <rect x="${W/2 - 280}" y="1010" width="560" height="110" rx="25" fill="#d4ff3d"/>
  <text x="${W/2}" y="1082" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="44" font-weight="900" fill="#0a0b0d" letter-spacing="2">CONFIRM MY PASS →</text>
</svg>`;

const images = [
  ['01-hero-vip-pass.png',       hero,    'Hero: VIP Vanguard Pass branding'],
  ['02-5-legend-coaches.png',    lineup,  '5 Coach Lineup'],
  ['03-your-coach-calls.png',    callImg, 'Wake-Up Call feature'],
  ['04-cta-1-99-lifetime.png',   cta,     'CTA: $1.99 lifetime'],
];

(async () => {
  for (const [filename, svg, desc] of images) {
    const dst = path.join(OUT_DIR, filename);
    try {
      await sharp(Buffer.from(svg), { density: 150 })
        .resize(W, H)
        .png({ compressionLevel: 9 })
        .toFile(dst);
      const stat = fs.statSync(dst);
      console.log(`OK  ${filename.padEnd(34)} ${(stat.size/1024).toFixed(1)}KB · ${desc}`);
    } catch (e) {
      console.error(`FAIL ${filename}: ${e.message}`);
    }
  }
  console.log(`\nDone. 4 marketing images at ${W}x${H} (4:3) in docs/assets/marketing/`);
})();
