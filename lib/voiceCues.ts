/**
 * Voice Cues
 *
 * Text-to-speech in each coach's "voice". Pitch + rate vary per persona so
 * CT sounds intense, THE SCULPTOR sounds calm, The Monument sounds slow + deep, etc.
 * The COPY for each cue is also persona-specific — CT shouts where The Monument inspires.
 *
 * Backed by expo-speech (Android TextToSpeech / iOS AVSpeechSynthesizer).
 * No external TTS API, fully offline once the device's TTS engine has voices.
 *
 * Usage:
 *   speakCue('rest_over', persona);          // built-in cue
 *   speakAs(persona, "Custom text");          // ad-hoc
 *   silence();                                // stop any in-flight speech
 *
 * Global on/off preference is read from AsyncStorage by `useVoiceCues`.
 */
import * as Speech from 'expo-speech';
import type { PersonaId } from './personaTheme';

// ─────────────────────────────────────────────────────────────────────────────
// Voice characteristics per persona
// ─────────────────────────────────────────────────────────────────────────────

interface VoiceProfile {
  language: string;   // BCP-47 tag for the TTS engine to pick a voice
  pitch:    number;   // 0.5 (deep) ... 2.0 (high)
  rate:     number;   // 0.5 (slow) ... 2.0 (fast)
  volume:   number;   // 0.0 ... 1.0
}

const VOICE_BY_PERSONA: Record<PersonaId, VoiceProfile> = {
  cbum:        { language: 'en-US', pitch: 1.00, rate: 0.95, volume: 1.0 },  // calm, normal
  arnold:      { language: 'en-US', pitch: 0.82, rate: 0.88, volume: 1.0 },  // deep, slow
  nippard:     { language: 'en-CA', pitch: 1.05, rate: 1.05, volume: 1.0 },  // clipped, faster
  ct_fletcher: { language: 'en-US', pitch: 0.92, rate: 1.10, volume: 1.0 },  // gritty, loud, fast
  dr_mike:     { language: 'en-US', pitch: 1.00, rate: 1.10, volume: 1.0 },  // nerdy, fast
};

// ─────────────────────────────────────────────────────────────────────────────
// Cue catalog — what each coach says for each trigger
// ─────────────────────────────────────────────────────────────────────────────

export type CueId =
  | 'workout_start'
  | 'set_complete'
  | 'rest_over'
  | 'rest_countdown'      // params.seconds
  | 'last_set'
  | 'workout_complete'
  | 'pr_hit'              // params.exercise + params.kg
  | 'form_issue'          // params.issue
  | 'form_solid';

interface CueParams { seconds?: number; exercise?: string; kg?: number; issue?: string }

type CueLine = string | ((p: CueParams) => string);

