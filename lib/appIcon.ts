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
import { breadcrumb, captureError } from '@/lib/sentry';

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
  if (!mod?.setIcon) {
    breadcrumb('appIcon: native module missing', { personaId });
    return;
  }
  const alias = PERSONA_TO_ALIAS[personaId] ?? 'Default';
  try {
    const current = await mod.getIcon();
    breadcrumb('appIcon: switching', { personaId, alias, from: current });
    if (current === alias) return; // already matching — avoid launcher churn
    await mod.setIcon(alias);
    breadcrumb('appIcon: switched OK', { personaId, alias });
  } catch (err) {
    // Cosmetic failure must never affect the coach switch — but we DO want to
    // see it in Sentry so we know why launchers aren't repainting.
    captureError(err, { where: 'syncAppIconToCoach', personaId, alias });
  }
}

/** Manual test — Profile 'Force app icon: <coach>' rows call this. */
export async function forceAppIcon(personaId: PersonaId | string): Promise<string> {
  const mod = NativeModules.AppIcon;
  if (!mod?.setIcon) return 'native module missing';
  const alias = PERSONA_TO_ALIAS[personaId] ?? 'Default';
  try {
    await mod.setIcon(alias);
    return `set to ${alias}`;
  } catch (err: any) {
    captureError(err, { where: 'forceAppIcon', personaId, alias });
    return `error: ${err?.message ?? String(err)}`;
  }
}
