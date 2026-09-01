/**
 * Set a new password — the destination of the reset email.
 *
 * This route did not exist. `resetPasswordForEmail` was called with no
 * `redirectTo`, so the emailed link resolved to the Supabase Site URL (the
 * marketing site) and there was nowhere in the app to type a new password: a
 * user who forgot theirs could never get back in.
 *
 * Supabase delivers the reset as a deep link carrying a recovery `code` (PKCE)
 * or, on older links, `access_token`/`refresh_token` in the fragment. Either way
 * the session it establishes is what authorises `updateUser({ password })` — so
 * the exchange has to happen here, before we accept the new password.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';

import { CanvasScreen, Crown, Hairline } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/authErrors';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Mirrors the signup rule. Kept in step with it deliberately: a reset that
// accepts a weaker password than signup would be a way around the policy.
const MIN_PASSWORD = 8;

export default function ResetPassword() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 'checking' until we know the link is usable — offering the form before then
  // invites the user to type a password we cannot actually save.
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    (async () => {
      if (params.error_description) { setLinkState('invalid'); return; }

      // A recovery link may already have been turned into a session by the
      // deep-link handler, so check for one before spending the single-use code.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) { setLinkState('ready'); return; }

      const code = typeof params.code === 'string' ? params.code : undefined;
      if (!code) { setLinkState('invalid'); return; }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      setLinkState(exErr ? 'invalid' : 'ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!password || !confirm) { setError('Enter and confirm your new password.'); return; }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`); return;
    }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setError('');
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (upErr) { setError(authErrorMessage(upErr.message, 'login')); return; }

    // updateUser leaves the recovery session signed in, so the auth gate in
    // _layout routes into the app on its own once we step off this screen.
    Alert.alert('Password updated', 'You are signed in with your new password.');
    router.replace('/(tabs)');
  };

  const PasswordEye = showPassword ? EyeOff : Eye;
  const keyboardAppearance = scheme === 'dark' ? 'dark' : 'light';

  return (
    <CanvasScreen scroll tabBar={false}>
      <Crown
        eyebrow="Secure sign-in"
        title={'Set a new\npassword.'}
        meta="Choose something you have not used here before."
      />

      <View style={styles.body}>
        {linkState === 'checking' && (
          <Text style={styles.note}>Checking your reset link…</Text>
        )}

        {linkState === 'invalid' && (
          <>
            <Text style={[styles.note, styles.bad]} accessibilityRole="alert">
              This reset link has expired or has already been used. Request a new one from the
              sign-in screen.
            </Text>
            <Hairline style={styles.rule} />
            <PressableScale
              onPress={() => router.replace('/(auth)/login')}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              style={[styles.cta, { backgroundColor: tokens.accent }]}
            >
              <Text style={[styles.ctaText, { color: tokens.accentInk }]}>Back to sign in</Text>
            </PressableScale>
          </>
        )}

        {linkState === 'ready' && (
          <>
            <Text style={styles.label}>New password</Text>
            <View style={styles.field}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="At least 8 characters"
                placeholderTextColor={tokens.textTertiary}
                keyboardAppearance={keyboardAppearance}
                style={[styles.input, { color: tokens.text }]}
                accessibilityLabel="New password"
              />
              <PressableScale
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.eye}
              >
                <PasswordEye size={18} color={tokens.textTertiary} />
              </PressableScale>
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.field}>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Type it again"
                placeholderTextColor={tokens.textTertiary}
                keyboardAppearance={keyboardAppearance}
                style={[styles.input, { color: tokens.text }]}
                accessibilityLabel="Confirm new password"
              />
            </View>

            {!!error && (
              <Text style={[styles.note, styles.bad]} accessibilityRole="alert">{error}</Text>
            )}

            <Hairline style={styles.rule} />

            <PressableScale
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save new password"
              style={[styles.cta, { backgroundColor: tokens.accent, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={[styles.ctaText, { color: tokens.accentInk }]}>
                {saving ? 'Saving…' : 'Save password'}
              </Text>
            </PressableScale>
          </>
        )}
      </View>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    body: { paddingHorizontal: 22, paddingTop: 26 },
    label: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: t.textTertiary,
      marginBottom: 8,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
      marginBottom: 22,
    },
    input: { flex: 1, fontFamily: Fonts.display, fontSize: 17, paddingVertical: 12 },
    eye: { padding: 8 },
    note: { fontFamily: Fonts.display, fontSize: 14.5, color: t.textSecondary, marginBottom: 14 },
    bad: { color: t.danger },
    rule: { marginVertical: 18 },
    cta: { paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
    ctaText: { fontFamily: Fonts.displayMedium, fontSize: 15, letterSpacing: 0.3 },
  });
