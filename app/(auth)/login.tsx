import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';
import { AnimatedLogo } from '@/components/ui';
import { authErrorMessage } from '@/lib/authErrors';
import { signInWithProvider, type OAuthProvider } from '@/lib/socialAuth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) setError(authErrorMessage(authError.message, 'login'));
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot Password.'); return; }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    // Respond identically whether or not the email exists, so the reset flow
    // can't be used to enumerate registered accounts (CWE-204).
    await supabase.auth.resetPasswordForEmail(email.trim()).catch(() => {});
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Logo — animated intro + idle pulse */}
          <AnimatedLogo />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.monoLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              keyboardAppearance="dark"
            />

            <Text style={[styles.monoLabel, { marginTop: Spacing.md }]}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                keyboardAppearance="dark"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>{loading ? '...' : 'SIGN IN'}</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social sign-in */}
          <TouchableOpacity
            style={[styles.oauthBtn, styles.googleBtn, loading && { opacity: 0.5 }]}
            onPress={() => handleOAuth('google')}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.oauthBtn, styles.facebookBtn, loading && { opacity: 0.5 }]}
            onPress={() => handleOAuth('facebook')}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.facebookF}>f</Text>
            <Text style={styles.facebookBtnText}>Continue with Facebook</Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={styles.signupLink}>SIGN UP</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 40 },
  logoArea:     { marginBottom: 48, alignItems: 'center' },
  wordmark:     { flexDirection: 'row', alignItems: 'baseline' },
  wordmarkA:    { fontFamily: Fonts.display, fontSize: 48, color: '#ff6b35', letterSpacing: -1 },
  wordmarkRest: { fontFamily: Fonts.display, fontSize: 48, color: Colors.text, letterSpacing: -1 },
  tmSymbol:     { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary, marginLeft: 3, marginBottom: 28 },
  wordmarkBar:  { height: 4, backgroundColor: '#ff6b35', borderRadius: 2, marginTop: 4, marginBottom: 8, alignSelf: 'stretch' },
  logoHero:     { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary, letterSpacing: 2, marginTop: 8 },
  errorBox: {
    backgroundColor: 'rgba(255,91,58,0.1)', borderWidth: 1, borderColor: 'rgba(255,91,58,0.3)',
    borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontFamily: Fonts.body, fontSize: 13 },
  form: { marginBottom: 24 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 8 },
  input: {
    height: 52, backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border,
    fontFamily: Fonts.body, fontSize: 15, color: Colors.text,
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 12 },
  forgotText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1.2 },
  primaryBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 15, color: Colors.accentInk, letterSpacing: 0.8 },

  // Password row with show/hide toggle
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  passwordInput: {
    flex: 1, height: 50, paddingHorizontal: 16,
    fontFamily: Fonts.body, fontSize: 15, color: Colors.text,
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeIcon: { fontSize: 18 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signupPrompt: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary },
  signupLink: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.primary, letterSpacing: 1 },

  // ── Social sign-in ──
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.5, marginHorizontal: 12 },
  oauthBtn: {
    height: 52, borderRadius: Radius.sm, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  googleBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.borderStrong },
  googleG: { fontFamily: Fonts.displayBold, fontSize: 16, color: '#4285F4', marginRight: 10 },
  googleBtnText: { fontFamily: Fonts.bodySemi, fontSize: 14.5, color: Colors.text },
  facebookBtn: { backgroundColor: '#1877F2' },
  facebookF: { fontFamily: Fonts.displayBold, fontSize: 17, color: '#FFFFFF', marginRight: 10 },
  facebookBtnText: { fontFamily: Fonts.bodySemi, fontSize: 14.5, color: '#FFFFFF' },
});
