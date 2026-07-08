/**
 * Per-coach app icon — when the user switches coach, the launcher icon's ring
 * recolors to match (same light-emerald background, coach-colored ring).
 *
 * ⚠️ CRITICAL Android constraint: flipping an activity-alias while the app is in
 * the FOREGROUND disables the alias the running task was launched from, so
 * Android tears the task down — the app "crashes" to the home screen (even with
 * DONT_KILL_APP), and the forced relaunch races session restore (the "log in
 * again" popup). So we NEVER flip in the foreground. We QUEUE the desired icon
 * and apply it the instant the app goes to the BACKGROUND. The user never sees a
 * crash; when they return to the launcher, the icon has recolored.
 *
 * Backed by the native AppIcon module. Null-safe: no-ops without the module.
 */
import { NativeModules, Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersonaId } from '@/lib/personaTheme';
import { breadcrumb, captureError } from '@/lib/sentry';

const PERSONA_TO_ALIAS: Record<string, string> = {
  cbum: 'Default',          // Sculptor — the brand emerald icon
  arnold: 'Arnold',         // Monument — gold
  nippard: 'Nippard',       // Analyst — blue
  ct_fletcher: 'CtFletcher',// Commander — red
  dr_mike: 'DrMike',        // Architect — deep emerald
};

const PENDING_KEY = 'evulto_pending_app_icon';
let pendingAlias: string | null = null;
let flusherInstalled = false;

/** Apply the queued icon NOW. Only called when the app is backgrounded. */
async function applyPending(): Promise<void> {
  const mod = NativeModules.AppIcon;
  if (!mod?.setIcon) return;
  let want = pendingAlias;
  if (!want) { try { want = await AsyncStorage.getItem(PENDING_KEY); } catch { /* ignore */ } }
  if (!want) return;
  try {
    const current = await mod.getIcon();
    if (current !== want) {
      breadcrumb('appIcon: applying on background', { want, from: current });
      await mod.setIcon(want);
    }
    pendingAlias = null;
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  } catch (err) {
    captureError(err, { where: 'appIcon.applyPending', want });
  }
}

/** Install the background listener once — fires the queued swap safely. */
function ensureFlusher(): void {
  if (flusherInstalled || Platform.OS !== 'android') return;
  flusherInstalled = true;
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') applyPending();
  });
}

/**
 * Queue the launcher icon to match a coach. Call whenever the active coach
 * changes — cheap, idempotent, applies on the next backgrounding (NOT now).
 */
export async function syncAppIconToCoach(personaId: PersonaId | string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.AppIcon;
  if (!mod?.setIcon) { breadcrumb('appIcon: native module missing', { personaId }); return; }

  const alias = PERSONA_TO_ALIAS[personaId] ?? 'Default';
  ensureFlusher();
  try {
    const current = await mod.getIcon();
    if (current === alias) {
      pendingAlias = null;
      await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      return;
    }
    pendingAlias = alias;
    await AsyncStorage.setItem(PENDING_KEY, alias).catch(() => {});
    breadcrumb('appIcon: queued (applies on next background)', { personaId, alias, from: current });
  } catch (err) {
    captureError(err, { where: 'syncAppIconToCoach', personaId, alias });
  }
}

/** Manual test (temporary Profile rows). Also deferred — returns a status. */
export async function forceAppIcon(personaId: PersonaId | string): Promise<string> {
  if (Platform.OS !== 'android') return 'android only';
  const mod = NativeModules.AppIcon;
  if (!mod?.setIcon) return 'native module missing';
  const alias = PERSONA_TO_ALIAS[personaId] ?? 'Default';
  pendingAlias = alias;
  await AsyncStorage.setItem(PENDING_KEY, alias).catch(() => {});
  ensureFlusher();
  return `Queued ${alias}. Press Home (leave the app) and the icon recolors — no crash.`;
}
