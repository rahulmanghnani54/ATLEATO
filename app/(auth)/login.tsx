/**
 * Sign in — Bold Canvas.
 *
 * The brand carries the screen: the wordmark sits in the dark crown, the light
 * body below it holds nothing but the form. Fields are borderless fills, and
 * the one emerald moment is the primary action — OAuth, "forgot password" and
 * the switch link all stay quiet so the eye lands on Sign in first.
 *
 * The crown scrolls INSIDE the canvas rather than being pinned, so the form
 * still has room once the keyboard is up.
 *
 * Auth is untouched: same supabase calls, same validation strings, same
 * anti-enumeration reset response. signup.tsx is its mirror image — any change
 * to the field, button or error treatment here belongs there too.
 */
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { Eye, EyeOff } from 'lucide-react-native';

import { CanvasScreen, Crown, Hairline } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/authErrors';
import { signInWithProvider, type OAuthProvider } from '@/lib/socialAuth';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = 'email' | 'password';

export default function Login() {
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // One key rather than a flag per input — only ever one field is focused.
  const [focus, setFocus] = useState<FieldKey | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) setError(authErrorMessage(authError.message, 'login'));
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot Password.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    // Respond identically whether or not the email exists, so the reset flow
    // can't be used to enumerate registered accounts (CWE-204).
    //
    // redirectTo is REQUIRED, and its absence is why this flow used to dead-end:
    // without it Supabase sends the user to the project's Site URL — the
    // marketing site — where there is no way to set a password, and the app has
    // no screen for it either. `atleato://reset-password` deep-links back to the
    // route below, which exchanges the link's session and takes the new password.
    await supabase.auth
      .resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('reset-password') })
      .catch(() => {});
    setLoading(false);
    Alert.alert('Check your email', "If an account exists for that address, we've sent a password reset link.");
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError('');
    setLoading(true);
    try {
      await signInWithProvider(provider);
      // On success the auth-state listener (app/_layout.tsx) navigates.
    } catch {
      setError('Could not sign in with that provider. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const keyboardAppearance = scheme === 'dark' ? 'dark' : 'light';
  const EyeIcon = showPassword ? EyeOff : Eye;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}
      >
        <CanvasScreen tabBar={false} bottomSpace={24}>
          <Crown
            eyebrow="Train · Fuel · Rise"
            title="Evulto"
            meta="Welcome back. Sign in to pick up where you left off."
          />

          <View style={styles.body}>
            {error ? (
              <Text
                style={styles.error}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {error}
              </Text>
            ) : null}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.field, focus === 'email' && styles.fieldOn]}
              placeholder="you@example.com"
              placeholderTextColor={tokens.textTertiary}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(null)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              keyboardAppearance={keyboardAppearance}
            />

            <Text style={styles.label}>Password</Text>
            <View style={[styles.fieldRow, focus === 'password' && styles.fieldOn]}>
              <TextInput
                style={styles.fieldInput}
                placeholder="••••••••"
                placeholderTextColor={tokens.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus(null)}
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                keyboardAppearance={keyboardAppearance}
              />
              <PressableScale
                onPress={() => setShowPassword((v) => !v)}
                haptic="light"
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.eyeBtn}
              >
                <EyeIcon size={19} color={tokens.textTertiary} />
              </PressableScale>
            </View>

            <PressableScale
              onPress={handleForgotPassword}
              haptic="light"
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              style={styles.quietBtn}
            >
              <Text style={styles.quietText}>Forgot password?</Text>
            </PressableScale>

            <PressableScale
              onPress={handleLogin}
              haptic="heavy"
              scaleTo={0.97}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
            </PressableScale>

            <View style={styles.dividerRow}>
              <Hairline style={styles.fill} />
              <Text style={styles.dividerText}>OR</Text>
              <Hairline style={styles.fill} />
            </View>

            {/* PressableScale wraps its target in a content-sized Animated.View,
                so the flex that splits the row lives on these cells, never on
                the button — on the button it is silently inert. */}
            <View style={styles.oauthRow}>
              <View style={styles.oauthCell}>
                <PressableScale
                  onPress={() => handleOAuth('google')}
                  haptic="light"
                  scaleTo={0.97}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  style={styles.oauth}
                >
                  <Text style={styles.oauthMark}>G</Text>
                  <Text style={styles.oauthText}>Google</Text>
                </PressableScale>
              </View>

              <View style={styles.oauthCell}>
                <PressableScale
                  onPress={() => handleOAuth('facebook')}
                  haptic="light"
                  scaleTo={0.97}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Facebook"
                  style={styles.oauth}
                >
                  <Text style={styles.oauthMark}>f</Text>
                  <Text style={styles.oauthText}>Facebook</Text>
                </PressableScale>
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchPrompt}>New to Evulto? </Text>
              <Link href="/(auth)/signup" asChild>
                <Pressable hitSlop={10} accessibilityRole="link" accessibilityLabel="Create an account">
                  <Text style={styles.switchLink}>Create account</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </CanvasScreen>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    fill: { flex: 1 },
    // The crown is full-bleed, so the gutter lives on the body instead of on
    // the canvas content style.
    body: { paddingHorizontal: 22, paddingTop: 26 },

    // Helpful, not alarming: coloured text on the page, never a red banner.
    error: {
      fontFamily: Fonts.bodySemi,
      fontSize: 13.5,
      lineHeight: 19,
      color: t.danger,
      marginBottom: 6,
    },

    label: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.7,
      textTransform: 'uppercase',
      color: t.textTertiary,
      marginTop: 20,
      marginBottom: 9,
    },
    field: {
      height: 58,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 0,
      backgroundColor: t.surfaceAlt,
      fontFamily: Fonts.bodyMedium,
      fontSize: 16,
      color: t.text,
    },
    // Borderless focus: the fill warms to the emerald tint instead of growing a
    // ring, which would put a visible edge back on the field.
    fieldOn: { backgroundColor: t.accentSoft },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      paddingRight: 8,
      backgroundColor: t.surfaceAlt,
    },
    fieldInput: {
      flex: 1,
      height: 58,
      paddingHorizontal: 18,
      paddingVertical: 0,
      fontFamily: Fonts.bodyMedium,
      fontSize: 16,
      color: t.text,
    },
    eyeBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },

    quietBtn: { alignSelf: 'flex-end', marginTop: 14 },
    quietText: {
      fontFamily: Fonts.bodySemi,
      fontSize: 13,
      color: t.textSecondary,
    },

    // The screen's single accent. The hairline is required: brand emerald is
    // only 2.54:1 on a light page, so the deep tone is what draws the edge.
    primary: {
      marginTop: 26,
      minHeight: 58,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.accentLine,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    primaryText: {
      fontFamily: Fonts.displayBold,
      fontSize: 16,
      letterSpacing: -0.3,
      color: t.accentInk,
    },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 18 },
    dividerText: {
      fontFamily: Fonts.legacyMono,
      fontSize: 9,
      letterSpacing: 1.7,
      color: t.textTertiary,
      marginHorizontal: 12,
    },

    oauthRow: { flexDirection: 'row', gap: 10 },
    oauthCell: { flex: 1 },
    oauth: {
      minHeight: 54,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: t.surfaceAlt,
    },
    oauthMark: { fontFamily: Fonts.displayBold, fontSize: 15, color: t.textSecondary },
    oauthText: { fontFamily: Fonts.bodySemi, fontSize: 14, color: t.text },

    switchRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 30,
    },
    switchPrompt: { fontFamily: Fonts.body, fontSize: 14, color: t.textSecondary },
    switchLink: { fontFamily: Fonts.displayMedium, fontSize: 14, color: t.text },
  });
