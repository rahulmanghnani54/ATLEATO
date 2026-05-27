import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

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
    if (authError) setError(authError.message);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap Forgot Password.'); return; }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (resetError) setError(resetError.message);
    else Alert.alert('Check your email', 'We sent a password reset link to ' + email.trim());
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.wordmark}>
              <Text style={styles.wordmarkA}>A</Text>
              <Text style={styles.wordmarkRest}>TLEATO</Text>
              <Text style={styles.tmSymbol}>™</Text>
            </View>
            <View style={styles.wordmarkBar} />
            <Text style={styles.logoHero}>TRAIN.FUEL.RISE.</Text>
          </View>

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
    height: 56, backgroundColor: '#ff6b35', borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 15, color: '#1a1208', letterSpacing: 0.8 },

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
});