const CUES: Record<CueId, Record<PersonaId, CueLine>> = {
  workout_start: {
    cbum:        () => "Let's get to work. Quality reps only.",
    arnold:      () => "Welcome back, champion. The iron awaits.",
    nippard:     () => "Session start. Execute the plan.",
    ct_fletcher: () => "GET YOUR ASS ON THAT BAR! LET'S GO!",
    dr_mike:     () => "Mesocycle session, on the clock. Begin.",
  },
  set_complete: {
    cbum:        () => "Set complete. Breathe. Reset.",
    arnold:      () => "Good. Feel the pump build.",
    nippard:     () => "Set logged. Rest, then next.",
    ct_fletcher: () => "ONE DOWN. GET READY FOR THE NEXT.",
    dr_mike:     () => "Set in the books. Recover.",
  },
  rest_over: {
    cbum:        () => "Time to go again.",
    arnold:      () => "The next rep awaits.",
    nippard:     () => "Rest complete. Back to it.",
    ct_fletcher: () => "GET BACK ON THAT BAR! NOW!",
    dr_mike:     () => "Rest period complete. Execute next set.",
  },
  rest_countdown: {
    cbum:        (p) => `${p.seconds}, ${p.seconds! - 1}, ${p.seconds! - 2}, go.`,
    arnold:      (p) => `${p.seconds}, ${p.seconds! - 1}, ${p.seconds! - 2}, attack.`,
    nippard:     (p) => `Three, two, one, lift.`,
    ct_fletcher: () => "THREE! TWO! ONE! MOVE!",
    dr_mike:     () => "Three, two, one, send.",
  },
  last_set: {
    cbum:        () => "This is the one. Make it perfect.",
    arnold:      () => "The final reps. This is where the muscle grows.",
    nippard:     () => "Last set. Push to RIR 1.",
    ct_fletcher: () => "LAST SET! LEAVE EVERYTHING ON THE GYM FLOOR!",
    dr_mike:     () => "Final set of this exercise. Maximize stimulus.",
  },
  workout_complete: {
    cbum:        () => "Workout done. Eat, sleep, repeat.",
    arnold:      () => "Done. Today you are stronger than yesterday.",
    nippard:     () => "Session complete. Recovery starts now.",
    ct_fletcher: () => "YOU SHOWED UP! NOW EAT!",
    dr_mike:     () => "Workout complete. Recovery is where the magic happens.",
  },
  pr_hit: {
    cbum:        (p) => `New personal record on ${p.exercise}. ${p.kg} kilos.`,
    arnold:      (p) => `A new personal record! ${p.kg} kilos. You are growing.`,
    nippard:     (p) => `New PR. ${p.kg} kilos. Progressive overload confirmed.`,
    ct_fletcher: (p) => `${p.kg} KILOS! NEW PR! I COMMANDED YOU TO GROW!`,
    dr_mike:     (p) => `Progressive overload achieved. ${p.kg} kilos on ${p.exercise}.`,
  },
  form_issue: {
    cbum:        (p) => `${p.issue}`,
    arnold:      (p) => `Watch the form. ${p.issue}.`,
    nippard:     (p) => `Form check. ${p.issue}.`,
    ct_fletcher: (p) => `${p.issue!.toUpperCase()}! FIX IT!`,
    dr_mike:     (p) => `Form correction needed. ${p.issue}.`,
  },
  form_solid: {
    cbum:        () => "Form looks solid. Keep going.",
    arnold:      () => "Perfect form. The mind controls the muscle.",
    nippard:     () => "Form is dialed in.",
    ct_fletcher: () => "THAT'S WHAT I LIKE TO SEE!",
    dr_mike:     () => "Form within tolerance. Continue.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Spam guard
// ─────────────────────────────────────────────────────────────────────────────

let lastSpokenAt = 0;
let lastSpokenKey = '';

/** Minimum gap between two of the same cue (ms). Prevents form-issue spam. */
const SAME_CUE_COOLDOWN_MS = 10_000;

/**
 * Speak a built-in cue in the persona's voice + style.
 * No-op if voice cues are disabled or the same cue fired recently.
 */
export function speakCue(cueId: CueId, persona: PersonaId, params: CueParams = {}): void {
  const key = `${cueId}:${persona}:${params.issue ?? params.exercise ?? ''}`;
  const now = Date.now();
  if (key === lastSpokenKey && now - lastSpokenAt < SAME_CUE_COOLDOWN_MS) return;

  const line = CUES[cueId][persona];
  if (!line) return;
  const text = typeof line === 'function' ? line(params) : line;
  if (!text) return;

  lastSpokenAt = now;
  lastSpokenKey = key;
  speakAs(persona, text);
}

/** Speak arbitrary text in the persona's voice. */
export function speakAs(persona: PersonaId, text: string): void {
  const profile = VOICE_BY_PERSONA[persona] ?? VOICE_BY_PERSONA.cbum;
  try {
    Speech.speak(text, {
      language: profile.language,
      pitch:    profile.pitch,
      rate:     profile.rate,
      volume:   profile.volume,
    });
  } catch {
    // Speech engine unavailable (rare) — silently swallow; UI text still shows.
  }
}

/** Cancel any in-flight speech. Call when leaving a screen or on toggle-off. */
export function silence(): void {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
  lastSpokenAt = 0;
  lastSpokenKey = '';
}
