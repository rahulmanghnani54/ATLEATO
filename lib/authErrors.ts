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
  context: 'login' | 'signup' | 'reset' = 'login',
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

  // 'reset' = the set-a-new-password screen, reached only by spending a valid
  // recovery link. The user's identity is already proven, so the enumeration
  // rule above does not apply and staying vague only hides why the save failed.
  // The login string in particular ("Email or password is incorrect.") is
  // nonsense on a screen with no email field and no old-password field.
  if (context === 'reset') {
    if (m.includes('should be different') || m.includes('different from the old')) {
      return 'Choose a password you have not used on this account before.';
    }
    if (m.includes('pwned') || m.includes('breach') || m.includes('compromised') || m.includes('leaked')) {
      return 'That password has appeared in a known data breach. Please choose a different one.';
    }
    if (m.includes('at least') || m.includes('too short') || m.includes('weak') || m.includes('password')) {
      return 'That password is too weak. Use at least 8 characters.';
    }
    if (m.includes('reauthentication')) {
      return 'For security, request a fresh reset link and try again.';
    }
    // Covers "Auth session missing!", expired/invalid JWT, and anything else:
    // the link is what died, and requesting a new one is the way out.
    return 'Your reset link is no longer valid. Request a new one from the sign-in screen.';
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
