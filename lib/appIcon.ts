/**
 * Per-coach app icon — when the user switches coach, the launcher icon's ring
 * recolors to match (same light-emerald background, coach-colored ring).
 *
 * Backed by the native AppIcon module (activity-alias flip, DONT_KILL_APP).
 * Null-safe: silently no-ops on platforms/builds without the module, so this
 * can be called unconditionally.
 */
import { NativeModules, Platform } from 'react-native';
import type { PersonaId } from '@/lib/personaTheme';

const PERSONA_TO_ALIAS: Record<string, string> = {
  cbum: 'Default',          // Sculptor — the brand emerald icon
  arnold: 'Arnold',         // Monument — gold
  nippard: 'Nippard',       // Analyst — blue
  ct_fletcher: 'CtFletcher',// Commander — red
  dr_mike: 'DrMike',        // Architect — deep emerald
};

export async function syncAppIconToCoach(personaId: PersonaId | string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.AppIcon;
  if (!mod?.setIcon) return; // module absent (old build) — no-op
  const alias = PERSONA_TO_ALIAS[personaId] ?? 'Default';
  try {
    const current = await mod.getIcon();
    if (current === alias) return; // already matching — avoid launcher churn
    await mod.setIcon(alias);
  } catch {
    // never let an icon cosmetic failure affect the coach switch
  }
}
