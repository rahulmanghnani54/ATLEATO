/**
 * The streak is the retention mechanic. If a day the user actually trained shows
 * as missed — or a freeze they earned fails to protect one — the app has called
 * them a quitter to their face, and they churn. So the day-identity arithmetic,
 * the freeze economy, and the status copy are all pinned here.
 */

// AsyncStorage is a device boundary, not internal logic. Backed by a plain Map so
// the freeze module's real read/write path runs unmodified. Declared with the
// `mock` prefix so jest's hoisting allows the factory to close over it.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: async (k: string, v: string) => { mockStore.set(k, v); },
    removeItem: async (k: string) => { mockStore.delete(k); },
    multiSet: async (pairs: [string, string][]) => { for (const [k, v] of pairs) mockStore.set(k, v); },
  },
}));

import { getPersona, type PersonaTheme } from '@/lib/personaTheme';
import { getMissDayNudge, getStreakStatus } from '@/lib/streakEngine';

type Tier = 'free' | 'pro' | 'legend';

/**
 * streakFreezes caches its state in module scope and reads the freeze cap from
 * featureGates at load time, so a tier change is only meaningful across a fresh
 * module registry. Both modules are loaded into the SAME registry generation so
 * the freeze module sees the provider set here.
 */
async function loadFreezes(tier: Tier = 'free') {
  jest.resetModules();
  const gates = await import('@/lib/featureGates');
  gates._setTierProvider(() => tier);
  return import('@/lib/streakFreezes');
}

async function loadCalendar(tier: Tier = 'free') {
  jest.resetModules();
  const gates = await import('@/lib/featureGates');
  gates._setTierProvider(() => tier);
  const freezes = await import('@/lib/streakFreezes');
  const calendar = await import('@/lib/chainCalendar');
  return { freezes, calendar };
}

