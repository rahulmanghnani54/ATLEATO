/**
 * Reward Chest — variable-reward drop system (post-workout)
 *
 * After every workout, the user opens a chest and receives ONE of:
 *   - Common  (60%): a coach quote / mantra
 *   - Uncommon(25%): an XP bonus number (cosmetic)
 *   - Rare    (10%): a bonus Streak Freeze ❄ (real value)
 *   - Epic    ( 4%): a persona badge ("CBUM PUSHED YOU TODAY")
 *   - Mythic  ( 1%): "Coach Voice Memo Unlocked" (placeholder for future TTS)
 *
 * Why variable: Skinner-box / Hooked-model. Unpredictable rewards drive
 * habit formation harder than fixed ones. The user doesn't know what's in
 * the chest until they tap.
 *
 * Storage:
 *   - `chest_last_drop:v1` → most recent Drop (for replay/animations)
 *   - `chest_lifetime_opens:v1` → integer counter
 *   - `chest_lifetime_rare_plus:v1` → integer counter for rare-and-above drops
 *
 * Streak Freeze drops integrate with the existing `streakFreezes` module.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFreezeState, getMaxFreezes,
} from '@/lib/streakFreezes';
import type { PersonaTheme } from '@/lib/personaTheme';

export type DropTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export interface Drop {
  tier: DropTier;
  emoji: string;
  title: string;        // 1-3 word headline
  body: string;         // 1-sentence detail (persona-voiced)
  effect?: 'freeze' | null;
  xp?: number;
  rolledAt: number;     // unix ms
}

const KEY_LAST   = 'chest_last_drop:v1';
const KEY_OPENS  = 'chest_lifetime_opens:v1';
const KEY_RARE   = 'chest_lifetime_rare_plus:v1';

// Probability weights — must sum to 100
const TIER_WEIGHTS: Array<[DropTier, number]> = [
  ['common',   60],
  ['uncommon', 25],
  ['rare',     10],
  ['epic',      4],
  ['mythic',    1],
];

const TIER_EMOJI: Record<DropTier, string> = {
  common:   '✦',
  uncommon: '★',
  rare:     '❄',
  epic:     '⚡',
  mythic:   '👑',
};

/** Weighted random tier roll. */
function rollTier(): DropTier {
  const n = Math.random() * 100;
  let acc = 0;
  for (const [tier, w] of TIER_WEIGHTS) {
    acc += w;
    if (n < acc) return tier;
  }
  return 'common';
}

/**
 * Build a coach-voiced drop. If the rolled tier is 'rare', the drop will
 * award a Streak Freeze (unless inventory is already full — then it
 * downgrades to 'uncommon' XP).
 */
export async function openChest(persona: PersonaTheme): Promise<Drop> {
  let tier = rollTier();

  // If rare → award a freeze, but only if there's room
  let effect: 'freeze' | null = null;
  if (tier === 'rare') {
    const fs = await getFreezeState();
    if (fs.freezes < getMaxFreezes()) {
      effect = 'freeze';
    } else {
      tier = 'uncommon';
    }
  }

  const drop = composeDrop(tier, persona, effect);

  // Persist + tally
  const prevOpens = parseInt((await AsyncStorage.getItem(KEY_OPENS)) ?? '0', 10) || 0;
  const prevRare  = parseInt((await AsyncStorage.getItem(KEY_RARE))  ?? '0', 10) || 0;
  const isRarePlus = (['rare', 'epic', 'mythic'] as DropTier[]).includes(tier);

  await AsyncStorage.multiSet([
    [KEY_LAST,  JSON.stringify(drop)],
    [KEY_OPENS, String(prevOpens + 1)],
    [KEY_RARE,  String(prevRare + (isRarePlus ? 1 : 0))],
  ]);

  // Actually award the freeze
  if (effect === 'freeze') {
    await awardOneFreezeDirect();
  }

  return drop;
}

/** Get the last opened drop (for the post-workout reveal animation). */
export async function getLastDrop(): Promise<Drop | null> {
  const raw = await AsyncStorage.getItem(KEY_LAST);
  if (!raw) return null;
  try { return JSON.parse(raw) as Drop; } catch { return null; }
}

