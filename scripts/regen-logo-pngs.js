// Regenerate all logo PNG files from the updated SVGs in assets/logo/
// Run: node scripts/regen-logo-pngs.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const LOGO_DIR = path.join(__dirname, '..', 'assets', 'logo');

// [svg source, output png, width, height (null = match width for square)]
const jobs = [
  // logo-icon (orange A, transparent) — square sizes
  ['logo-icon.svg',       'logo-icon-1024.png',       1024, 1024],
  ['logo-icon.svg',       'logo-icon-512.png',        512,  512 ],
  ['logo-icon.svg',       'logo-icon-128.png',        128,  128 ],
  ['logo-icon.svg',       'logo-icon-48.png',         48,   48  ],

  // logo-icon-black (orange A on black square)
  ['logo-icon-black.svg', 'logo-icon-black-1024.png', 1024, 1024],
  ['logo-icon-black.svg', 'logo-icon-black-512.png',  512,  512 ],

  // logo-icon-white (white A transparent)
  ['logo-icon-white.svg', 'logo-icon-white-512.png',  512,  512 ],

  // logo-full (icon + black wordmark, transparent) — 4:1 ratio (400x100)
  ['logo-full.svg',       'logo-full-512.png',        2048, 512 ],

  // logo-full-black (icon + white wordmark on black bar)
  ['logo-full-black.svg', 'logo-full-black-512.png',  2048, 512 ],

  // logo-wordmark (just "Atleato" text, transparent)
  ['logo-wordmark.svg',   'logo-wordmark-512.png',    1638, 512 ],
];

(async () => {
  for (const [src, dst, w, h] of jobs) {
    const srcPath = path.join(LOGO_DIR, src);
    const dstPath = path.join(LOGO_DIR, dst);
    if (!fs.existsSync(srcPath)) {
      console.log(`SKIP (no src): ${src}`);
      continue;
    }
    try {
      await sharp(srcPath, { density: 400 })
        .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(dstPath);
      const stat = fs.statSync(dstPath);
      console.log(`OK  ${src.padEnd(24)} -> ${dst.padEnd(32)} (${w}x${h}, ${(stat.size/1024).toFixed(1)}KB)`);
    } catch (e) {
      console.error(`FAIL ${src}: ${e.message}`);
    }
  }
  console.log('\nDone. All PNGs in assets/logo/ regenerated from clean polygon-A SVGs.');
})();
