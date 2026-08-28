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
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CanvasScreen, Crown, Hairline } from '@/components/ui/canvas';
import { Skeleton } from '@/components/ui/motion';
import { supabase } from '@/lib/supabase';
import { Fonts } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

/**
 * Presentation only — mirrors `status` so the screen can stop shimmering at a
 * dead end. It never gates the exchange or the routing below.
 */
type Tone = 'busy' | 'cancelled' | 'failed' | 'done';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState('Signing you in…');
  const [tone, setTone] = useState<Tone>('busy');
  const ran = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (ran.current) return;   // guard against re-runs / double exchange
    ran.current = true;

    (async () => {
      const code = typeof params.code === 'string' ? params.code : undefined;

      if (params.error || !code) {
        setStatus('Sign-in was cancelled.');
        setTone('cancelled');
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
          setTone('failed');
          timerRef.current = setTimeout(() => router.replace('/(auth)/login'), 900);
          return;
        }
      }
      // Session is set — the root auth listener (app/_layout.tsx) picks it up and
      // the gate routes to onboarding / the app. Show a brief "success" state.
      setStatus('Signed in! Loading your dashboard…');
      setTone('done');
    })();

    // If the auth-gate routes away before a pending timer fires, don't navigate
    // from a dead screen.
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaving = tone === 'cancelled' || tone === 'failed';

  return (
    <CanvasScreen scroll={false} tabBar={false}>
      <Crown
        eyebrow="Secure sign-in"
        title="Evulto"
        meta="Finishing the handoff from your provider."
      />

      <View style={styles.body}>
        <Text style={styles.label}>Status</Text>
        <Text
          style={[styles.status, styles[tone]]}
          accessibilityRole={tone === 'failed' ? 'alert' : 'text'}
          accessibilityLiveRegion="polite"
        >
          {status}
        </Text>

        <Hairline style={styles.rule} />

        {leaving ? (
          <Text style={styles.note}>Returning you to sign-in…</Text>
        ) : (
          // Two settling bars rather than a spinner: a spinner reads as "this
          // might be stuck", the bars read as work still arriving.
          <View style={styles.bars}>
            <Skeleton height={6} radius={0} />
            <Skeleton height={6} radius={0} width="58%" />
          </View>
        )}
      </View>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    body: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 22,
      paddingBottom: 24,
    },
    label: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: t.textTertiary,
    },
    status: {
      fontFamily: Fonts.displayBold,
      fontSize: 27,
      lineHeight: 30,
      // -0.04em at 27px.
      letterSpacing: -1.08,
      marginTop: 8,
    },
    busy: { color: t.text },
    // A cancelled sign-in is a choice, not a fault — it stays in the quiet ink.
    cancelled: { color: t.textSecondary },
    failed: { color: t.danger },
    // The screen's single accent spend.
    done: { color: t.accentText },
    rule: { marginTop: 26 },
    bars: { marginTop: 22, gap: 10 },
    note: {
      fontFamily: Fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: t.textTertiary,
      marginTop: 22,
    },
  });
