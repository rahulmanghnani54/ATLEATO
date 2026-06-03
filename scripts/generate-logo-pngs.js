const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const logoDir = path.join(__dirname, '..', 'assets', 'logo');

const icon = fs.readFileSync(path.join(logoDir, 'logo-icon.svg'));
const iconWhite = fs.readFileSync(path.join(logoDir, 'logo-icon-white.svg'));
const full = fs.readFileSync(path.join(logoDir, 'logo-full.svg'));

const sizes = [
  { name: 'logo-icon-48.png', src: icon, w: 48, h: 48 },
  { name: 'logo-icon-128.png', src: icon, w: 128, h: 128 },
  { name: 'logo-icon-512.png', src: icon, w: 512, h: 512 },
  { name: 'logo-icon-1024.png', src: icon, w: 1024, h: 1024 },
  { name: 'logo-icon-white-512.png', src: iconWhite, w: 512, h: 512 },
  { name: 'logo-full-512.png', src: full, w: 2048, h: 512 },
];

(async () => {
  for (const s of sizes) {
    await sharp(s.src).resize(s.w, s.h).png().toFile(path.join(logoDir, s.name));
    console.log('OK', s.name);
  }
})().catch((err) => {
  console.error('Logo generation failed:', err);
  process.exit(1);
});
