/**
 * Scarcity Engine — "Tip Expires" Notifications
 *
 * Daily coach tips that "expire" at 9pm to drive immediate opens.
 * Tips are per-persona, rotated daily (index = dayOfYear % 7).
 * No real consequences — purely a behavioral nudge mechanic.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getDayOfYear } from 'date-fns';

export type PersonaId = 'cbum' | 'arnold' | 'nippard' | 'ct_fletcher' | 'dr_mike';

// ─── Daily tips: 7 per coach ────────────────────────────────────────────────

const DAILY_TIPS: Record<PersonaId, string[]> = {
  cbum: [
    "Today's form cue: pause 1 second at the bottom of every rep.",
    "Today's nutrition window closes at noon: front-load protein.",
    "Today's mind-muscle tip: slow the negative to 3 seconds on every set.",
    "Today's recovery focus: 20 minutes of walking after your last meal.",
    "Today's posing practice: 10 minutes of mandatory mirror work.",
    "Today's hydration target: 4 litres before your workout ends.",
    "Today's cardio window: 30 minutes fasted — nothing else burns like it.",
  ],
  arnold: [
    "Today's pump secret: superset every pushing movement.",
    "Today's mental edge: visualise the finished physique for 5 minutes before training.",
    "Today's volume target: add one extra set to every exercise you do.",
    "Today's inspiration: the last 3 reps are where champions are built.",
    "Today's blueprint: train every muscle as if the Olympia is tomorrow.",
    "Today's victory: finish strong — the last set decides your physique.",
    "Today's mindset: there are no shortcuts. Go heavier than last week.",
  ],
  nippard: [
    "Today's science insight: RIR 2 outperforms failure by 23% for hypertrophy.",
    "Today's periodisation tip: if you haven't progressed in 2 weeks, deload.",
    "Today's evidence check: protein synthesis peaks at 40g per meal — hit that.",
    "Today's RIR protocol: leave exactly 2 reps in the tank on every working set.",
    "Today's sleep data: below 7 hours drops testosterone by 15%. Prioritise it.",
    "Today's frequency note: most muscles recover in 48–72 hrs — train them twice.",
    "Today's volume landmark: MEV for quads is ~8 sets; you should be above that.",
  ],
  ct_fletcher: [
    "Today's challenge: add 2.5kg to your heaviest set. Non-negotiable.",
    "Today's order: no excuses. Show up. The weight doesn't care how you feel.",
    "Today's demand: every rep is a war. Win every single one.",
    "Today's command: pick a weight that scares you and lift it anyway.",
    "Today's law: the iron is always honest. Go face it.",
    "Today's verdict: pain is temporary. Weakness is a choice. Choose wisely.",
    "Today's directive: one more set. Always one more. Obey.",
  ],
  dr_mike: [
    "Today's MEV check: if you're not sore, you're not at MEV. Add a set.",
    "Today's volume landmark: track your MRV — if recovery suffers, you've hit it.",
    "Today's hypertrophy note: 10–20 sets per muscle per week is optimal range.",
    "Today's technique cue: full ROM beats heavy partials every time.",
    "Today's fatigue check: if bar speed drops >20%, your CNS is cooked. Stop.",
    "Today's deload trigger: three consecutive sessions with no progress = deload.",
    "Today's SRA cycle: stimulus, recovery, adaptation — you can't skip recovery.",
  ],
};

// ─── Storage key ─────────────────────────────────────────────────────────────

const SEEN_KEY_PREFIX = 'scarcity_tip_seen:';

function seenKey(personaId: PersonaId): string {
  // Include date so "seen" resets each day
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${SEEN_KEY_PREFIX}${personaId}:${today}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DailyTip {
  tip: string;
  expiresAt: Date;
}

/**
 * Returns today's tip for the given persona.
 * expiresAt is always 9pm local time today.
 */
export function getTodayTip(personaId: PersonaId): DailyTip {
  const tips = DAILY_TIPS[personaId] ?? DAILY_TIPS.cbum;
  const dayIndex = getDayOfYear(new Date()) % tips.length;
  const tip = tips[dayIndex];

  const expiresAt = new Date();
  expiresAt.setHours(21, 0, 0, 0); // 9pm tonight

  return { tip, expiresAt };
}

/**
 * Returns minutes remaining until expiry (negative if already expired).
 */
export function getMinutesUntilExpiry(personaId: PersonaId): number {
  const { expiresAt } = getTodayTip(personaId);
  return Math.floor((expiresAt.getTime() - Date.now()) / 60_000);
}

/**
 * Whether the user has already tapped "Got it" on today's tip.
 */
export async function hasTipBeenSeen(personaId: PersonaId): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(seenKey(personaId));
    return val === '1';
  } catch {
    return false;
  }
}

/**
 * Mark today's tip as seen.
 */
export async function markTipSeen(personaId: PersonaId): Promise<void> {
  try {
    await AsyncStorage.setItem(seenKey(personaId), '1');
  } catch {
    // Non-fatal
  }
}

/** Coach short-name for notification copy */
const COACH_NAMES: Record<PersonaId, string> = {
  cbum: 'CBUM',
  arnold: 'Arnold',
  nippard: 'Jeff Nippard',
  ct_fletcher: 'CT Fletcher',
  dr_mike: 'Dr. Mike',
};

/**
 * Schedule a local notification at 6pm today saying:
 * "[Coach] has a tip for you — expires at 9pm tonight"
 *
 * Safe to call on every app open: cancels any existing scarcity notification
 * first (idempotent).
 */
export async function scheduleScarcityNotification(personaId: PersonaId): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Cancel any previously scheduled scarcity notification
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content.data as any)?.type === 'scarcity_tip') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    // Schedule for 6pm today
    const fireAt = new Date();
    fireAt.setHours(18, 0, 0, 0);

    // If 6pm is already past, skip (tip expires at 9pm, no point notifying after)
    if (fireAt.getTime() <= Date.now()) return;

    const coachName = COACH_NAMES[personaId] ?? 'Your coach';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${coachName} has a tip for you`,
        body: 'Expires at 9pm tonight. Tap to read it.',
        data: { type: 'scarcity_tip', personaId, route: '/daily-tip' },
      },
      trigger: { date: fireAt } as any,
    });
  } catch {
    // Non-fatal — push might not be configured in dev
  }
}
