/**
 * Create account — Bold Canvas.
 *
 * The deliberate twin of login.tsx: same crown, same borderless fills, same
 * accent pill in the same place, same quiet OAuth pair. A user switching
 * between the two should see one screen change its mind, not two screens.
 *
 * The crown scrolls INSIDE the canvas rather than being pinned, so the four
 * fields still have room once the keyboard is up.
 *
 * Auth is untouched: same supabase signUp, same validation strings and order,
 * same "confirm your inbox" branch when no session comes back.
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
import { Eye, EyeOff } from 'lucide-react-native';

import { CanvasScreen, Crown, Hairline } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/authErrors';
import { signInWithProvider, type OAuthProvider } from '@/lib/socialAuth';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

type FieldKey = 'name' | 'email' | 'password' | 'confirm';

// Mirrors login.tsx. Signup had NO format check, so a typo like "gmail com"
// went straight to Supabase, which rejected it — and the enumeration-safe
// error mapping then told the user "If you already have one, try signing in",
// which is exactly the wrong advice for a misspelled address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // One key rather than a flag per input — only ever one field is focused.
  const [focus, setFocus] = useState<FieldKey | null>(null);

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields.'); return;
    }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    setLoading(false);
    if (authError) { setError(authErrorMessage(authError.message, 'signup')); return; }
    // If email confirmation is required, no session is returned — tell the user
    // to check their inbox. Otherwise the auth-state listener navigates.
    if (!data.session) {
      Alert.alert('Almost there', 'Check your inbox to confirm your account, then sign in.');
    }
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
  const PasswordEye = showPassword ? EyeOff : Eye;
  const ConfirmEye = showConfirm ? EyeOff : Eye;

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
            meta="Create your account. Your plan is built the moment you're in."
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

            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={[styles.field, focus === 'name' && styles.fieldOn]}
              placeholder="John Smith"
              placeholderTextColor={tokens.textTertiary}
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setFocus('name')}
              onBlur={() => setFocus(null)}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              keyboardAppearance={keyboardAppearance}
            />

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
                placeholder="Min. 8 characters"
                placeholderTextColor={tokens.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus(null)}
                secureTextEntry={!showPassword}
                returnKeyType="next"
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
                <PasswordEye size={19} color={tokens.textTertiary} />
              </PressableScale>
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <View style={[styles.fieldRow, focus === 'confirm' && styles.fieldOn]}>
              <TextInput
                style={styles.fieldInput}
                placeholder="••••••••"
                placeholderTextColor={tokens.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocus('confirm')}
                onBlur={() => setFocus(null)}
                secureTextEntry={!showConfirm}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                keyboardAppearance={keyboardAppearance}
              />
              <PressableScale
                onPress={() => setShowConfirm((v) => !v)}
                haptic="light"
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showConfirm ? 'Hide confirmed password' : 'Show confirmed password'}
                style={styles.eyeBtn}
              >
                <ConfirmEye size={19} color={tokens.textTertiary} />
              </PressableScale>
            </View>

            <PressableScale
              onPress={handleSignup}
              haptic="heavy"
              scaleTo={0.97}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>
                {loading ? 'Creating account…' : 'Create account'}
              </Text>
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
              <Text style={styles.switchPrompt}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable hitSlop={10} accessibilityRole="link" accessibilityLabel="Sign in">
                  <Text style={styles.switchLink}>Sign in</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </CanvasScreen>
      </KeyboardAvoidingView>
    </View>
  );
}

// Kept byte-for-byte in step with login.tsx — the two screens share one look.
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
