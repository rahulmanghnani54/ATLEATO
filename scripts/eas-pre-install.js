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

// Two destinations for the one file. The project-root copy is what Expo's
// `googleServicesFile` plugin would consume during prebuild; but this is a
// BARE project (android/ is committed), so EAS never runs prebuild and the
// plugin never copies it into place. The Gradle google-services plugin reads
// android/app/google-services.json directly — and that path is gitignored, so
// on an EAS worker it does not exist unless we put it there ourselves.
// (First EAS build 2026-09-18 failed exactly here.)
const TARGETS = [
  {
    envVar: 'GOOGLE_SERVICES_JSON',
    destination: path.join(__dirname, '..', 'google-services.json'),
    label: 'google-services.json (project root, for Expo plugin)',
  },
  {
    envVar: 'GOOGLE_SERVICES_JSON',
    destination: path.join(__dirname, '..', 'android', 'app', 'google-services.json'),
    label: 'android/app/google-services.json (read by the Gradle google-services plugin)',
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
    // On the worker only the git-tracked subset of android/ exists, so the
    // destination directory may not (2026-09-18: android/app/ was absent →
    // ENOENT). copyFileSync does not create parents.
    fs.mkdirSync(path.dirname(t.destination), { recursive: true });
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
