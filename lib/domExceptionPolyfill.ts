/**
 * Hermes (React Native's JS engine) has no global `DOMException`, but
 * livekit-client (used by the ElevenLabs voice call) references it — without
 * this, loading the call screen throws "Property 'DOMException' doesn't exist"
 * and renders blank. Provide a minimal spec-compatible polyfill.
 *
 * Import this BEFORE any code that pulls in @elevenlabs / livekit.
 */
const g = globalThis as any;
if (typeof g.DOMException === 'undefined') {
  class DOMException extends Error {
    code: number;
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || 'Error';
      this.code = 0;
    }
  }
  g.DOMException = DOMException;
}

export {};
