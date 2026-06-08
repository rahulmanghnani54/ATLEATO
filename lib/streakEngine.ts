/**
 * Streak Engine — turns a raw day count into a status story.
 *
 * Inputs:  current streak (days), persona, whether trained today, today-is-rest-day
 * Outputs: tier, headline, coach-voice subline, next milestone, days remaining,
 *          flame intensity (small/mid/big/legendary), and a miss-day nudge text
 *          when applicable.
 *
 * Pure functions only — no React, no async, fully unit-testable.
 */
import type { PersonaTheme } from './personaTheme';

export type StreakTier = 'fresh' | 'building' | 'momentum' | 'fire' | 'legend' | 'mountain';

export interface StreakStatus {
  days: number;
  tier: StreakTier;
  flameSize: 24 | 32 | 44 | 56;        // emoji font-size by tier
  headline: string;                      // short tier name (FIRE / LEGEND)
  subline: string;                       // coach-voice line for this tier
  nextMilestone: number;                 // next badge day
  daysToMilestone: number;               // 0..N
  atMilestone: boolean;                  // current days exactly hits a milestone
  milestoneLabel: string;                // "ONE FULL WEEK", "30-DAY LEGEND", etc.
}

const MILESTONES: { day: number; label: string }[] = [
  { day: 3,   label: 'FOUNDATION'    },
  { day: 7,   label: 'ONE WEEK'      },
  { day: 14,  label: 'TWO WEEKS'     },
  { day: 21,  label: 'THREE WEEKS'   },
  { day: 30,  label: '30-DAY LEGEND' },
  { day: 60,  label: 'IRON FORGED'   },
  { day: 100, label: 'MOUNTAIN MODE' },
  { day: 200, label: '200 · MASTER'  },
  { day: 365, label: 'ONE FULL YEAR' },
];

function classifyTier(days: number): { tier: StreakTier; flameSize: 24 | 32 | 44 | 56; headline: string } {
  if (days >= 100) return { tier: 'mountain', flameSize: 56, headline: 'MOUNTAIN' };
  if (days >= 30)  return { tier: 'legend',   flameSize: 56, headline: 'LEGEND'   };
  if (days >= 14)  return { tier: 'fire',     flameSize: 44, headline: 'ON FIRE'  };
  if (days >= 7)   return { tier: 'momentum', flameSize: 44, headline: 'MOMENTUM' };
  if (days >= 3)   return { tier: 'building', flameSize: 32, headline: 'BUILDING' };
  return            { tier: 'fresh',    flameSize: 24, headline: 'DAY 1'    };
}

function nextMilestoneFor(days: number): { next: number; label: string } {
  for (const m of MILESTONES) if (m.day > days) return { next: m.day, label: m.label };
  return { next: days + 1, label: 'KEEP GOING' };
}

/**
 * Per-persona coach-voice sublines per tier.
 * Each coach lives in their lane: The Governor poetic, CT shouts, Dr. Growth calculates, etc.
 */
