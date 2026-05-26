/**
 * Chain Calendar — "Don't Break The Chain" helpers (Seinfeld method)
 *
 * Pure functions for building month grids. Stateless — the actual trained
 * dates come from Supabase via `useChainCalendar`, and frozen dates from
 * AsyncStorage via `streakFreezes`.
 */
import { isFrozen } from '@/lib/streakFreezes';

export type DayStatus = 'trained' | 'frozen' | 'missed' | 'rest' | 'future' | 'empty';

export interface CalendarDay {
  dateISO: string;      // 'YYYY-MM-DD' (empty for padding cells)
  day: number;          // 1..31 (0 for padding cells)
  status: DayStatus;
  isToday: boolean;
}

export interface CalendarMonth {
  year: number;
  monthIndex: number;   // 0..11
  monthLabel: string;   // 'MAY 2026'
  weeks: CalendarDay[][]; // [[Mon..Sun], ...]
  trainedCount: number; // # days trained this month
  totalElapsedDays: number; // days from month-start through today (or month-end if past)
}

const DAY_MS = 86_400_000;

/** Format Date → 'YYYY-MM-DD' */
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse 'YYYY-MM-DD' → Date at local midnight */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add N days to a Date (returns new Date). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * Build a month grid for display.
 * `trainedDateSet` = Set of 'YYYY-MM-DD' strings the user trained.
 * `restDateSet`    = Set of ISO dates that are scheduled rest days (optional —
 *                    pass empty Set if not classifying rest).
 */
export async function buildMonth(
  year: number,
  monthIndex: number,
  trainedDateSet: Set<string>,
  restDateSet: Set<string> = new Set(),
): Promise<CalendarMonth> {
  const todayISO = toISO(new Date());
  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth  = new Date(year, monthIndex + 1, 0);
  const daysInMonth  = lastOfMonth.getDate();

  // Mon=0..Sun=6 column index for the 1st of the month
  const firstDow = (firstOfMonth.getDay() + 6) % 7;

  // Build a flat array of CalendarDay objects (leading padding + month days)
  const cells: CalendarDay[] = [];

  // Leading padding (previous-month blanks)
  for (let i = 0; i < firstDow; i++) {
    cells.push({ dateISO: '', day: 0, status: 'empty', isToday: false });
  }

  // Month days
  let trainedCount = 0;
  let elapsed = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = toISO(new Date(year, monthIndex, day));
    const isToday = dateISO === todayISO;
    const isFuture = dateISO > todayISO;
    if (!isFuture) elapsed++;

    let status: DayStatus;
    if (isFuture) {
      status = 'future';
    } else if (trainedDateSet.has(dateISO)) {
      status = 'trained';
      trainedCount++;
    } else if (await isFrozen(dateISO)) {
      status = 'frozen';
    } else if (restDateSet.has(dateISO)) {
      status = 'rest';
    } else {
      status = 'missed';
    }

    cells.push({ dateISO, day, status, isToday });
  }

  // Trailing padding to fill the last week
  while (cells.length % 7 !== 0) {
    cells.push({ dateISO: '', day: 0, status: 'empty', isToday: false });
  }

  // Chunk into weeks
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthLabel = firstOfMonth
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  return {
    year, monthIndex, monthLabel, weeks,
    trainedCount, totalElapsedDays: elapsed,
  };
}

/** Compact preview: last `n` weeks ending today, flat array. */
export async function buildCompactStrip(
  trainedDateSet: Set<string>,
  weeksBack = 6,
): Promise<CalendarDay[]> {
  const today = new Date();
  const todayISO = toISO(today);
  const totalDays = weeksBack * 7;
  // Anchor so today is in the last column (Sun=6 in Mon-first grid)
  const todayCol = (today.getDay() + 6) % 7;
  const trailingFromToday = 6 - todayCol;
  const endDate = addDays(today, trailingFromToday);
  const startDate = addDays(endDate, -(totalDays - 1));

  const cells: CalendarDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(startDate, i);
    const dateISO = toISO(d);
    const isToday = dateISO === todayISO;
    const isFuture = dateISO > todayISO;
    let status: DayStatus;
    if (isFuture) status = 'future';
    else if (trainedDateSet.has(dateISO)) status = 'trained';
    else if (await isFrozen(dateISO)) status = 'frozen';
    else status = 'missed';

    cells.push({ dateISO, day: d.getDate(), status, isToday });
  }
  return cells;
}
