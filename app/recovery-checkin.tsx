import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card } from '@/components/ui';
import { RecoverySlider } from '@/components/recovery/RecoverySlider';
import { useSubmitRecovery } from '@/hooks/useRecoveryCheckin';
import { calculateRecovery } from '@/lib/recoveryEngine';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function RecoveryCheckin() {
  const router = useRouter();
  const { mutateAsync, isPending } = useSubmitRecovery();

  const [sleepHours, setSleepHours] = useState(7.5);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);

  const preview = calculateRecovery({ sleepHours, sleepQuality, soreness, energy, stress });

  const scoreColor =
    preview.recoveryScore >= 85 ? '#16a34a' :
    preview.recoveryScore >= 70 ? '#65a30d' :
    preview.recoveryScore >= 50 ? '#d97706' :
    preview.recoveryScore >= 35 ? '#ea580c' : '#dc2626';

  const handleSubmit = async () => {
    try {
      await mutateAsync({ sleepHours, sleepQuality, soreness, energy, stress });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save your check-in. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Morning Check-In</Text>
        <Text style={styles.subtitle}>How are you feeling today?</Text>

        {/* Live recovery score preview */}
        <Card style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View>
              <Text style={styles.scoreLabel}>Recovery Score</Text>
              <Text style={[styles.score, { color: scoreColor }]}>{preview.recoveryScore}</Text>
              <Text style={[styles.scoreBadge, { color: scoreColor }]}>{preview.label}</Text>
            </View>
            <View style={styles.modifierBox}>
              <Text style={styles.modifierLabel}>Volume</Text>
              <Text style={[styles.modifier, { color: scoreColor }]}>
                {preview.volumeModifier >= 1 ? '+' : ''}{Math.round((preview.volumeModifier - 1) * 100)}%
              </Text>
            </View>
          </View>
          <Text style={styles.recommendation}>{preview.recommendation}</Text>
        </Card>

        {/* Sleep */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>😴 Sleep</Text>
          <RecoverySlider
            label="Hours slept"
            value={sleepHours}
            min={3}
            max={12}
            step={0.5}
            onChange={setSleepHours}
            lowLabel="3h"
            highLabel="12h"
          />
          <RecoverySlider
            label="Sleep quality"
            value={sleepQuality}
            min={1}
            max={5}
            onChange={setSleepQuality}
            lowLabel="Poor"
            highLabel="Excellent"
          />
        </Card>

        {/* Physical */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>💪 Physical State</Text>
          <RecoverySlider
            label="Muscle soreness"
            value={soreness}
            min={1}
            max={5}
            onChange={setSoreness}
            lowLabel="None"
            highLabel="Very sore"
          />
          <RecoverySlider
            label="Energy level"
            value={energy}
            min={1}
            max={5}
            onChange={setEnergy}
            lowLabel="Exhausted"
            highLabel="Energised"
          />
        </Card>

        {/* Mental */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>🧠 Mental State</Text>
          <RecoverySlider
            label="Stress level"
            value={stress}
            min={1}
            max={5}
            onChange={setStress}
            lowLabel="Relaxed"
            highLabel="Very stressed"
          />
        </Card>

        <Button
          label="Save Check-In"
          onPress={handleSubmit}
          loading={isPending}
          fullWidth
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  title: { ...Typography.h1 },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: -Spacing.sm },
  scoreCard: { padding: Spacing.md },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  scoreLabel: { ...Typography.caption, color: Colors.textSecondary },
  score: { fontSize: 52, fontFamily: 'Inter_700Bold', lineHeight: 56 },
  scoreBadge: { ...Typography.label, marginTop: 2 },
  modifierBox: { alignItems: 'flex-end' },
  modifierLabel: { ...Typography.caption, color: Colors.textSecondary },
  modifier: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  recommendation: { ...Typography.caption, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  section: { padding: Spacing.md },
  sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
  submitBtn: { marginTop: Spacing.sm },
});
