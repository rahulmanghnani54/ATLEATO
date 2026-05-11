import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import type { Database } from '@/types/database';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    if (data.user) {
      // Create initial profile row
      const newProfile: ProfileInsert = {
        id: data.user.id,
        full_name: fullName.trim(),
        avatar_url: null,
        goal: 'build_muscle',
        gender: null,
        date_of_birth: null,
        height_cm: null,
        weight_kg: null,
        activity_level: 'moderately_active',
        selected_program: 'cbum_evolved',
        tdee: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        onboarding_complete: false,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase.from('profiles') as any).insert(newProfile);
      if (profileError) {
        setError('Account created but profile setup failed. Please try signing in.');
      }
    }

    setLoading(false);
    // Navigation handled by auth state listener
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Text style={styles.logoText}>FitAI Pro</Text>
          </View>

          <Text style={styles.headline}>Create your account</Text>
          <Text style={styles.subheadline}>Start your transformation today</Text>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="John Smith"
              placeholderTextColor={Colors.textTertiary}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Email</Text>
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
              placeholder="Min. 8 characters"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
            />

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />
          </View>

          <Button label="Create Account" onPress={handleSignup} loading={loading} fullWidth style={styles.btn} />

          <View style={styles.signinRow}>
            <Text style={styles.signinPrompt}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.signinLink}>Sign In</Text>
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
  logo: { alignItems: 'center', marginBottom: Spacing.xl },
  logoText: { fontSize: 36, fontFamily: 'Inter_700Bold', color: Colors.primary },
  headline: { ...Typography.h2, marginBottom: 4 },
  subheadline: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.lg },
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
  btn: { marginBottom: Spacing.lg },
  signinRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signinPrompt: { ...Typography.body, color: Colors.textSecondary },
  signinLink: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
