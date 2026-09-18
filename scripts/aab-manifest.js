#!/usr/bin/env node
/**
 * Print the manifest of an Android App Bundle without bundletool.
 *
 * An .aab stores base/manifest/AndroidManifest.xml as an aapt2 protobuf
 * (XmlNode), not binary XML, so aapt2/apkanalyzer cannot read it and bundletool
 * is a 50 MB download. This walks the protobuf wire format directly and prints
 * what a Play reviewer sees: package/version, <uses-permission> (with
 * maxSdkVersion), <uses-feature>, application flags and exported components.
 *
 *   node scripts/aab-manifest.js path/to/app.aab
 *   node scripts/aab-manifest.js path/to/AndroidManifest.xml   (already extracted)
 *
 * Used by scripts/verify-aab.sh; safe to run on any bundle.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const input = process.argv[2];
if (!input) {
  console.error('usage: aab-manifest.js <app.aab | AndroidManifest.xml>');
  process.exit(2);
}

let buf;
if (input.toLowerCase().endsWith('.aab')) {
  // The manifest entry is stored DEFLATE-compressed; unzip is on every dev
  // machine here (Git Bash, WSL, macOS, Linux) and on EAS workers.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-'));
  execFileSync('unzip', ['-o', '-q', input, 'base/manifest/AndroidManifest.xml', '-d', tmp]);
  buf = fs.readFileSync(path.join(tmp, 'base', 'manifest', 'AndroidManifest.xml'));
  fs.rmSync(tmp, { recursive: true, force: true });
} else {
  buf = fs.readFileSync(input);
}

// --- minimal protobuf wire decoder -----------------------------------------
function readVarint(b, p) {
  let r = 0n, s = 0n, i = p;
  for (;;) {
    const c = b[i++];
    r |= BigInt(c & 0x7f) << s;
    if (!(c & 0x80)) break;
    s += 7n;
  }
  return [r, i];
}
function fields(b) {
  const out = [];
  let p = 0;
  while (p < b.length) {
    let key;
    [key, p] = readVarint(b, p);
    const num = Number(key >> 3n), wt = Number(key & 7n);
    if (wt === 0) { let v; [v, p] = readVarint(b, p); out.push({ num, val: v }); }
    else if (wt === 1) { out.push({ num, val: b.subarray(p, p + 8) }); p += 8; }
    else if (wt === 2) { let l; [l, p] = readVarint(b, p); const n = Number(l); out.push({ num, val: b.subarray(p, p + n) }); p += n; }
    else if (wt === 5) { out.push({ num, val: b.subarray(p, p + 4) }); p += 4; }
    else throw new Error(`unsupported wire type ${wt} at offset ${p}`);
  }
  return out;
}
const str = (b) => b.toString('utf8');

// aapt2 Resources.proto: XmlNode{element=1} XmlElement{name=3, attribute=4, child=5}
// XmlAttribute{namespace_uri=1, name=2, value=3}
function parseAttr(b) {
  const a = { name: '', value: '' };
  for (const f of fields(b)) {
    if (f.num === 2) a.name = str(f.val);
    else if (f.num === 3) a.value = str(f.val);
  }
  return a;
}
function parseElement(b) {
  const e = { name: '', attrs: [], children: [] };
  for (const f of fields(b)) {
    if (f.num === 3) e.name = str(f.val);
    else if (f.num === 4) e.attrs.push(parseAttr(f.val));
    else if (f.num === 5) { const c = parseNode(f.val); if (c) e.children.push(c); }
  }
  return e;
}
function parseNode(b) {
  for (const f of fields(b)) if (f.num === 1) return parseElement(f.val);
  return null;
}

// --- report -----------------------------------------------------------------
const root = parseNode(buf);
const attr = (el, n) => (el.attrs.find((a) => a.name === n) || {}).value;

console.log(`<${root.name}> package=${attr(root, 'package')} versionCode=${attr(root, 'versionCode')} versionName=${attr(root, 'versionName')} compileSdk=${attr(root, 'compileSdkVersion')}`);
const sdk = root.children.find((c) => c.name === 'uses-sdk');
if (sdk) console.log(`uses-sdk min=${attr(sdk, 'minSdkVersion')} target=${attr(sdk, 'targetSdkVersion')}`);

console.log('\n-- uses-permission --');
const perms = root.children
  .filter((c) => c.name === 'uses-permission' || c.name === 'uses-permission-sdk-23')
  .map((c) => ({ name: attr(c, 'name'), max: attr(c, 'maxSdkVersion') }))
  .sort((a, b) => a.name.localeCompare(b.name));
for (const p of perms) console.log(p.name + (p.max ? `  (maxSdkVersion=${p.max})` : ''));
console.log(`(${perms.length} total)`);

const feats = root.children.filter((c) => c.name === 'uses-feature');
if (feats.length) {
  console.log('\n-- uses-feature --');
  for (const f of feats) console.log(`${attr(f, 'name') || 'glEsVersion=' + attr(f, 'glEsVersion')} required=${attr(f, 'required') ?? 'true'}`);
}

const app = root.children.find((c) => c.name === 'application');
if (app) {
  console.log('\n-- application --');
  for (const k of ['label', 'allowBackup', 'debuggable', 'usesCleartextTraffic', 'extractNativeLibs', 'networkSecurityConfig']) {
    const v = attr(app, k);
    if (v !== undefined) console.log(`${k}=${v}`);
  }
  const exported = app.children.filter((c) => ['activity', 'activity-alias', 'service', 'receiver', 'provider'].includes(c.name) && attr(c, 'exported') === 'true');
  console.log(`exported components: ${exported.length}`);
  for (const c of exported) console.log(`  ${c.name} ${attr(c, 'name')}${attr(c, 'permission') ? '  perm=' + attr(c, 'permission') : ''}`);
}