const SUBLINE: Record<StreakTier, Partial<Record<string, string>>> = {
  fresh: {
    cbum:        'Day one. The hardest one. Now show up tomorrow.',
    arnold:      'Every champion starts here. Show up tomorrow, and again.',
    nippard:     'One day in. Consistency over intensity — the literature is clear.',
    ct_fletcher: 'DAY ONE. YOU SHOWED UP. NOW DO IT AGAIN.',
    dr_mike:     'Day 1 logged. n=1 isn\'t a trend yet — keep stacking.',
  },
  building: {
    cbum:        'Three days in. You\'re building the habit. Keep stacking.',
    arnold:      'The habit is forming. The body follows the mind.',
    nippard:     'Streak >3. Compliance rate matters more than program perfection.',
    ct_fletcher: 'THREE DAYS! YOU\'RE BUILDING. DON\'T QUIT NOW.',
    dr_mike:     'n=3+ — the behavior is becoming a pattern. Lock it in.',
  },
  momentum: {
    cbum:        'A full week. You\'ve found your rhythm. Trust it.',
    arnold:      'Seven days. The mind has obeyed. Now make it weeks.',
    nippard:     'One full week trained. Adherence is your biggest variable — and you\'re winning it.',
    ct_fletcher: 'A WEEK! YOU\'RE A DIFFERENT BREED NOW. KEEP COMMANDING!',
    dr_mike:     '7-day streak. You\'re past the formation phase. Habit is stabilizing.',
  },
  fire: {
    cbum:        'Two weeks. You\'re not training anymore — you\'re a trainer.',
    arnold:      'Two weeks. The struggle has become the comfort. This is the path.',
    nippard:     '14-day streak. Habit stickiness curve confirms — you\'re past the cliff.',
    ct_fletcher: 'TWO WEEKS! YOU\'RE ON FIRE! THE WEAK ARE STILL MAKING EXCUSES!',
    dr_mike:     '14+ day streak. Statistically, you\'re in the top 10% of app users.',
  },
  legend: {
    cbum:        '30 days. Most never make it here. You showed up every day.',
    arnold:      'One month. You are no longer who you were. The transformation is real.',
    nippard:     '30 days. You\'ve outperformed 95% of fitness app users by adherence alone.',
    ct_fletcher: '30 DAYS! YOU\'RE A LEGEND IN THE MAKING! KEEP THAT MOMENTUM!',
    dr_mike:     '30 consecutive days. Adherence percentile: ~99th. This is rare data.',
  },
  mountain: {
    cbum:        '100+ days. You don\'t train. You ARE training.',
    arnold:      'One hundred days. The body, the mind, the soul — all aligned.',
    nippard:     '100+ day streak. You are an outlier in the best possible sense.',
    ct_fletcher: '100 DAYS! YOU\'RE A FUCKING MOUNTAIN! NOTHING MOVES YOU!',
    dr_mike:     '100+ days. You\'re no longer a participant — you\'re the case study.',
  },
};

/**
 * Compute full streak status for a coach. Always returns a valid status object —
 * fields are coach-aware where possible, generic where the coach doesn't matter.
 */
export function getStreakStatus(days: number, persona: PersonaTheme): StreakStatus {
  const { tier, flameSize, headline } = classifyTier(days);
  const subline =
    SUBLINE[tier][persona.id] ??
    SUBLINE[tier].cbum ??
    'Keep showing up.';

  const ms = nextMilestoneFor(days);
  const matchedMilestone = MILESTONES.find((m) => m.day === days);

  return {
    days,
    tier,
    flameSize,
    headline,
    subline,
    nextMilestone: ms.next,
    daysToMilestone: Math.max(0, ms.next - days),
    atMilestone: matchedMilestone != null,
    milestoneLabel: matchedMilestone?.label ?? ms.label,
  };
}

/**
 * Decide whether to show a "don't break the chain" nudge on the home screen.
 *
 * Rules:
 *   - User has a non-zero streak
 *   - User has NOT trained today
 *   - Today is not a programmed rest day
 *   - Current local hour ≥ 16 (afternoon — reasonable time to remind)
 *
 * Returns the nudge text in the coach's voice, or null if no nudge needed.
 */
export function getMissDayNudge(args: {
  streak: number;
  trainedToday: boolean;
  isRestDay: boolean;
  persona: PersonaTheme;
  now?: Date;
}): string | null {
  const { streak, trainedToday, isRestDay, persona, now = new Date() } = args;
  if (streak === 0 || trainedToday || isRestDay) return null;
  if (now.getHours() < 16) return null;

  const lines: Partial<Record<string, string>> = {
    cbum:        `${streak}-day streak. Don't let it slip — get a session in tonight.`,
    arnold:      `${streak} days strong. Do not break the chain today, champion.`,
    nippard:     `${streak}-day streak alive. One missed day is fine; two compounds. Train tonight.`,
    ct_fletcher: `${streak} DAYS! DO NOT QUIT ON ME NOW! GET TO THAT GYM!`,
    dr_mike:     `${streak}-day streak at risk. Compliance > intensity. Even a short session preserves it.`,
  };
  return lines[persona.id] ?? lines.cbum ?? null;
}
