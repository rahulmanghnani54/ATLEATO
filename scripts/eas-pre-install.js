/**
 * eas-build-pre-install hook
 *
 * Runs on EAS Build workers BEFORE `npm install`. Used to materialize
 * gitignored secret files from EAS file environment variables.
 *
 * Required EAS env var (type=file, visibility=secret):
 *   GOOGLE_SERVICES_JSON  → the actual google-services.json content
 *
 * When EAS runs this script, $GOOGLE_SERVICES_JSON contains the on-disk
 * path to a temp file holding the env var contents. We copy it to the
 * project root where Expo's android plugin expects it (./google-services.json).
 *
 * Locally (not on EAS), this script is a no-op: the file already exists at
 * the destination (gitignored), the env var isn't set, and we skip.
 */
const fs = require('fs');
const path = require('path');

const TARGETS = [
  {
    envVar: 'GOOGLE_SERVICES_JSON',
    destination: path.join(__dirname, '..', 'google-services.json'),
    label: 'google-services.json (Firebase)',
  },
];

let allOk = true;
for (const t of TARGETS) {
  const srcPath = process.env[t.envVar];

  if (fs.existsSync(t.destination)) {
    console.log(`[pre-install] ${t.label}: already present at destination — skipping`);
    continue;
  }

  if (!srcPath) {
    console.warn(`[pre-install] ${t.label}: env var ${t.envVar} not set and destination missing`);
    console.warn(`  → on EAS, configure a FILE-type env var named ${t.envVar} (see docs)`);
    console.warn(`  → locally, place the actual file at ${t.destination}`);
    allOk = false;
    continue;
  }

  if (!fs.existsSync(srcPath)) {
    console.error(`[pre-install] ${t.label}: env var ${t.envVar}=${srcPath} but path doesn't exist`);
    allOk = false;
    continue;
  }

  try {
    fs.copyFileSync(srcPath, t.destination);
    const sizeKB = (fs.statSync(t.destination).size / 1024).toFixed(1);
    console.log(`[pre-install] ${t.label}: copied from $${t.envVar} to project root (${sizeKB} KB)`);
  } catch (e) {
    console.error(`[pre-install] ${t.label}: copy failed —`, e.message);
    allOk = false;
  }
}

if (!allOk) {
  console.error('[pre-install] one or more secret files missing — build will likely fail at prebuild step');
  process.exit(1);
}
console.log('[pre-install] all secret files materialized successfully');
