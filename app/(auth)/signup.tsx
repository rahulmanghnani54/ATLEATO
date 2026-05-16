import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields.'); return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    setLoading(false);
    if (authError) { setError(authError.message); return; }
    // Navigation handled by auth state listener
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoArea}>
            <Text style={styles.logoMono}>FITAI PRO</Text>
            <Text style={styles.logoHero}>START YOUR{'\n'}JOURNEY.</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.monoLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="John Smith"
              placeholderTextColor={Colors.textTertiary}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              keyboardAppearance="dark"
            />

            <Text style={[styles.monoLabel, { marginTop: Spacing.md }]}>EMAIL</Text>
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
            <TextInput
              style={styles.input}
              placeholder="Min. 8 characters"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
              keyboardAppearance="dark"
            />

            <Text style={[styles.monoLabel, { marginTop: Spacing.md }]}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              keyboardAppearance="dark"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && { opacity: 0.5 }]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>{loading ? '...' : 'CREATE ACCOUNT'}</Text>
          </TouchableOpacity>

          <View style={styles.signinRow}>
            <Text style={styles.signinPrompt}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.signinLink}>SIGN IN</Text>
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
  logoArea: { marginBottom: 40 },
  logoMono: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 2.4 },
  logoHero: { fontFamily: Fonts.display, fontSize: 44, color: Colors.text, lineHeight: 42, letterSpacing: -1.2, marginTop: 6 },
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
  primaryBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 15, color: Colors.accentInk, letterSpacing: 0.8 },
  signinRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signinPrompt: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary },
  signinLink: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.primary, letterSpacing: 1 },
});
