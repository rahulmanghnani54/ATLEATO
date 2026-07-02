/**
 * authErrorMessage — maps raw Supabase Auth error text to generic,
 * enumeration-safe strings shown to the user.
 *
 * Security (OWASP Auth Cheat Sheet pillar 4 / CWE-204 "Observable Response
 * Discrepancy"): never reveal whether a given email is registered. Login must
 * return the SAME message for "wrong password" and "no such account", and the
 * password-reset flow must respond identically whether or not the email exists.
 *
 * We still surface a couple of genuinely-actionable, low-leak cases
 * (rate-limited, email-not-confirmed) because they help real users without
 * meaningfully aiding enumeration (both require the user to already know a
 * valid credential pair or their own signup state).
 */
export function authErrorMessage(
  raw?: string | null,
  context: 'login' | 'signup' = 'login',
): string {
  const m = (raw || '').toLowerCase();

  if (m.includes('too many') || m.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('email not confirmed') || m.includes('not confirmed')) {
    return 'Please confirm your email — check your inbox for the link.';
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) {
    return 'Network error. Check your connection and try again.';
  }

  if (context === 'signup') {
    if (m.includes('password')) {
      return 'Please choose a stronger password (at least 8 characters).';
    }
    // "User already registered", provider conflicts, etc. — stay generic so we
    // don't confirm the email exists.
    return "Couldn't create your account. If you already have one, try signing in.";
  }

  // login: collapse invalid-credentials AND user-not-found into one message.
  return 'Email or password is incorrect.';
}
