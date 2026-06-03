import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  getStepsToday, logHRV, logSleepQuality, getRecoveryScore,
  saveWorkoutModifier, getTodayHRV, getTodaySleepQuality,
  type RecoveryResult,
} from '@/lib/healthIntegration';

// ─── Recovery gauge (SVG ring) ────────────────────────────────────────────────

const GAUGE_SIZE = 140;
const STROKE = 10;
const R = (GAUGE_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

function RecoveryGauge({ score }: { score: number }) {
  const color =
    score >= 75 ? Colors.success :
    score >= 55 ? Colors.warning :
    Colors.error;

  const progress = score / 100;
  const strokeDash = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
        <Circle
          cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={R}
          strokeWidth={STROKE} stroke={Colors.raised} fill="none"
        />
        <Circle
          cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={R}
          strokeWidth={STROKE} stroke={color} fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash}
          strokeLinecap="round"
          rotation="-90"
          origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.gaugeCenter}>
        <Text style={[styles.gaugeScore, { color }]}>{score}</Text>
        <Text style={styles.gaugeLabel}>RECOVERY</Text>
      </View>
    </View>
  );
}

// ─── Sleep emoji buttons ──────────────────────────────────────────────────────

const SLEEP_EMOJIS: Array<{ value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }> = [
  { value: 1, emoji: '😴', label: 'Awful' },
  { value: 2, emoji: '😫', label: 'Bad'   },
  { value: 3, emoji: '😐', label: 'Okay'  },
  { value: 4, emoji: '😊', label: 'Good'  },
  { value: 5, emoji: '🔥', label: 'Great' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HealthDashboard() {
  const router = useRouter();

  const [loading,     setLoading]     = useState(true);
  const [steps,       setSteps]       = useState(0);
  const [hrvInput,    setHrvInput]    = useState('');
  const [todayHRV,    setTodayHRV]    = useState<number | null>(null);
  const [sleepVal,    setSleepVal]    = useState<1|2|3|4|5>(3);
  const [recovery,    setRecovery]    = useState<RecoveryResult | null>(null);
  const [savingHRV,   setSavingHRV]   = useState(false);
  const [savingSleep, setSavingSleep] = useState(false);
  const [applied,     setApplied]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, hrv, sleep, rec] = await Promise.all([
      getStepsToday(),
      getTodayHRV(),
      getTodaySleepQuality(),
      getRecoveryScore(),
    ]);
    setSteps(s);
    setTodayHRV(hrv);
    setSleepVal(sleep as 1|2|3|4|5);
    setRecovery(rec);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLogHRV = async () => {
    const val = parseFloat(hrvInput);
    if (isNaN(val) || val < 1 || val > 300) {
      Alert.alert('Invalid HRV', 'Please enter a value between 1 and 300.');
      return;
    }
    setSavingHRV(true);
    await logHRV(val);
    setHrvInput('');
    await refresh();
    setSavingHRV(false);
  };

  const handleSleepTap = async (val: 1|2|3|4|5) => {
    setSavingSleep(true);
    setSleepVal(val);
    await logSleepQuality(val);
    await refresh();
    setSavingSleep(false);
  };

  const handleApply = async () => {
    if (!recovery) return;
    await saveWorkoutModifier(recovery.modifier);
    setApplied(true);
    Alert.alert(
      'Modifier Applied',
      `Recovery score ${recovery.score} → ${Math.round((recovery.modifier - 1) * 100) >= 0 ? '+' : ''}${Math.round((recovery.modifier - 1) * 100)}% volume adjustment saved for today's workout.`,
    );
  };

  const modifierLabel = recovery
    ? recovery.modifier > 1
      ? `+${Math.round((recovery.modifier - 1) * 100)}% VOLUME BOOST`
      : recovery.modifier < 1
      ? `${Math.round((recovery.modifier - 1) * 100)}% VOLUME REDUCTION`
      : 'NORMAL VOLUME'
    : '';

  const modifierColor = recovery
    ? recovery.modifier > 1 ? Colors.success
    : recovery.modifier < 1 ? Colors.warning
    : Colors.textSecondary
    : Colors.textSecondary;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HEALTH DASHBOARD</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Recovery gauge */}
            <View style={styles.gaugeRow}>
              {recovery && <RecoveryGauge score={recovery.score} />}
              <View style={styles.gaugeRight}>
                <Text style={styles.sectionLabel}>TODAY'S SCORE</Text>
                <Text style={[styles.modifierLabel, { color: modifierColor }]}>{modifierLabel}</Text>
                {recovery && (
                  <View style={styles.breakdownGrid}>
                    <View style={styles.breakdownItem}>
                      <Text style={styles.breakdownValue}>
                        {recovery.breakdown.hrv !== null ? recovery.breakdown.hrv : '—'}
                      </Text>
                      <Text style={styles.breakdownKey}>HRV</Text>
                    </View>
                    <View style={styles.breakdownItem}>
                      <Text style={styles.breakdownValue}>
                        {SLEEP_EMOJIS[recovery.breakdown.sleepQuality - 1]?.emoji ?? '—'}
                      </Text>
                      <Text style={styles.breakdownKey}>SLEEP</Text>
                    </View>
                    <View style={styles.breakdownItem}>
                      <Text style={styles.breakdownValue}>
                        {(recovery.breakdown.steps / 1000).toFixed(1)}k
                      </Text>
                      <Text style={styles.breakdownKey}>STEPS</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Steps */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>TODAY'S STEPS</Text>
              <Text style={styles.stepsValue}>{steps.toLocaleString()}</Text>
              <View style={styles.stepsBarTrack}>
                <View
                  style={[
                    styles.stepsBarFill,
                    { width: `${Math.min(100, Math.round(steps / 100))}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.stepsGoal}>Goal: 10,000 steps</Text>
            </View>

            {/* HRV Entry */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>HEART RATE VARIABILITY (HRV)</Text>
              {todayHRV !== null && (
                <Text style={styles.currentHRV}>Today: <Text style={{ color: Colors.success }}>{todayHRV} ms</Text></Text>
              )}
              <Text style={styles.cardSub}>
                Enter your HRV from your wearable app (Garmin, Apple Watch, WHOOP, etc.)
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.textInput}
                  value={hrvInput}
                  onChangeText={setHrvInput}
                  placeholder="e.g. 65"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleLogHRV}
                />
                <TouchableOpacity
                  style={[styles.logBtn, savingHRV && { opacity: 0.6 }]}
                  onPress={handleLogHRV}
                  disabled={savingHRV}
                >
                  {savingHRV
                    ? <ActivityIndicator size="small" color={Colors.accentInk} />
                    : <Text style={styles.logBtnText}>LOG HRV</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {/* Sleep quality */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>SLEEP QUALITY</Text>
              <Text style={styles.cardSub}>How did you sleep last night?</Text>
              <View style={styles.sleepRow}>
                {SLEEP_EMOJIS.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.sleepBtn,
                      sleepVal === s.value && styles.sleepBtnActive,
                    ]}
                    onPress={() => handleSleepTap(s.value)}
                    disabled={savingSleep}
                  >
                    <Text style={styles.sleepEmoji}>{s.emoji}</Text>
                    <Text style={[
                      styles.sleepLabel,
                      sleepVal === s.value && { color: Colors.primary },
                    ]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Apply to workout */}
            <TouchableOpacity
              style={[styles.applyBtn, applied && styles.applyBtnDone]}
              onPress={handleApply}
              activeOpacity={0.85}
              disabled={applied}
            >
              <Text style={styles.applyBtnText}>
                {applied ? '✓ APPLIED TO TODAY\'S WORKOUT' : 'APPLY TO TODAY\'S WORKOUT'}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 32 },
  backText:    { fontSize: 22, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  gaugeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16, marginBottom: 16,
  },
  gaugeWrap: {
    width: 140, height: 140,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  gaugeCenter: { position: 'absolute', alignItems: 'center' },
  gaugeScore: { fontFamily: Fonts.display, fontSize: 36, letterSpacing: -1 },
  gaugeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, marginTop: -2 },

  gaugeRight: { flex: 1 },
  modifierLabel: { fontFamily: Fonts.display, fontSize: 13, marginTop: 6, letterSpacing: 0.3 },
  breakdownGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  breakdownItem: { alignItems: 'center' },
  breakdownValue: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text },
  breakdownKey: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1, marginTop: 2 },

  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16, marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 8,
  },
  cardSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },

  stepsValue: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text, letterSpacing: -1, marginBottom: 10 },
  stepsBarTrack: { height: 6, backgroundColor: Colors.raised, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  stepsBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  stepsGoal: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 0.5 },

  currentHRV: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },

  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  textInput: {
    flex: 1, backgroundColor: Colors.raised, borderRadius: 6, padding: 12,
    fontFamily: Fonts.display, fontSize: 16, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  logBtn: {
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    minWidth: 90,
  },
  logBtnText: { fontFamily: Fonts.display, fontSize: 11, color: Colors.accentInk, letterSpacing: 0.5 },

  sleepRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  sleepBtn: {
    flex: 1, alignItems: 'center', backgroundColor: Colors.raised,
    borderRadius: 8, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border,
  },
  sleepBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}14` },
  sleepEmoji: { fontSize: 22 },
  sleepLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 4, letterSpacing: 0.4 },

  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingVertical: 16, alignItems: 'center', marginBottom: 16,
  },
  applyBtnDone: { backgroundColor: Colors.success },
  applyBtnText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accentInk, letterSpacing: 0.8 },
});
