/**
 * Call context — what the coach KNOWS when the user answers the phone.
 *
 * The coach calling is the product, so the first ten seconds have to prove the
 * coach has been paying attention ("you hit 85 kilos on bench Monday, today is
 * pull"). This module gathers that from the same tables the app already uses
 * and hands ElevenLabs a set of dynamic variables.
 *
 * Two hard rules, because these strings are SPOKEN:
 *  1. Every field is a short sentence fragment, never a raw number or JSON.
 *     The agent interpolates them verbatim — "4200" is unusable, "4,200 kilos
 *     of volume" is not.
 *  2. Nothing here may delay the call. Every lookup is individually guarded
 *     with a ~2.5s timeout and degrades to a truthful fallback fragment. A
 *     coach that answers late is worse than a coach who knows less.
 */
import { supabase } from '@/lib/supabase';
import { EXPERT_PROGRAMS, type WorkoutDay } from '@/constants/experts';
import { COACH_STYLE } from '@/lib/coachCallPersonas';
import { getFreezeState } from '@/lib/streakFreezes';
import type { PersonaId } from '@/lib/personaTheme';

export interface CallContext {
  user_name: string;
  goal: string;
  coach_name: string;
  coach_style: string;
  call_purpose: string;
  todays_workout: string;    // "Push Day A — 6 exercises, about 55 minutes" | "Rest day"
  last_session: string;      // "Legs, 2 days ago, 4,200 kilos of volume" | "no sessions logged yet"
  recent_pr: string;         // "Bench Press, 85 kilos, on Monday" | "none yet"
  missed_days: string;       // "trained 3 of the last 7 days" | "missed yesterday"
  recovery: string;          // "recovery 82 percent, slept 7 hours 12 minutes" | "no check-in today"
  streak: string;            // "14 day streak" | "no streak yet"

  // ── Numeric mirrors — NEVER sent to the agent, never spoken ───────────────
  // The call screen picks which opener flavour to use (returning after a gap,
  // streak milestone, rest day…) and needs to compare, not read. Kept here so
  // that decision uses the exact same data the coach is briefed on rather than
  // a second, drifting set of queries. Always finite — never null/undefined.
  missedDays: number;           // programmed sessions skipped in a row before today
  daysSinceLastSession: number; // 0 when they trained today, or when nothing is logged
  streakDays: number;
  weeklyCompleted: number;      // distinct training days since Monday
  isRestDay: boolean;
}

// Slow-query budget. Deliberately far tighter than the 8s used on the
// dashboard: a spinner can wait, a ringing phone cannot.
const LOOKUP_TIMEOUT_MS = 2500;

// How far back the workout history read goes. 90 days covers the streak walk
// and leaves plenty of room for "last session" after a long layoff.
const HISTORY_DAYS = 90;

// Spoken goal labels. Duplicated from the call screen on purpose — that copy is
// UI-local and this module must stay React-free and independently importable.
const GOAL_LABEL: Record<string, string> = {
  lose_fat: 'lose fat',
  build_muscle: 'build muscle',
  maintain: 'stay in shape',
  athletic_performance: 'boost athletic performance',
};

/**
 * Race a lookup against the budget and RESOLVE with a fallback instead of
 * rejecting — callers must never need a try/catch to keep the call on time.
 */
async function guard<T>(work: () => PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      Promise.resolve(work() as Promise<T>).catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS)),
    ]);
  } catch {
    return fallback;
  }
}

/** Run a synchronous derivation that must never take the call down with it. */
function safe(derive: () => string, fallback: string): string {
  try {
    const out = derive();
    return speakable(out, fallback);
  } catch {
    return fallback;
  }
}

/** Same guarantee as `safe`, for the numeric mirrors — always a finite number. */
function num(derive: () => number): number {
  try {
    const out = derive();
    return Number.isFinite(out) ? out : 0;
  } catch {
    return 0;
  }
}

/** Last line of defence — the agent speaks these, so never emit an empty/null string. */
function speakable(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === 'NaN') return fallback;
  return trimmed;
}

