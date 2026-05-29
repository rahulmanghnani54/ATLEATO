/**
 * generate-ringtone.js — Produces bundled wake-up ringtone WAVs.
 *
 * Output (5 files, ~1.3 MB total):
 *   assets/sounds/wakeup-ring.wav      — default (classic US dual-tone)
 *   assets/sounds/ring-classic.wav     — 440/480 Hz, gentle phone ringback
 *   assets/sounds/ring-old-bell.wav    — 440/640 Hz, telephone-y bell
 *   assets/sounds/ring-soft.wav        — single 880 Hz tone with long fades
 *   assets/sounds/ring-alert.wav       — alternating 880/1320 Hz emergency
 *   assets/sounds/ring-gym.wav         — low 200 Hz boxing-bell hit
 *
 * Each is mono 16-bit 22050 Hz PCM. Re-runnable with:
 *   node scripts/generate-ringtone.js
 */
const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const TOTAL_SEC   = 6;     // one full cycle that loops cleanly

function generate(opts) {
  const totalSamples = SAMPLE_RATE * TOTAL_SEC;
  const samples = new Int16Array(totalSamples);
  const onSamples  = Math.round(SAMPLE_RATE * opts.onSec);
  const fade       = Math.round(SAMPLE_RATE * opts.fadeSec);

  for (let i = 0; i < onSamples; i++) {
    const t = i / SAMPLE_RATE;
    const tone = opts.synth(t);
    let env = 1;
    if (i < fade)                env = i / fade;
    else if (i > onSamples - fade) env = Math.max(0, (onSamples - i) / fade);
    samples[i] = Math.round(tone * opts.volume * env * 32767);
  }

  return samples;
}

function writeWav(filename, samples) {
  const dataSize  = samples.length * 2;
  const totalSize = 44 + dataSize;
  const buf = Buffer.alloc(totalSize);
  let o = 0;
  buf.write('RIFF', o);                o += 4;
  buf.writeUInt32LE(totalSize - 8, o); o += 4;
  buf.write('WAVE', o);                o += 4;
  buf.write('fmt ', o);                o += 4;
  buf.writeUInt32LE(16, o);            o += 4;
  buf.writeUInt16LE(1, o);             o += 2;
  buf.writeUInt16LE(1, o);             o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o);   o += 4;
  buf.writeUInt32LE(SAMPLE_RATE * 2, o); o += 4;
  buf.writeUInt16LE(2, o);             o += 2;
  buf.writeUInt16LE(16, o);            o += 2;
  buf.write('data', o);                o += 4;
  buf.writeUInt32LE(dataSize, o);      o += 4;
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], o);
    o += 2;
  }
  const outPath = path.join(__dirname, '..', 'assets', 'sounds', filename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`✓ ${filename.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
}

// ── Variant 1 · CLASSIC — 440/480 Hz dual-tone (the default) ───────────────
writeWav('ring-classic.wav', generate({
  onSec: 2, fadeSec: 0.04, volume: 0.45,
  synth: (t) => (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.5,
}));

// ── Variant 2 · OLD BELL — 440/640 Hz, more telephone-y ─────────────────────
writeWav('ring-old-bell.wav', generate({
  onSec: 2.5, fadeSec: 0.08, volume: 0.5,
  synth: (t) => {
    // Add a slight beat/tremolo for the bell feel
    const trem = 1 + 0.15 * Math.sin(2 * Math.PI * 7 * t);
    return ((Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 640 * t)) * 0.5) * trem;
  },
}));

// ── Variant 3 · SOFT CHIME — single tone with long fades, gentle wake ───────
writeWav('ring-soft.wav', generate({
  onSec: 3, fadeSec: 0.5, volume: 0.4,
  synth: (t) => Math.sin(2 * Math.PI * 880 * t),
}));

// ── Variant 4 · ALERT — alternating 880/1320 Hz, hard to ignore ─────────────
writeWav('ring-alert.wav', generate({
  onSec: 2, fadeSec: 0.02, volume: 0.55,
  synth: (t) => {
    // Switch tones every 100ms
    const which = Math.floor(t / 0.1) % 2;
    return Math.sin(2 * Math.PI * (which ? 1320 : 880) * t);
  },
}));

// ── Variant 5 · GYM BELL — low 200 Hz boxing bell with harmonics ────────────
writeWav('ring-gym.wav', generate({
  onSec: 1.5, fadeSec: 0.02, volume: 0.6,
  synth: (t) => {
    // Decaying bell: fundamental + overtones decay over the on-period
    const decay = Math.exp(-t * 1.8);
    return (
      Math.sin(2 * Math.PI * 200 * t) * 0.5 +
      Math.sin(2 * Math.PI * 400 * t) * 0.3 +
      Math.sin(2 * Math.PI * 600 * t) * 0.2
    ) * decay;
  },
}));

// ── Default (alias for the classic — keeps backward compat) ────────────────
writeWav('wakeup-ring.wav', generate({
  onSec: 2, fadeSec: 0.04, volume: 0.45,
  synth: (t) => (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.5,
}));

console.log('\nDone. 5 ringtones + default in assets/sounds/');
