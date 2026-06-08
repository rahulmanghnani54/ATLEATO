/**
 * Legend Progression System
 *
 * RPG-style leveling with per-persona title variations.
 * XP sources: workout (+50), streak milestone (+100/7d), PR (+75), territory cell (+5)
 * Stored in AsyncStorage under 'legend_xp:v1'
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersonaId } from '@/lib/personaTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LevelName = 'Rookie' | 'Grinder' | 'Athlete' | 'Elite' | 'Legend';

export interface LevelInfo {
  xp: number;
  level: LevelName;
  title: string;               // generic level name
  persona_title: string;       // persona-flavoured title
  nextThreshold: number;       // XP needed to reach next level (0 if max)
  progress: number;            // 0-1 within current level band
}

export type XPSource = 'workout' | 'streak_milestone' | 'pr' | 'territory';

export const XP_AWARDS: Record<XPSource, number> = {
  workout:          50,
  streak_milestone: 100,
  pr:               75,
  territory:        5,
};

// ─── Level thresholds ─────────────────────────────────────────────────────────

const LEVELS: Array<{ name: LevelName; min: number; max: number }> = [
  { name: 'Rookie',  min: 0,    max: 499  },
  { name: 'Grinder', min: 500,  max: 1499 },
  { name: 'Athlete', min: 1500, max: 3499 },
  { name: 'Elite',   min: 3500, max: 6999 },
  { name: 'Legend',  min: 7000, max: Infinity },
];

// ─── Per-persona titles ───────────────────────────────────────────────────────

const PERSONA_TITLES: Record<PersonaId, Record<LevelName, string>> = {
  cbum: {
    Rookie:  'Fresh Physique',
    Grinder: 'Classic Builder',
    Athlete: 'Stage Ready',
    Elite:   'The Sculptor Standard',
    Legend:  'Classic Olympian',
  },
  arnold: {
    Rookie:  'Iron Beginner',
    Grinder: 'Mass Builder',
    Athlete: 'Golden Era',
    Elite:   'Austrian Oak',
    Legend:  '7x Champion',
  },
  nippard: {
    Rookie:  'Evidence Seeker',
    Grinder: 'Protocol Follower',
    Athlete: 'Optimized',
    Elite:   'Science-Based',
    Legend:  'Evidence Legend',
  },
  ct_fletcher: {
    Rookie:  'No Excuses Rookie',
    Grinder: 'Iron Commander',
    Athlete: 'ISYMFS Warrior',
    Elite:   'Compton Iron',
    Legend:  'Iron Olympus',
  },
  dr_mike: {
    Rookie:  'MEV Starter',
    Grinder: 'MAV Builder',
    Athlete: 'MRV Pusher',
    Elite:   'RP Athlete',
    Legend:  'Dr. Growth Status',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLevelForXP(xp: number): LevelName {
  for (const l of [...LEVELS].reverse()) {
    if (xp >= l.min) return l.name;
  }
  return 'Rookie';
}

function buildLevelInfo(xp: number, personaId: PersonaId = 'cbum'): LevelInfo {
  const levelName = getLevelForXP(xp);
  const idx = LEVELS.findIndex((l) => l.name === levelName);
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;

  const band = current.max === Infinity ? xp - current.min : current.max - current.min + 1;
  const within = xp - current.min;
  const progress = current.max === Infinity ? 1 : Math.min(1, within / band);

  const persona_title = (PERSONA_TITLES[personaId] ?? PERSONA_TITLES.cbum)[levelName];

  return {
    xp,
    level: levelName,
    title: levelName,
    persona_title,
    nextThreshold: next ? next.min : 0,
    progress,
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'legend_xp:v1';

async function loadXP(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

async function saveXP(xp: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(xp));
  } catch {
    // silently fail
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add XP from a given source. Returns the new level info.
 * Pass personaId so the returned persona_title is correct.
 */
export async function addXP(
  source: XPSource | number,
  personaId: PersonaId = 'cbum',
): Promise<LevelInfo> {
  const amount = typeof source === 'number' ? source : XP_AWARDS[source];
  const current = await loadXP();
  const next = current + amount;
  await saveXP(next);
  return buildLevelInfo(next, personaId);
}

/**
 * Get current level info without changing anything.
 */
export async function getLevel(personaId: PersonaId = 'cbum'): Promise<LevelInfo> {
  const xp = await loadXP();
  return buildLevelInfo(xp, personaId);
}

/**
 * Get the XP milestones timeline for display.
 * Returns upcoming level thresholds and whether reached.
 */
export function getMilestones(xp: number): Array<{
  level: LevelName;
  threshold: number;
  reached: boolean;
  xpNeeded: number;
}> {
  return LEVELS.filter((l) => l.min > 0).map((l) => ({
    level: l.name,
    threshold: l.min,
    reached: xp >= l.min,
    xpNeeded: Math.max(0, l.min - xp),
  }));
}
