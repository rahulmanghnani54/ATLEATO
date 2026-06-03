/**
 * Friend Scoreboard — local MVP with simulated friend data
 *
 * No contacts access, no server sync. Friends are added by referral code.
 * The app generates realistic fake weekly stats for MVP.
 *
 * Storage: AsyncStorage key `friend_scoreboard:v1` = Friend[]
 * Weekly reset: every Monday at midnight (checked on read).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfWeek, isAfter, parseISO } from 'date-fns';

const STORAGE_KEY = 'friend_scoreboard:v1';

export interface Friend {
  id: string;
  name: string;
  code: string;
  workoutsThisWeek: number;
  streak: number;
  lastTrained: string | null; // ISO date string or null
  weekStart: string;          // ISO date of the Monday this count started
}

// ─── Realistic name pool for generated friends ───────────────────────────────

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Drew',
  'Rohan', 'Priya', 'Arjun', 'Nisha', 'Liam', 'Emma', 'Noah', 'Olivia',
  'Marcus', 'Sofia', 'Diego', 'Aisha',
];

const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTW';

function randomName(seed: string): string {
  // Deterministic based on code so same code always gives same name
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  const first = FIRST_NAMES[Math.abs(hash) % FIRST_NAMES.length];
  const last = LAST_INITIALS[Math.abs(hash >> 4) % LAST_INITIALS.length];
  return `${first} ${last}.`;
}

function randomInRange(seed: number, min: number, max: number): number {
  // Simple seeded pseudo-random
  const x = Math.sin(seed + 1) * 10000;
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1));
}

function weekStartISO(): string {
  return startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().slice(0, 10);
}

function isNewWeek(friend: Friend): boolean {
  const storedWeekStart = friend.weekStart;
  const currentWeekStart = weekStartISO();
  return storedWeekStart !== currentWeekStart;
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

async function load(): Promise<Friend[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Friend[];
  } catch {
    return [];
  }
}

async function save(friends: Friend[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
  } catch {
    // Non-fatal
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Add a friend by referral code.
 * Generates deterministic fake stats for MVP.
 * Returns null if code is already added.
 */
export async function addFriend(code: string): Promise<Friend | null> {
  const friends = await load();
  const normalised = code.trim().toUpperCase();
  if (!normalised || normalised.length < 4) return null;
  if (friends.some((f) => f.code === normalised)) return null;

  const seedNum = normalised.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const workoutsThisWeek = randomInRange(seedNum, 1, 5);
  const streak = randomInRange(seedNum + 1, 3, 42);
  const trainedToday = randomInRange(seedNum + 2, 0, 1) === 1;
  const today = new Date().toISOString().slice(0, 10);

  const friend: Friend = {
    id: `friend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: randomName(normalised),
    code: normalised,
    workoutsThisWeek,
    streak,
    lastTrained: trainedToday ? today : null,
    weekStart: weekStartISO(),
  };

  await save([...friends, friend]);
  return friend;
}

/**
 * Remove a friend by id.
 */
export async function removeFriend(id: string): Promise<void> {
  const friends = await load();
  await save(friends.filter((f) => f.id !== id));
}

/**
 * Returns the current friend list, resetting weekly counts if Monday has passed.
 */
export async function getFriends(): Promise<Friend[]> {
  const friends = await load();
  const currentWeekStart = weekStartISO();
  let dirty = false;

  const updated = friends.map((f) => {
    if (isNewWeek(f)) {
      dirty = true;
      // Keep streak and name but reset weekly count
      return {
        ...f,
        workoutsThisWeek: 0,
        lastTrained: null,
        weekStart: currentWeekStart,
      };
    }
    return f;
  });

  if (dirty) await save(updated);
  return updated;
}

/**
 * Returns the scoreboard header message based on loss-framing psychology.
 *
 * @param userTrained - whether the current user has logged a workout today
 * @param trainedFriendCount - how many friends trained today
 */
export function getScoreboardMessage(userTrained: boolean, trainedFriendCount: number): string {
  if (userTrained) {
    if (trainedFriendCount === 0) {
      return "You trained today. None of your friends have yet.";
    }
    if (trainedFriendCount === 1) {
      return "You trained today. 1 of your friends also did.";
    }
    return `You trained today. ${trainedFriendCount} of your friends also did.`;
  } else {
    if (trainedFriendCount === 0) {
      return "No one has trained today. Don't be the last.";
    }
    if (trainedFriendCount === 1) {
      return "1 friend trained today. You haven't.";
    }
    return `${trainedFriendCount} friends trained today. You're behind.`;
  }
}
