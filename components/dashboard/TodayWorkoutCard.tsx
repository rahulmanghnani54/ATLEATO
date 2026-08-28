import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing, Radius, Typography } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';

const PROGRAM_NAMES: Record<string, string> = {
  arnold_blueprint: "The Monument's Blueprint",
  cbum_evolved: 'The Sculptor Method',
  nippard_fundamentals: 'Science Fundamentals',
  ct_strength: 'Commander Strength',
  dr_mike_mav: 'MAV Hypertrophy',
};

export function TodayWorkoutCard() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const programName = PROGRAM_NAMES[profile?.selected_program ?? ''] ?? 'Your Program';
  const styles = useThemedStyles(makeStyles);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/workout-session' as any)}
      activeOpacity={0.85}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeIcon}>💪</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>Today's Workout</Text>
        <Text style={styles.program}>{programName}</Text>
        <Text style={styles.sub}>Tap to start session</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.accent,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    badge: {
      width: 48,
      height: 48,
      // A light wash on the emerald fill; `accentSoft` is that same idea and
      // carries its own alpha, so it lifts the badge on either scheme.
      backgroundColor: t.accentSoft,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeIcon: { fontSize: 24 },
    body: { flex: 1 },
    // The card is a brand-emerald fill: white on it is 2.54:1, the dark emerald
    // ink is 7.38:1. Every label here therefore rides accentInk, not white.
    label: { fontSize: 12, fontFamily: 'Inter_500Medium', color: t.accentInk, opacity: 0.8 },
    program: { fontSize: 16, fontFamily: 'Inter_700Bold', color: t.accentInk, marginTop: 2 },
    sub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: t.accentInk, opacity: 0.75, marginTop: 2 },
    arrow: { fontSize: 24, color: t.accentInk, opacity: 0.8 },
  });