export async function getChestStats(): Promise<{ opens: number; rarePlus: number }> {
  const [o, r] = await Promise.all([
    AsyncStorage.getItem(KEY_OPENS),
    AsyncStorage.getItem(KEY_RARE),
  ]);
  return {
    opens: parseInt(o ?? '0', 10) || 0,
    rarePlus: parseInt(r ?? '0', 10) || 0,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Direct freeze grant (bypasses milestone gating) — only used by chest drops.
 * We mutate the AsyncStorage key directly to keep streakFreezes' public API
 * focused on milestone awards.
 */
async function awardOneFreezeDirect(): Promise<void> {
  const KEY_FREEZES = 'freezes_available:v1';
  const cur = parseInt((await AsyncStorage.getItem(KEY_FREEZES)) ?? '0', 10) || 0;
  const next = Math.min(getMaxFreezes(), cur + 1);
  await AsyncStorage.setItem(KEY_FREEZES, String(next));
}

function composeDrop(
  tier: DropTier,
  persona: PersonaTheme,
  effect: 'freeze' | null,
): Drop {
  const emoji = TIER_EMOJI[tier];

  if (effect === 'freeze') {
    return {
      tier, emoji: '🧊',
      title: 'STREAK FREEZE',
      body: `${persona.shortName} dropped you a freeze — auto-saves the next missed day. Use it wisely.`,
      effect: 'freeze',
      rolledAt: Date.now(),
    };
  }

  if (tier === 'mythic') {
    return {
      tier, emoji,
      title: 'GOAT MOMENT',
      body: `${persona.shortName} witnessed greatness. This session goes in the hall of fame.`,
      rolledAt: Date.now(),
    };
  }

  if (tier === 'epic') {
    return {
      tier, emoji,
      title: `${persona.shortName} APPROVES`,
      body: `${persona.shortName}: "${epicLine(persona.id)}"`,
      rolledAt: Date.now(),
    };
  }

  if (tier === 'uncommon') {
    const xp = 50 + Math.floor(Math.random() * 150);
    return {
      tier, emoji,
      title: `+${xp} XP`,
      body: `${persona.shortName} adds ${xp} XP to your ledger. Bigger drops live deeper in the chain.`,
      xp,
      rolledAt: Date.now(),
    };
  }

  // common
  const line = commonLine(persona);
  return {
    tier, emoji,
    title: 'COACH MANTRA',
    body: `"${line}" — ${persona.shortName}`,
    rolledAt: Date.now(),
  };
}

function epicLine(id: PersonaTheme['id']): string {
  switch (id) {
    case 'cbum':        return "That's the kind of session that builds the Classic look.";
    case 'arnold':      return 'The pump was real today. The muscle is listening.';
    case 'nippard':     return 'Stimulus-to-fatigue ratio: optimal. Recovery awaits.';
    case 'ct_fletcher': return "I COMMAND YOU TO BE PROUD. NO ONE CAN STOP YOU.";
    case 'dr_mike':     return 'Productive volume hit MEV+ on every working set. Clean execution.';
  }
}

function commonLine(persona: PersonaTheme): string {
  const pool = persona.quoteOfDay ?? [];
  if (pool.length === 0) return 'Show up tomorrow. That is the work.';
  return pool[Math.floor(Math.random() * pool.length)];
}

// Tier styling exported for the modal
export function tierStyle(tier: DropTier): { color: string; glow: string; label: string } {
  switch (tier) {
    case 'mythic':   return { color: '#ffd24a', glow: 'rgba(255,210,74,0.35)',   label: 'MYTHIC DROP' };
    case 'epic':     return { color: '#c879ff', glow: 'rgba(200,121,255,0.30)',  label: 'EPIC DROP' };
    case 'rare':     return { color: '#5DD3FA', glow: 'rgba(93,211,250,0.30)',   label: 'RARE DROP' };
    case 'uncommon': return { color: '#7be38c', glow: 'rgba(123,227,140,0.22)',  label: 'UNCOMMON' };
    default:         return { color: '#cccccc', glow: 'rgba(204,204,204,0.18)',  label: 'COMMON' };
  }
}
