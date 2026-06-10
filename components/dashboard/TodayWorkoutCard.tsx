import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  badge: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { fontSize: 24 },
  body: { flex: 1 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.8)' },
  program: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff', marginTop: 2 },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  arrow: { fontSize: 24, color: 'rgba(255,255,255,0.8)' },
});
