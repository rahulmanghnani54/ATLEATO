/**
 * PostHog — product analytics. So we know whether the product WORKS, not just
 * whether it crashed (that's Sentry's job, see lib/sentry.ts).
 *
 * Env-gated exactly like Sentry: reads EXPO_PUBLIC_POSTHOG_KEY at build time.
 * With no key set, every export here is a safe no-op — the app runs identically,
 * nothing is sent, nothing can throw. Paste the project key (PostHog → Project
 * Settings → Project API Key) and rebuild to go live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVACY — NON-NEGOTIABLE. The app's own marketing promises this.
 *
 *   NEVER send: photos, video frames, pose landmarks, body measurements, health
 *   metrics, message/chat content, email addresses, names, or ANY free text the
 *   user typed.
 *
 *   Event properties are COUNTS, DURATIONS, ENUMS and BOOLEANS only. If you
 *   cannot describe a property as "a number, a yes/no, or one of a fixed set of
 *   short labels", it does not go in.
 *
 * That rule is enforced twice: read it here, and `sanitize()` below drops
 * anything that looks like free text or a denylisted key at runtime. The
 * sanitiser is a safety net, not permission to be careless.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   - initAnalytics()             once, at the very top of app/_layout.tsx
 *   - identify(userId)            when the user signs in
 *   - reset()                     when the user signs out
 *   - track('workout_completed', { duration_s: 1820, sets: 12 })
 *   - screen('paywall')
 */
import PostHog from 'posthog-react-native';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
// EU projects need https://eu.i.posthog.com — US cloud is the default.
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export const ANALYTICS_ENABLED = KEY.length > 0;

/**
 * The complete event vocabulary. A union — not `string` — so a typo is a compile
 * error instead of a junk event nobody notices for three months.
 *
 * Deliberately small. These twelve answer "does this product work?": can people
 * get through onboarding, do they train, does form-checking deliver a grade,
 * do they talk to the coach, and do they pay. Adding an event is a decision, not
 * a reflex — if it wouldn't change what we build, don't send it.
 */
export type AnalyticsEvent =
  | 'app_opened'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'workout_started'
  | 'workout_completed'
  | 'form_check_started'
  | 'form_check_set_graded'
  | 'coach_message_sent'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  // Store took the money but the entitlement webhook had not landed inside the
  // poll window. Not a failure — but the gap between completed and pending is
  // the only read we have on how often paying users see a delay.
  | 'purchase_pending'
  // Technique walkthrough opened (trigger: first_time | smart | manual).
  | 'tutorial_shown'
  // "I know this — skip" tapped; two of these per exercise unlock the fast path.
  | 'tutorial_skipped'
  // Walkthrough watched (or CONTINUE past the poster) — the fast path is earned.
  | 'tutorial_completed'
  // Form Check paused a set because one fault repeated in 3 of the last 4 reps.
  | 'technique_retrigger_shown';

/**
 * Allowed property values. Strings are for ENUMS ONLY (a tier name, an exercise
 * slug, a screen id) — never a sentence, never anything the user typed.
 */
export type AnalyticsProps = Record<string, number | boolean | string | null | undefined>;

/** Enum labels are short by nature; anything longer is free text and gets dropped. */
const MAX_ENUM_LEN = 40;

/**
 * Property names that must never carry a value, whatever a caller passes. Cheap
 * insurance against a well-meaning future edit ("just the email, for support").
 */
const DENY = /email|e_mail|name|phone|address|message|text|prompt|reply|note|photo|image|frame|landmark|pose|keypoint|weight|height|bmi|body|heart|hr_|calorie|dob|birth/i;

/** Strip anything that isn't a count, duration, enum or boolean. See PRIVACY above. */
function sanitize(props?: AnalyticsProps): Record<string, number | boolean | string> | undefined {
  if (!props) return undefined;
  const out: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (DENY.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && value.length > 0 && value.length <= MAX_ENUM_LEN) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

let client: PostHog | null = null;

export function initAnalytics(): void {
  if (client || !ANALYTICS_ENABLED) return;
  // Don't pollute the funnel with our own dev sessions — release builds only,
  // same rule Sentry uses.
  if (__DEV__) return;
  try {
    client = new PostHog(KEY, {
      host: HOST,
      // Session replay records the SCREEN — camera previews, chat, everything we
      // promised never to collect. Stays off. Do not flip this on.
      enableSessionReplay: false,
      // Our own typed app_opened owns app-open counting; the SDK's lifecycle
      // events would double-count it and add events outside AnalyticsEvent.
      captureAppLifecycleEvents: false,
      disableSurveys: true,
      // Anonymous users stay anonymous — a person profile is created only once
      // they sign in and we call identify().
      personProfiles: 'identified_only',
    });
  } catch {
    // A misconfigured key must never take the app down with it.
    client = null;
  }
}

/** Record a product event. Safe no-op when disabled. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!client) {
    if (__DEV__) console.log('[analytics:disabled]', event, props ?? '');
    return;
  }
  try {
    client.capture(event, sanitize(props));
  } catch { /* analytics must never break a user flow */ }
}

/** Attach the signed-in user (id only — never their email or name). */
export function identify(userId: string, traits?: AnalyticsProps): void {
  if (!client || !userId) return;
  try {
    client.identify(userId, sanitize(traits));
  } catch { /* ignore */ }
}

/** Record a screen view. `name` is a route id, not a title the user can set. */
export function screen(name: string): void {
  if (!client) return;
  try {
    client.screen(name);
  } catch { /* ignore */ }
}

/** Clear the identity on sign-out so the next user isn't merged into this one. */
export function reset(): void {
  if (!client) return;
  try {
    client.reset();
  } catch { /* ignore */ }
}