/** 4200 → "4,200". Hand-rolled: Hermes ships a minimal Intl and we only need grouping. */
function grouped(n: number): string {
  const rounded = Math.round(n);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const ISO_DAY = (d: Date): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** Whole calendar days between an ISO day (or timestamp) and today, local time. */
function daysAgo(when: string): number {
  const then = new Date(when.length <= 10 ? `${when}T12:00:00` : when);
  if (Number.isNaN(then.getTime())) return NaN;
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "today" | "yesterday" | "on Monday" | "on 12 August" — always speakable. */
function whenPhrase(when: string): string {
  const diff = daysAgo(when);
  if (Number.isNaN(diff)) return 'recently';
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  const then = new Date(when.length <= 10 ? `${when}T12:00:00` : when);
  if (diff < 7) return `on ${WEEKDAY[then.getDay()]}`;
  if (diff < 14) return 'last week';
  return `on ${then.getDate()} ${MONTH[then.getMonth()]}`;
}

/** 7.2 → "7 hours 12 minutes". */
function hoursPhrase(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h <= 0) return `${m} minutes`;
  if (m <= 0) return `${h} hours`;
  return `${h} hours ${m} minutes`;
}

interface LogRow {
  date: string;
  workout_name: string | null;
  total_volume_kg: number | null;
  duration_minutes: number | null;
}

// ── Field builders ───────────────────────────────────────────────────────────

/**
 * The session the program schedules for a given date, or null for a rest day.
 * Programs index days 0=Mon..6=Sun; JS getDay() is 0=Sun. Same mapping the
 * dashboard schedule uses — keep them identical or the coach names the wrong day.
 */
function scheduledWorkout(profile: any, date: Date): WorkoutDay | null {
  const programId = (profile?.selected_program as string) ?? 'cbum_evolved';
  const program = EXPERT_PROGRAMS[programId];
  if (!program) return null;

  const dow = date.getDay();
  const programDay = dow === 0 ? 6 : dow - 1;
  if (programDay >= program.daysPerWeek) return null;
  return program.schedule.find((w) => w.day === programDay) ?? null;
}

/** Today's programmed session as a spoken fragment. */
function buildTodaysWorkout(profile: any): string {
  const workout = scheduledWorkout(profile, new Date());
  if (!workout) return 'Rest day';

  const count = workout.exercises?.length ?? 0;
  const parts = [workout.name];
  if (count > 0) parts.push(`${count} ${count === 1 ? 'exercise' : 'exercises'}`);
  if (workout.estimatedMinutes > 0) parts.push(`about ${workout.estimatedMinutes} minutes`);
  return parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join(', ')}` : parts[0];
}

function buildLastSession(logs: LogRow[]): string {
  const last = logs[0];
  if (!last?.date) return 'no sessions logged yet';

  const name = speakable(last.workout_name, 'a training session');
  const bits = [name, whenPhrase(last.date)];
  if (typeof last.total_volume_kg === 'number' && last.total_volume_kg > 0) {
    bits.push(`${grouped(last.total_volume_kg)} kilos of volume`);
  } else if (typeof last.duration_minutes === 'number' && last.duration_minutes > 0) {
    bits.push(`${Math.round(last.duration_minutes)} minutes`);
  }
  return bits.join(', ');
}

/** "trained 3 of the last 7 days", plus the missed-yesterday nudge when it applies. */
function buildMissedDays(logs: LogRow[]): string {
  const today = new Date();
  const window: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    window.push(ISO_DAY(d));
  }
  const trainedDates = new Set(logs.map((r) => r.date));
  const hits = window.filter((d) => trainedDates.has(d));

  if (hits.length === 0) return 'has not trained in the last 7 days';
  if (hits.length === 7) return 'trained every one of the last 7 days';

  const missedYesterday = !trainedDates.has(window[1]);
  const base = `trained ${hits.length} of the last 7 days`;
  return missedYesterday ? `${base}, and missed yesterday` : base;
}

/**
 * Freeze-aware streak, mirroring useWorkoutStreak — but READ-ONLY. A phone call
 * must not silently spend a streak freeze on the user's behalf; the dashboard
 * owns that decision.
 */
function streakCount(logs: LogRow[], frozenDates: string[]): number {
  const trainedDates = new Set(logs.map((r) => r.date));
  const frozen = new Set(frozenDates);

  const cursor = new Date();
  if (!trainedDates.has(ISO_DAY(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const day = ISO_DAY(cursor);
    if (trainedDates.has(day)) streak++;
    else if (!frozen.has(day)) break; // frozen days carry the streak but don't count
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Programmed sessions skipped in a row immediately before today. Counts only
 * days the program actually scheduled work — on a 4-day split, not training
 * Sunday is the plan, not a miss, and a coach that scolds for it is wrong.
 */
function missedProgrammedDays(logs: LogRow[], profile: any): number {
  const trainedDates = new Set(logs.map((r) => r.date));
  const cursor = new Date();
  let missed = 0;
  for (let i = 0; i < 14; i++) {
    cursor.setDate(cursor.getDate() - 1);
    if (trainedDates.has(ISO_DAY(cursor))) break;
    if (scheduledWorkout(profile, cursor)) missed++;
  }
  return missed;
}

/** Distinct training days since Monday — "first session of the week" detection. */
function weekCompleted(logs: LogRow[]): number {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const since = ISO_DAY(monday);
  return new Set(logs.filter((r) => r.date >= since).map((r) => r.date)).size;
}

interface PrRow {
  exercise_name: string | null;
  weight_kg: number | null;
  reps: number | null;
  achieved_at: string | null;
}

function buildRecentPr(pr: PrRow | null): string {
  if (!pr?.exercise_name || !pr.achieved_at) return 'none yet';
  // Older than a month it stops being news the coach should lead with.
  const age = daysAgo(pr.achieved_at);
  if (Number.isNaN(age) || age > 30) return 'none yet';

  const weight = typeof pr.weight_kg === 'number' && pr.weight_kg > 0
    ? `${grouped(pr.weight_kg)} kilos`
    : '';
  const reps = typeof pr.reps === 'number' && pr.reps > 1 ? `for ${pr.reps} reps` : '';
  return [pr.exercise_name, weight, reps, whenPhrase(pr.achieved_at)]
    .filter(Boolean)
    .join(', ');
}

interface RecoveryRow {
  date: string;
  sleep_hours: number | null;
  recovery_score: number | null;
}

function buildRecovery(row: RecoveryRow | null): string {
  if (!row) return 'no check-in today';

  const bits: string[] = [];
  if (typeof row.recovery_score === 'number' && row.recovery_score > 0) {
    bits.push(`recovery ${Math.round(row.recovery_score)} percent`);
  }
  if (typeof row.sleep_hours === 'number' && row.sleep_hours > 0) {
    bits.push(`slept ${hoursPhrase(row.sleep_hours)}`);
  }
  if (bits.length === 0) return 'no check-in today';

  // Be honest about staleness rather than passing yesterday off as this morning.
  const age = daysAgo(row.date);
  const phrase = bits.join(', ');
  return age >= 1 ? `${phrase}, from yesterday's check-in` : phrase;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function buildCallContext(args: {
  profile: any;
  personaId: string;
  personaName: string;
  coachStyle: string;
  callPurpose: string;
}): Promise<CallContext> {
  const { profile, personaId, personaName, coachStyle, callPurpose } = args;
  const userId: string | undefined = profile?.id;

  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);
  const sinceISO = ISO_DAY(since);
  const todayISO = ISO_DAY(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = ISO_DAY(yesterday);

  // One history read feeds last_session, missed_days and streak — three fewer
  // round trips on a connection we are already racing a 2.5s budget against.
  const logsP = guard<LogRow[]>(async () => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from('workout_logs')
      .select('date, workout_name, total_volume_kg, duration_minutes')
      .eq('user_id', userId)
      .gte('date', sinceISO)
      .order('date', { ascending: false })
      .limit(HISTORY_DAYS);
    if (error) return [];
    return (data ?? []) as unknown as LogRow[];
  }, []);

  const prP = guard<PrRow | null>(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('personal_records')
      .select('exercise_name, weight_kg, reps, achieved_at')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data ?? null) as unknown as PrRow | null;
  }, null);

  // Today's check-in if it exists, otherwise yesterday's — a wake-up call lands
  // before the user has checked in, and last night's sleep is still useful.
  const recoveryP = guard<RecoveryRow | null>(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('recovery_checkins')
      .select('date, sleep_hours, recovery_score')
      .eq('user_id', userId)
      .gte('date', yesterdayISO)
      .lte('date', todayISO)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data ?? null) as unknown as RecoveryRow | null;
  }, null);

  const frozenP = guard<string[]>(async () => {
    const state = await getFreezeState();
    return state?.frozenDates ?? [];
  }, []);

  const [logs, pr, recovery, frozenDates] = await Promise.all([logsP, prP, recoveryP, frozenP]);

  // Derived once, then shared between the spoken fragment and its numeric mirror
  // so the coach's words and the opener-flavour decision can never disagree.
  const streakDays = num(() => streakCount(logs, frozenDates));
  const lastDate = logs[0]?.date;
  const sinceLast = lastDate ? daysAgo(lastDate) : NaN;

  return {
    user_name: speakable(String(profile?.full_name ?? '').trim().split(/\s+/)[0], 'athlete'),
    goal: speakable(GOAL_LABEL[String(profile?.goal ?? '')], 'crush your goals'),
    coach_name: speakable(personaName, 'Coach'),
    coach_style: speakable(
      coachStyle,
      COACH_STYLE[personaId as PersonaId] ?? COACH_STYLE.cbum,
    ),
    call_purpose: speakable(callPurpose, 'morning wake-up'),
    todays_workout: safe(() => buildTodaysWorkout(profile), 'Rest day'),
    last_session: safe(() => buildLastSession(logs), 'no sessions logged yet'),
    recent_pr: safe(() => buildRecentPr(pr), 'none yet'),
    missed_days: safe(() => buildMissedDays(logs), 'no training history yet'),
    recovery: safe(() => buildRecovery(recovery), 'no check-in today'),
    streak: streakDays > 0 ? `${streakDays} day streak` : 'no streak yet',

    missedDays: num(() => missedProgrammedDays(logs, profile)),
    daysSinceLastSession: Number.isFinite(sinceLast) && sinceLast > 0 ? sinceLast : 0,
    streakDays,
    weeklyCompleted: num(() => weekCompleted(logs)),
    isRestDay: !scheduledWorkout(profile, new Date()),
  };
}
