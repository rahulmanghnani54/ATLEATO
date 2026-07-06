/**
 * Sentry — crash + error reporting. So WE catch the next bug, not the user.
 *
 * Env-gated like analytics: reads EXPO_PUBLIC_SENTRY_DSN at build time. With no
 * DSN set, every export here is a safe no-op — the app runs identically, nothing
 * is sent. Paste the DSN (create a React Native project at sentry.io) and rebuild
 * to go live.
 *
 * Usage:
 *   - initSentry()            once, at the very top of app/_layout.tsx
 *   - Sentry.wrap(RootLayout) around the root component (in _layout.tsx)
 *   - captureError(err, ctx)  anywhere we catch something worth knowing about
 */
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
export const SENTRY_ENABLED = DSN.length > 0;

let started = false;

export function initSentry(): void {
  if (started || !SENTRY_ENABLED) return;
  started = true;
  Sentry.init({
    dsn: DSN,
    // Don't spam events in development — only real (release) builds report.
    enabled: !__DEV__,
    // Performance tracing at a light sample rate (cheap; upgrade later if needed).
    tracesSampleRate: 0.2,
    // Attach useful context automatically.
    sendDefaultPii: false,
    // Tag the release/environment so we can filter by build.
    environment: __DEV__ ? 'development' : 'production',
    // Trim noisy breadcrumbs.
    maxBreadcrumbs: 50,
  });
}

/** Re-export so screens can `import { Sentry } from '@/lib/sentry'`. */
export { Sentry };

/** Capture a handled error with optional context. Safe no-op when disabled. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_ENABLED) {
    if (__DEV__) console.warn('[sentry:disabled] would report:', error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Attach the signed-in user to error reports (no PII beyond the id). */
export function setSentryUser(userId: string | null): void {
  if (!SENTRY_ENABLED) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** Leave a breadcrumb (a trail of what happened before an error). */
export function breadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!SENTRY_ENABLED) return;
  Sentry.addBreadcrumb({ message, data, level: 'info' });
}
