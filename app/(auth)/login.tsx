import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    }
    // Navigation handled by auth state listener in _layout.tsx
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap Forgot Password.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) {
      setError(resetError.message);
    } else {
      Alert.alert('Check your email', 'We sent a password reset link to ' + email.trim());
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Text style={styles.logoText}>FitAI Pro</Text>
            <Text style={styles.tagline}>Your AI-powered fitness coach</Text>
          </View>

          <Text style={styles.headline}>Welcome back</Text>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
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
            />

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          <Button label="Sign In" onPress={handleLogin} loading={loading} fullWidth style={styles.signInBtn} />

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={styles.signupLink}>Sign Up</Text>
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
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  logo: { alignItems: 'center', marginBottom: Spacing.xxl },
  logoText: { fontSize: 36, fontFamily: 'Inter_700Bold', color: Colors.primary },
  tagline: { ...Typography.caption, marginTop: 4 },
  headline: { ...Typography.h2, marginBottom: Spacing.lg },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontFamily: 'Inter_400Regular', fontSize: 14 },
  form: { marginBottom: Spacing.lg },
  label: { ...Typography.label, marginBottom: 6 },
  input: {
    height: 52,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: Spacing.sm },
  forgotText: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 },
  signInBtn: { marginBottom: Spacing.lg },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signupPrompt: { ...Typography.body, color: Colors.textSecondary },
  signupLink: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
