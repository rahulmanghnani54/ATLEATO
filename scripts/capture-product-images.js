// Capture each .card from docs/product-images.html as a 1600x1200 PNG.
// These ARE the actual welcome-email/upsell design — pixel-perfect Atleato brand.
// Run: node scripts/capture-product-images.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'assets', 'marketing');
fs.mkdirSync(OUT, { recursive: true });
const HTML = 'file:///' + path.join(__dirname, '..', 'docs', 'product-images.html').replace(/\\/g, '/');

const targets = [
  ['#img-01-hero',       '01-hero-vip-pass.png'],
  ['#img-02-coaches',    '02-5-legend-coaches.png'],
  ['#img-03-call',       '03-your-coach-calls.png'],
  ['#img-04-pass',       '04-cta-1-99-lifetime.png'],
  ['#img-05-form',       '05-ai-form-coach.png'],
  ['#img-06-nutrition',  '06-nutrition-macros.png'],
  ['#img-07-territory',  '07-territory-map.png'],
  ['#img-08-stats',      '08-stats-strip.png'],
  ['#img-09-start',      '09-60-second-start.png'],
  ['#img-10-closing',    '10-your-coach-calls.png'],
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });
  // Wait for fonts to finish loading so text isn't FOUT
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));

  for (const [selector, filename] of targets) {
    const el = await page.$(selector);
    if (!el) { console.error('NOT FOUND:', selector); continue; }
    const dst = path.join(OUT, filename);
    await el.screenshot({ path: dst, type: 'png', omitBackground: false });
    const stat = fs.statSync(dst);
    console.log(`OK  ${filename.padEnd(34)} ${(stat.size/1024).toFixed(1)}KB`);
  }

  await browser.close();
  console.log('\nDone. 4 images captured at 1600x1200 from the real Atleato design pages.');
})();
