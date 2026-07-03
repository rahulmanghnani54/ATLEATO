/**
 * OAuth deep-link callback.
 *
 * Google/Facebook (via Supabase) redirect back to atleato://auth-callback?code=…
 * On Android the OS delivers that deep link straight to expo-router (the in-app
 * browser doesn't always intercept it), so we need a real route to catch it,
 * exchange the PKCE code for a session, and let the root auth-gate route the
 * user into onboarding / the app.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/theme';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState('Signing you in…');
  const ran = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ran.current) return;   // guard against re-runs / double exchange
    ran.current = true;

    (async () => {
      const code = typeof params.code === 'string' ? params.code : undefined;

      if (params.error || !code) {
        setStatus('Sign-in was cancelled.');
        timerRef.current = setTimeout(() => router.replace('/(auth)/login'), 700);
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // A common benign case: the code was already exchanged by the in-app
        // browser path — a session may already exist, in which case the auth
        // gate will route away regardless.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setStatus('Could not complete sign-in. Please try again.');
          timerRef.current = setTimeout(() => router.replace('/(auth)/login'), 900);
          return;
        }
      }
      // Session is set — the root auth listener (app/_layout.tsx) picks it up and
      // the gate routes to onboarding / the app. Show a brief "success" state.
      setStatus('Signed in! Loading your dashboard…');
    })();

    // If the auth-gate routes away before a pending timer fires, don't navigate
    // from a dead screen.
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { color: Colors.text, fontSize: 15, fontFamily: Fonts.body, textAlign: 'center' },
});
