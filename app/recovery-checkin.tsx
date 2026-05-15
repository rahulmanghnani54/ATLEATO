import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { RecoverySlider } from '@/components/recovery/RecoverySlider';
import { useSubmitRecovery, useTodayRecovery } from '@/hooks/useRecoveryCheckin';
import { calculateRecovery } from '@/lib/recoveryEngine';
import { Colors, Fonts } from '@/constants/theme';

function scoreColor(score: number) {
  if (score >= 85) return Colors.success;
  if (score >= 70) return Colors.good;
  if (score >= 50) return Colors.warning;
  if (score >= 35) return Colors.warn;
  return Colors.error;
}

export default function RecoveryCheckin() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { mutateAsync, isPending } = useSubmitRecovery();
  const { data: existingCheckin } = useTodayRecovery();

  const [sleepHours, setSleepHours] = useState(7.5);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [soreness, setSoreness] = useState(2);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);

  const preview = calculateRecovery({ sleepHours, sleepQuality, soreness, energy, stress });
  const color = scoreColor(preview.recoveryScore);

  const pct = (() => {
    const p = Math.round((preview.volumeModifier - 1) * 100);
    return p > 0 ? `+${p}%` : p < 0 ? `${p}%` : 'NORMAL';
  })();

  const handleSubmit = async () => {
    try {
      await mutateAsync({ sleepHours, sleepQuality, soreness, energy, stress });
      if (returnTo) {
        router.replace(returnTo as any);
      } else {
        router.back();
      }
    } catch {
      Alert.alert('Error', 'Could not save your check-in. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.monoLabel}>MORNING CHECK-IN</Text>
          <Text style={styles.headline}>HOW DID{'\n'}YOU SLEEP?</Text>
        </View>

        {existingCheckin && (
          <View style={styles.updateBanner}>
            <Text style={styles.updateText}>
              Already checked in today (score: {existingCheckin.recovery_score}). Saving will update your entry.
            </Text>
          </View>
        )}

        {/* Live score preview */}
        <View style={[styles.scoreCard, { borderColor: color + '44' }]}>
          <View style={styles.scoreRow}>
            <View>
              <Text style={styles.scoreMono}>RECOVERY SCORE</Text>
              <Text style={[styles.scoreNum, { color }]}>{preview.recoveryScore}</Text>
              <Text style={[styles.scoreBadge, { color }]}>{preview.label.toUpperCase()}</Text>
            </View>
            <View style={styles.modBox}>
              <Text style={styles.scoreMono}>VOL MOD</Text>
              <Text style={[styles.modNum, { color }]}>{pct}</Text>
            </View>
          </View>
          <View style={styles.scoreBarTrack}>
            <View style={[styles.scoreBarFill, { width: `${preview.recoveryScore}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={styles.recommendation}>{preview.recommendation}</Text>
        </View>

        {/* Sleep */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SLEEP</Text>
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
        </View>

        {/* Physical */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PHYSICAL STATE</Text>
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
        </View>

        {/* Mental */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MENTAL STATE</Text>
          <RecoverySlider
            label="Stress level"
            value={stress}
            min={1}
            max={5}
            onChange={setStress}
            lowLabel="Relaxed"
            highLabel="Very stressed"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isPending && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={isPending}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>{isPending ? 'SAVING…' : 'SAVE CHECK-IN'}</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14 },

  header: { marginBottom: 20 },
  monoLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  headline: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text, lineHeight: 34, letterSpacing: -1, marginTop: 6 },

  updateBanner: {
    backgroundColor: 'rgba(255,177,58,0.1)', borderWidth: 1,
    borderColor: 'rgba(255,177,58,0.3)', borderRadius: 4, padding: 12, marginBottom: 12,
  },
  updateText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.warning },

  scoreCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderRadius: 6, padding: 16, marginBottom: 12,
  },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  scoreMono: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginBottom: 4 },
  scoreNum: { fontFamily: Fonts.display, fontSize: 52, lineHeight: 50 },
  scoreBadge: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, marginTop: 4 },
  modBox: { alignItems: 'flex-end' },
  modNum: { fontFamily: Fonts.display, fontSize: 28 },
  scoreBarTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  scoreBarFill: { height: '100%', borderRadius: 2 },
  recommendation: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },

  section: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 16, marginBottom: 10,
  },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 14 },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 4,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 1 },
});