/** 'YYYY-MM-DD' for a calendar coordinate, computed without a Date at all. */
function ymd(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

beforeEach(() => {
  mockStore.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// Day identity — the timezone boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('chainCalendar — day identity', () => {
  it('round-trips an ISO date through fromISO/toISO in any timezone', async () => {
    const { calendar } = await loadCalendar();
    for (const iso of ['2026-01-01', '2026-08-26', '2026-12-31', '2024-02-29']) {
      expect(calendar.toISO(calendar.fromISO(iso))).toBe(iso);
    }
  });

  it('addDays walks consecutive calendar days without drifting', async () => {
    const { calendar } = await loadCalendar();
    const start = calendar.fromISO('2026-08-26');
    const walked = [0, 1, 2, 3, 4].map((n) => calendar.toISO(calendar.addDays(start, n)));
    expect(walked).toEqual([
      '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
    ]);
  });

  it('addDays crosses a month and a year boundary correctly', async () => {
    const { calendar } = await loadCalendar();
    expect(calendar.toISO(calendar.addDays(calendar.fromISO('2026-08-31'), 1))).toBe('2026-09-01');
    expect(calendar.toISO(calendar.addDays(calendar.fromISO('2026-12-31'), 1))).toBe('2027-01-01');
    expect(calendar.toISO(calendar.addDays(calendar.fromISO('2024-02-28'), 1))).toBe('2024-02-29');
  });

  it('every grid square carries the ISO date of the number printed on it', async () => {
    // Regression: cells were built from a LOCAL-midnight Date and stamped with a
    // UTC ISO, so east of UTC the whole grid shifted one square and every trained
    // day landed on the wrong date.
    const { calendar } = await loadCalendar();
    const month = await calendar.buildMonth(2026, 7, new Set());
    const days = month.weeks.flat().filter((c) => c.day !== 0);
    expect(days).toHaveLength(31);
    for (const cell of days) {
      expect(cell.dateISO).toBe(ymd(2026, 7, cell.day));
    }
  });

  it('stamps the same day identity that the rest of the app writes', async () => {
    // Every writer of workout_logs.date uses new Date().toISOString().slice(0,10).
    const { calendar } = await loadCalendar();
    const now = new Date();
    expect(calendar.toISO(now)).toBe(now.toISOString().slice(0, 10));
  });

  it('the compact strip prints the day number that matches its own date', async () => {
    const { calendar } = await loadCalendar();
    const strip = await calendar.buildCompactStrip(new Set(), 4);
    expect(strip).toHaveLength(28);
    for (const cell of strip) {
      expect(cell.day).toBe(Number(cell.dateISO.slice(8, 10)));
    }
  });

  it('pads the grid to whole weeks and starts the month on the right weekday', async () => {
    const { calendar } = await loadCalendar();
    const month = await calendar.buildMonth(2026, 7, new Set());
    for (const week of month.weeks) expect(week).toHaveLength(7);
    // 2026-08-01 is a Saturday → index 5 in a Monday-first grid.
    const first = month.weeks[0].findIndex((c) => c.day === 1);
    expect(first).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consecutive days, gaps, and freezes on the visible calendar
// ─────────────────────────────────────────────────────────────────────────────

describe('chainCalendar — trained, missed, frozen', () => {
  const PINNED = new Date('2026-08-26T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED);
  });
  afterEach(() => jest.useRealTimers());

  const range = (from: number, to: number) =>
    new Set(Array.from({ length: to - from + 1 }, (_, i) => ymd(2026, 7, from + i)));

  const statusOf = (month: { weeks: { day: number; status: string }[][] }, day: number) =>
    month.weeks.flat().find((c) => c.day === day)!.status;

  it('marks a run of consecutive trained days as trained', async () => {
    const { calendar } = await loadCalendar();
    const month = await calendar.buildMonth(2026, 7, range(10, 16));
    for (let d = 10; d <= 16; d++) expect(statusOf(month, d)).toBe('trained');
    expect(month.trainedCount).toBe(7);
  });

  it('a gap in the run reads as missed — the chain is visibly broken', async () => {
    const { calendar } = await loadCalendar();
    const trained = range(10, 16);
    trained.delete(ymd(2026, 7, 13));
    const month = await calendar.buildMonth(2026, 7, trained);
    expect(statusOf(month, 12)).toBe('trained');
    expect(statusOf(month, 13)).toBe('missed');
    expect(statusOf(month, 14)).toBe('trained');
    expect(month.trainedCount).toBe(6);
  });

  it('a freeze spent on the gap day protects it — frozen, not missed', async () => {
    const { freezes, calendar } = await loadCalendar('pro');
    await freezes.checkAndAwardFreeze(7);
    expect(await freezes.consumeFreezeForDate(ymd(2026, 7, 13))).toBe(true);

    const trained = range(10, 16);
    trained.delete(ymd(2026, 7, 13));
    const month = await calendar.buildMonth(2026, 7, trained);
    expect(statusOf(month, 13)).toBe('frozen');
    // A frozen day is not a trained day — the freeze saves the chain, not the count.
    expect(month.trainedCount).toBe(6);
  });

  it('a scheduled rest day is not a miss', async () => {
    const { calendar } = await loadCalendar();
    const trained = range(10, 16);
    trained.delete(ymd(2026, 7, 13));
    const month = await calendar.buildMonth(2026, 7, trained, new Set([ymd(2026, 7, 13)]));
    expect(statusOf(month, 13)).toBe('rest');
  });

  it('days after today are future, never missed', async () => {
    const { calendar } = await loadCalendar();
    const month = await calendar.buildMonth(2026, 7, new Set());
    expect(statusOf(month, 27)).toBe('future');
    expect(statusOf(month, 31)).toBe('future');
    expect(statusOf(month, 25)).toBe('missed');
    expect(month.totalElapsedDays).toBe(26);
  });

  it('flags exactly one square as today', async () => {
    const { calendar } = await loadCalendar();
    const month = await calendar.buildMonth(2026, 7, new Set());
    const todays = month.weeks.flat().filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].day).toBe(26);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Freeze economy
// ─────────────────────────────────────────────────────────────────────────────

describe('streakFreezes — earning', () => {
  it('awards nothing before the first 7-day milestone', async () => {
    const f = await loadFreezes('pro');
    for (let streak = 0; streak < 7; streak++) {
      expect(await f.checkAndAwardFreeze(streak)).toBe(false);
    }
    expect((await f.getFreezeState()).freezes).toBe(0);
  });

  it('awards one freeze at 7 days', async () => {
    const f = await loadFreezes('pro');
    expect(await f.checkAndAwardFreeze(7)).toBe(true);
    expect((await f.getFreezeState()).freezes).toBe(1);
  });

  it('does not re-award between milestones', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    for (const streak of [7, 8, 10, 13]) {
      expect(await f.checkAndAwardFreeze(streak)).toBe(false);
    }
    expect((await f.getFreezeState()).freezes).toBe(1);
  });

  it('awards again at each subsequent milestone, up to the cap', async () => {
    const f = await loadFreezes('pro');
    expect(await f.checkAndAwardFreeze(7)).toBe(true);
    expect(await f.checkAndAwardFreeze(14)).toBe(true);
    expect(await f.checkAndAwardFreeze(21)).toBe(true);
    expect((await f.getFreezeState()).freezes).toBe(f.MAX_FREEZES_PRO);
    // Cap reached — the milestone is consumed but no fourth freeze is granted.
    expect(await f.checkAndAwardFreeze(28)).toBe(false);
    expect((await f.getFreezeState()).freezes).toBe(f.MAX_FREEZES_PRO);
  });

  it('a milestone skipped over (offline for a week) still awards once', async () => {
    const f = await loadFreezes('pro');
    expect(await f.checkAndAwardFreeze(16)).toBe(true);
    expect((await f.getFreezeState()).freezes).toBe(1);
  });
});

describe('streakFreezes — the paid cap', () => {
  it('free users hold one freeze', async () => {
    const f = await loadFreezes('free');
    expect(f.getMaxFreezes()).toBe(f.MAX_FREEZES_FREE);
    expect(await f.checkAndAwardFreeze(7)).toBe(true);
    expect(await f.checkAndAwardFreeze(14)).toBe(false);
    expect((await f.getFreezeState()).freezes).toBe(1);
  });

  it('pro users hold three', async () => {
    const f = await loadFreezes('pro');
    expect(f.getMaxFreezes()).toBe(f.MAX_FREEZES_PRO);
  });

  it('legend inherits the pro cap', async () => {
    const f = await loadFreezes('legend');
    expect(f.getMaxFreezes()).toBe(f.MAX_FREEZES_PRO);
  });

  it('a free user is never handed more than one freeze even after a long run', async () => {
    const f = await loadFreezes('free');
    for (const streak of [7, 14, 21, 28, 35]) await f.checkAndAwardFreeze(streak);
    expect((await f.getFreezeState()).freezes).toBeLessThanOrEqual(f.MAX_FREEZES_FREE);
  });
});

describe('streakFreezes — spending', () => {
  it('consuming a freeze protects that date and decrements the stock', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    expect(await f.consumeFreezeForDate('2026-08-20')).toBe(true);
    expect(await f.isFrozen('2026-08-20')).toBe(true);
    expect((await f.getFreezeState()).freezes).toBe(0);
  });

  it('is idempotent — a re-render cannot double-spend the same day', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    await f.checkAndAwardFreeze(14);
    await f.consumeFreezeForDate('2026-08-20');
    expect((await f.getFreezeState()).freezes).toBe(1);
    expect(await f.consumeFreezeForDate('2026-08-20')).toBe(true);
    expect((await f.getFreezeState()).freezes).toBe(1);
  });

  it('refuses to spend a freeze the user does not have', async () => {
    const f = await loadFreezes('pro');
    expect(await f.consumeFreezeForDate('2026-08-20')).toBe(false);
    expect(await f.isFrozen('2026-08-20')).toBe(false);
    expect((await f.getFreezeState()).freezes).toBe(0);
  });

  it('protects only the exact date it was spent on', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    await f.consumeFreezeForDate('2026-08-20');
    expect(await f.isFrozen('2026-08-19')).toBe(false);
    expect(await f.isFrozen('2026-08-21')).toBe(false);
  });

  it('persists the stock and the frozen trail across a cold start', async () => {
    const first = await loadFreezes('pro');
    await first.checkAndAwardFreeze(7);
    await first.checkAndAwardFreeze(14);
    await first.consumeFreezeForDate('2026-08-20');

    // Fresh module registry = app relaunch; the Map stands in for the device.
    const second = await loadFreezes('pro');
    const state = await second.getFreezeState();
    expect(state.freezes).toBe(1);
    expect(state.frozenDates).toContain('2026-08-20');
    expect(await second.isFrozen('2026-08-20')).toBe(true);
  });

  it('a broken streak clears the frozen trail but not the earned stock', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    await f.checkAndAwardFreeze(14);
    await f.consumeFreezeForDate('2026-08-20');
    await f.resetFrozenDates();

    const state = await f.getFreezeState();
    expect(state.frozenDates).toEqual([]);
    expect(state.lastAwardAt).toBe(0);
    expect(state.freezes).toBe(1);
    expect(await f.isFrozen('2026-08-20')).toBe(false);
  });

  it('getFreezeState hands back a copy of the frozen trail', async () => {
    const f = await loadFreezes('pro');
    await f.checkAndAwardFreeze(7);
    await f.consumeFreezeForDate('2026-08-20');
    (await f.getFreezeState()).frozenDates.push('2026-01-01');
    expect((await f.getFreezeState()).frozenDates).toEqual(['2026-08-20']);
  });

  it('never reports a negative stock', async () => {
    const f = await loadFreezes('pro');
    for (const d of ['2026-08-18', '2026-08-19', '2026-08-20']) await f.consumeFreezeForDate(d);
    expect((await f.getFreezeState()).freezes).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streak status copy
// ─────────────────────────────────────────────────────────────────────────────

describe('streakEngine — tiers and milestones', () => {
  const persona = getPersona('cbum');

  it.each([
    [0, 'fresh'],
    [2, 'fresh'],
    [3, 'building'],
    [6, 'building'],
    [7, 'momentum'],
    [13, 'momentum'],
    [14, 'fire'],
    [29, 'fire'],
    [30, 'legend'],
    [99, 'legend'],
    [100, 'mountain'],
    [365, 'mountain'],
  ])('%i days classifies as %s', (days, tier) => {
    expect(getStreakStatus(days, persona).tier).toBe(tier);
  });

  it('names the next milestone and the days left to it', () => {
    const s = getStreakStatus(5, persona);
    expect(s.nextMilestone).toBe(7);
    expect(s.daysToMilestone).toBe(2);
    expect(s.atMilestone).toBe(false);
  });

  it('flags the day a milestone is hit and labels it', () => {
    expect(getStreakStatus(7, persona).atMilestone).toBe(true);
    expect(getStreakStatus(7, persona).milestoneLabel).toBe('ONE WEEK');
    expect(getStreakStatus(30, persona).milestoneLabel).toBe('30-DAY LEGEND');
  });

  it('never reports a negative or non-finite countdown, even past the last milestone', () => {
    for (const days of [0, 1, 7, 100, 365, 366, 5000]) {
      const s = getStreakStatus(days, persona);
      expect(Number.isFinite(s.daysToMilestone)).toBe(true);
      expect(s.daysToMilestone).toBeGreaterThanOrEqual(0);
      expect(s.nextMilestone).toBeGreaterThan(days);
    }
  });

  it('always produces coach copy, and falls back for an unknown persona', () => {
    for (const id of ['cbum', 'arnold', 'nippard', 'ct_fletcher', 'dr_mike'] as const) {
      expect(getStreakStatus(30, getPersona(id)).subline.length).toBeGreaterThan(0);
    }
    const unknown = { ...persona, id: 'not_a_coach' } as unknown as PersonaTheme;
    expect(getStreakStatus(30, unknown).subline.length).toBeGreaterThan(0);
  });
});

describe('streakEngine — miss-day nudge', () => {
  const persona = getPersona('cbum');
  const evening = new Date(2026, 7, 26, 19, 0, 0);
  const morning = new Date(2026, 7, 26, 9, 0, 0);
  const base = { streak: 5, trainedToday: false, isRestDay: false, persona, now: evening };

  it('nudges an at-risk streak in the evening and names the count', () => {
    const msg = getMissDayNudge(base);
    expect(msg).toContain('5');
  });

  it('stays quiet when there is no streak to lose', () => {
    expect(getMissDayNudge({ ...base, streak: 0 })).toBeNull();
  });

  it('stays quiet once the user has trained today', () => {
    expect(getMissDayNudge({ ...base, trainedToday: true })).toBeNull();
  });

  it('stays quiet on a programmed rest day', () => {
    expect(getMissDayNudge({ ...base, isRestDay: true })).toBeNull();
  });

  it('stays quiet in the morning — there is still a whole day left', () => {
    expect(getMissDayNudge({ ...base, now: morning })).toBeNull();
  });

  it('opens exactly at 16:00 local', () => {
    expect(getMissDayNudge({ ...base, now: new Date(2026, 7, 26, 15, 59, 59) })).toBeNull();
    expect(getMissDayNudge({ ...base, now: new Date(2026, 7, 26, 16, 0, 0) })).not.toBeNull();
  });

  it('speaks for every coach', () => {
    for (const id of ['cbum', 'arnold', 'nippard', 'ct_fletcher', 'dr_mike'] as const) {
      expect(getMissDayNudge({ ...base, persona: getPersona(id) })).toBeTruthy();
    }
  });
});
