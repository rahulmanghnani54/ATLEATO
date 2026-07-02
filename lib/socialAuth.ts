import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

// Dismiss any auth session left open in the browser (e.g. after a warm reload).
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'facebook';

/**
 * Sign in with a social provider via Supabase's browser OAuth flow (PKCE).
 *
 * Flow:
 *   1. signInWithOAuth() returns the provider consent URL (skipBrowserRedirect
 *      so WE open it, not supabase-js).
 *   2. openAuthSessionAsync opens an in-app browser (Android Custom Tab /
 *      iOS ASWebAuthenticationSession) and resolves when the provider redirects
 *      back to atleato://auth-callback.
 *   3. We pull the ?code= off that redirect and exchangeCodeForSession(), which
 *      completes PKCE. The session persists via the SecureStore adapter and
 *      app/_layout.tsx's onAuthStateChange drives navigation.
 *
 * Resolves silently if the user cancels. Throws on a real failure — the caller
 * shows a single generic message (no provider-specific enumeration).
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  // In a standalone build (scheme "atleato") this is atleato://auth-callback.
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No authorization URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // User backed out of the browser — not a hard error.
  if (result.type !== 'success') return;

  const code = extractCode(result.url);
  if (!code) throw new Error('No authorization code in the redirect');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

/** Pull the OAuth `code` out of the redirect URL (query param or fragment). */
function extractCode(url: string): string | null {
  try {
    const qp = Linking.parse(url).queryParams;
    const fromQuery = qp?.code;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  } catch {
    // fall through to the regex below
  }
  const m = url.match(/[?&#]code=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
