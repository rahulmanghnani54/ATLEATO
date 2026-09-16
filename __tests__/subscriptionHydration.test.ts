/**
 * When may a paywall gate trust canAccess()? subscriptionManager answers with
 * whenTierHydrated(). These tests drive the REAL initBilling() /
 * syncEntitlement() / applyEntitlement() path against an in-memory cache and a
 * scripted server, and pin the two rules that matter for money:
 *
 *   - a cache that vouches for a paid tier hydrates at once, offline;
 *   - a cache that reads 'free' — absent, or EXPIRED since the last sync — does
 *     not, because a subscriber between a renewal and their next sync looks
 *     exactly like that. Hydration then comes from the server's answer.
 *
 * The hydration promise is module state, so every case loads a fresh module.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/billing', () => ({
  initBilling: jest.fn(async () => false),
  isConfigured: jest.fn(() => false),
  identify: jest.fn(async () => {}),
}));
jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: null }),
    subscribe: () => () => {},
  },
}));
const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import AsyncStorage from '@react-native-async-storage/async-storage';

(global as any).__DEV__ = false;

const CACHE_KEY = 'subscription_entitlement:v2';
const DAY = 24 * 60 * 60 * 1000;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

type SM = typeof import('@/lib/subscriptionManager');
type FG = typeof import('@/lib/featureGates');

/** Fresh module instances sharing one registry, so featureGates sees this
 *  subscriptionManager's provider. */
function load(): { sm: SM; fg: FG } {
  let sm!: SM;
  let fg!: FG;
  jest.isolateModules(() => {
    sm = require('@/lib/subscriptionManager');
    fg = require('@/lib/featureGates');
  });
  return { sm, fg };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Server script: claim_referral_reward answers at once; get_my_entitlement
 *  answers when the test says so. */
function scriptServer() {
  const answer = deferred<{ data: unknown; error: null }>();
  rpc.mockImplementation((fn: string) => {
    if (fn === 'get_my_entitlement') return answer.promise;
    return Promise.resolve({ data: null, error: null });
  });
  return answer;
}

beforeEach(async () => {
  rpc.mockReset();
  await AsyncStorage.clear();
});

describe('tier hydration', () => {
  it('is not hydrated before initBilling()', () => {
    const { sm } = load();
    expect(sm.isTierHydrated()).toBe(false);
  });

  it('a live cached paid tier hydrates immediately, with the server still silent', async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tier: 'legend', until: Date.now() + DAY }));
    scriptServer(); // never answers
    const { sm, fg } = load();
    await sm.initBilling();
    expect(sm.isTierHydrated()).toBe(true);
    expect(fg.canAccess('ai_form_coach')).toBe(true);
  });

  it('a comp grant (no expiry) also hydrates immediately', async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tier: 'pro', until: null }));
    scriptServer();
    const { sm, fg } = load();
    await sm.initBilling();
    expect(sm.isTierHydrated()).toBe(true);
    expect(fg.canAccess('ai_form_coach')).toBe(true);
  });

  it('an EXPIRED cache waits for the server, then hydrates on the renewed entitlement', async () => {
    // The renewal-boundary case: last sync said "legend until yesterday", the
    // server has since renewed, and this launch is a cold start.
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tier: 'legend', until: Date.now() - DAY }));
    const answer = scriptServer();
    const { sm, fg } = load();
    await sm.initBilling();
    await flush();
    expect(sm.isTierHydrated()).toBe(false); // a gate deciding now would paywall

    answer.resolve({
      data: { tier: 'legend', expires_at: new Date(Date.now() + 30 * DAY).toISOString(), source: 'subscription' },
      error: null,
    });
    await flush();
    expect(sm.isTierHydrated()).toBe(true);
    expect(fg.canAccess('ai_form_coach')).toBe(true);
  });

  it('no cache waits for the server, then hydrates on a free answer', async () => {
    const answer = scriptServer();
    const { sm, fg } = load();
    await sm.initBilling();
    await flush();
    expect(sm.isTierHydrated()).toBe(false);

    answer.resolve({ data: { tier: 'free', expires_at: null, source: 'none' }, error: null });
    await flush();
    expect(sm.isTierHydrated()).toBe(true);
    expect(fg.canAccess('ai_form_coach')).toBe(false);
  });

  it('whenTierHydrated() settles exactly when isTierHydrated() flips', async () => {
    const answer = scriptServer();
    const { sm } = load();
    let settled = false;
    void sm.whenTierHydrated().then(() => {
      settled = true;
    });
    await sm.initBilling();
    await flush();
    expect(settled).toBe(false);
    answer.resolve({ data: { tier: 'free', expires_at: null, source: 'none' }, error: null });
    await flush();
    expect(settled).toBe(true);
  });

  it('a server error leaves an expired cache un-hydrated (the gate timeout decides)', async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tier: 'pro', until: Date.now() - DAY }));
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: 'offline' } }));
    const { sm } = load();
    await sm.initBilling();
    await flush();
    expect(sm.isTierHydrated()).toBe(false);
  });
});
