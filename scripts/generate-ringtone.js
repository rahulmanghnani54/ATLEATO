/**
 * generate-ringtone.js — Produces a US-style dual-tone phone ringtone WAV.
 *
 * Output: assets/sounds/wakeup-ring.wav  (~265 KB)
 *
 * Pattern: 2 seconds of 440 Hz + 480 Hz dual-tone, then 4 seconds silence.
 * The 6-second total loops cleanly via expo-av's isLooping flag, so the
 * user hears the classic ring-ring … pause … ring-ring cadence indefinitely
 * until they answer/decline or the 60-second auto-stop fires.
 *
 * Run:
 *   node scripts/generate-ringtone.js
 */
const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE   = 22050;
const RING_ON_SEC   = 2;
const RING_OFF_SEC  = 4;
const TOTAL_SEC     = RING_ON_SEC + RING_OFF_SEC;
const TOTAL_SAMPLES = SAMPLE_RATE * TOTAL_SEC;

const FREQ_A = 440;   // standard US ringback frequency
const FREQ_B = 480;
const VOLUME = 0.45;  // -7 dBFS — loud but not distorted on small speakers
const FADE   = Math.round(SAMPLE_RATE * 0.04); // 40ms fade in/out

const samples   = new Int16Array(TOTAL_SAMPLES);
const onSamples = SAMPLE_RATE * RING_ON_SEC;

for (let i = 0; i < onSamples; i++) {
  const t = i / SAMPLE_RATE;
  const tone = (Math.sin(2 * Math.PI * FREQ_A * t) + Math.sin(2 * Math.PI * FREQ_B * t)) * 0.5;
  // Anti-click envelope
  let env = 1;
  if (i < FADE) env = i / FADE;
  else if (i > onSamples - FADE) env = Math.max(0, (onSamples - i) / FADE);
  samples[i] = Math.round(tone * VOLUME * env * 32767);
}
// remaining samples are silence (Int16Array default 0)

// Write WAV header + samples
const DATA_SIZE  = samples.length * 2;
const TOTAL_SIZE = 44 + DATA_SIZE;
const buf = Buffer.alloc(TOTAL_SIZE);
let o = 0;
buf.write('RIFF', o);              o += 4;
buf.writeUInt32LE(TOTAL_SIZE - 8, o); o += 4;
buf.write('WAVE', o);              o += 4;
buf.write('fmt ', o);              o += 4;
buf.writeUInt32LE(16, o);          o += 4;
buf.writeUInt16LE(1, o);           o += 2;
buf.writeUInt16LE(1, o);           o += 2;
buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
buf.writeUInt32LE(SAMPLE_RATE * 2, o); o += 4;
buf.writeUInt16LE(2, o);           o += 2;
buf.writeUInt16LE(16, o);          o += 2;
buf.write('data', o);              o += 4;
buf.writeUInt32LE(DATA_SIZE, o);   o += 4;
for (let i = 0; i < samples.length; i++) {
  buf.writeInt16LE(samples[i], o);
  o += 2;
}

const outPath = path.join(__dirname, '..', 'assets', 'sounds', 'wakeup-ring.wav');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
console.log(`✓ ${path.relative(process.cwd(), outPath)}  ${(buf.length / 1024).toFixed(1)} KB`);
