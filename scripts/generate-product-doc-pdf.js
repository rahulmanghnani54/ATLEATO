// Render docs/product-documentation.html as a 23-page A4 PDF.
// Output: docs/assets/marketing/atleato-product-documentation.pdf
// Run: node scripts/generate-product-doc-pdf.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'assets', 'marketing');
fs.mkdirSync(OUT, { recursive: true });
const SRC = 'file:///' + path.join(__dirname, '..', 'docs', 'product-documentation.html').replace(/\\/g, '/');
const DST = path.join(OUT, 'atleato-product-documentation.pdf');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(SRC, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));

  await page.pdf({
    path: DST,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });

  await browser.close();
  const stat = fs.statSync(DST);
  console.log(`OK  atleato-product-documentation.pdf  ${(stat.size/1024).toFixed(1)}KB`);
})();
