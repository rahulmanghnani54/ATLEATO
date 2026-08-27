/**
 * Health dashboard — Bold Canvas.
 *
 * The crown carries the recovery ring as the single hero; the light body below
 * holds the detail — breakdown, step gauge, and the two manual inputs — as
 * borderless blocks separated by air rather than boxes.
 *
 * Every read, mutation, permission path, validation rule and Alert is untouched.
 * In particular the smartwatch button still does NOT touch the native Health
 * Connect module (see handleConnectWatch) — this file changed shape, not
 * behaviour.
 */

import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Watch } from 'lucide-react-native';
import { Fonts } from '@/constants/theme';
import {
  getStepsToday, logHRV, logSleepQuality, getRecoveryScore,
  saveWorkoutModifier, getTodayHRV, getTodaySleepQuality,
  type RecoveryResult,
} from '@/lib/healthIntegration';
import { getHealthStatus, connectHealth, type HealthStatus } from '@/lib/wearableHealth';
import { BigStat, CanvasScreen, Crown, Hairline, Section, StatRow } from '@/components/ui/canvas';
import { AnimatedRing, CountUp, PressableScale, Skeleton } from '@/components/ui/motion';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

const RING_SIZE = 124;
const RING_STROKE = 8;

/**
 * The recovery ring and the volume modifier both sit ON the crown, which is
 * near-black in BOTH schemes — so their status tones resolve against the dark
 * triplet, not the active one. The three bands (>=75 / >=55 / below) are the
 * legacy thresholds unchanged.
 */
const CROWN = TOKENS.dark;

function scoreColor(score: number) {
  if (score >= 75) return CROWN.success;
  if (score >= 55) return CROWN.warning;
  return CROWN.danger;
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
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [loading,     setLoading]     = useState(true);
  const [steps,       setSteps]       = useState(0);
  const [hrvInput,    setHrvInput]    = useState('');
  const [todayHRV,    setTodayHRV]    = useState<number | null>(null);
  const [sleepVal,    setSleepVal]    = useState<1|2|3|4|5>(3);
  const [recovery,    setRecovery]    = useState<RecoveryResult | null>(null);
  const [savingHRV,   setSavingHRV]   = useState(false);
  const [savingSleep, setSavingSleep] = useState(false);
  const [applied,     setApplied]     = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unavailable');
  const [connecting,   setConnecting]   = useState(false);

  useEffect(() => { getHealthStatus().then(setHealthStatus).catch(() => {}); }, []);

  const handleConnectWatch = async () => {
    // Smartwatch sync via Health Connect needs manifest health.READ_* permissions
    // + a privacy-policy rationale activity that aren't wired yet — and invoking
    // the native HC permission flow without them HARD-CRASHES on some devices
    // (uncatchable from JS). So until that's properly set up, we DON'T call the
    // native module at all — we just tell the user it's coming. (Tracked: full
    // Health Connect setup is a pre-launch task.)
    Alert.alert(
      'Smartwatch sync — coming soon',
      'Apple Watch / Wear OS / Fitbit sync is on the way. For now, log your recovery (sleep, HRV, energy) manually in the Recovery check-in and it feeds your score.',
    );
  };

  // Every setter runs inside try/finally: a rejected read (corrupt AsyncStorage
  // payload, a wearable bridge throwing) used to skip setLoading(false) and
  // strand the whole page on skeletons with no way back.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch {
      // Keep whatever was last shown rather than blanking the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLogHRV = async () => {
    const val = parseFloat(hrvInput);
    if (isNaN(val) || val < 1 || val > 300) {
      Alert.alert('Invalid HRV', 'Please enter a value between 1 and 300.');
      return;
    }
    setSavingHRV(true);
    try {
      await logHRV(val);
      setHrvInput('');
      await refresh();
    } catch {
      Alert.alert('Could not save', 'Your HRV entry was not stored. Please try again.');
    } finally {
      // In a finally so a failed write cannot leave the control disabled forever.
      setSavingHRV(false);
    }
  };

  const handleSleepTap = async (val: 1|2|3|4|5) => {
    setSavingSleep(true);
    setSleepVal(val);
    try {
      await logSleepQuality(val);
      await refresh();
    } catch {
      Alert.alert('Could not save', 'Your sleep rating was not stored. Please try again.');
    } finally {
      setSavingSleep(false);
    }
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
    ? recovery.modifier > 1 ? CROWN.success
    : recovery.modifier < 1 ? CROWN.warning
    : CROWN.crownTextDim
    : CROWN.crownTextDim;

  return (
    <CanvasScreen tabBar={false} bottomSpace={40}>
      <Crown
        eyebrow="Recovery"
        title="HEALTH"
        accentLine="DASHBOARD"
        onBack={() => router.back()}
      >
        {loading ? (
          <View style={styles.hero}>
            <Skeleton width={RING_SIZE} height={RING_SIZE} radius={RING_SIZE / 2} style={styles.crownPlate} />
            <View style={styles.heroSide}>
              <Skeleton width="70%" height={9} radius={4} style={styles.crownPlate} />
              <Skeleton width="100%" height={20} radius={6} style={styles.crownPlate} />
              <Skeleton width="85%" height={20} radius={6} style={styles.crownPlate} />
            </View>
          </View>
        ) : (
          <View style={styles.hero}>
            {recovery && (
              <AnimatedRing
                progress={recovery.score / 100}
                size={RING_SIZE}
                stroke={RING_STROKE}
                color={scoreColor(recovery.score)}
                trackColor={CROWN.crownLine}
              >
                <CountUp
                  value={recovery.score}
                  style={[styles.ringScore, { color: scoreColor(recovery.score) }]}
                  accessibilityLabel={`Recovery score ${recovery.score}`}
                />
                <Text style={styles.ringLabel}>RECOVERY</Text>
              </AnimatedRing>
            )}
            <View style={styles.heroSide}>
              <Text style={styles.heroLabel}>TODAY'S SCORE</Text>
              <Text style={[styles.modifierLabel, { color: modifierColor }]}>{modifierLabel}</Text>
            </View>
          </View>
        )}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {loading ? (
          <View style={styles.loadingBody}>
            <Skeleton height={56} radius={20} />
            <Skeleton height={96} radius={26} />
            <Skeleton height={116} radius={26} />
            <Skeleton height={132} radius={26} />
            <Skeleton height={112} radius={26} />
            <Skeleton height={58} radius={26} />
          </View>
        ) : (
          <>
            {/* Breakdown — the crown's hero score, taken apart */}
            {recovery && (
              <Section label="Breakdown">
                <StatRow>
                  <BigStat
                    value={recovery.breakdown.hrv !== null ? recovery.breakdown.hrv : '—'}
                    label="HRV"
                  />
                  <BigStat
                    value={SLEEP_EMOJIS[recovery.breakdown.sleepQuality - 1]?.emoji ?? '—'}
                    label="Sleep"
                  />
                  <BigStat
                    value={`${(recovery.breakdown.steps / 1000).toFixed(1)}k`}
                    label="Steps"
                  />
                </StatRow>
                <Hairline style={styles.breakdownRule} />
              </Section>
            )}

            {/* Connect smartwatch — real HealthKit / Health Connect data */}
            <PressableScale
              onPress={handleConnectWatch}
              disabled={connecting}
              haptic="medium"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Connect a smartwatch"
              style={[styles.connect, recovery ? styles.connectTight : styles.firstSection]}
            >
              <Watch size={22} color={tokens.text} />
              <View style={styles.connectText}>
                <Text style={styles.connectTitle}>
                  {healthStatus === 'available' ? 'Connect your watch' : 'Connect a smartwatch'}
                </Text>
                <Text style={styles.connectSub}>
                  Apple Watch, Wear OS, Fitbit & more — auto-fills steps, HRV & sleep.
                </Text>
              </View>
              {connecting
                ? <ActivityIndicator size="small" color={tokens.textTertiary} />
                : <ChevronRight size={18} color={tokens.textTertiary} />}
            </PressableScale>

            {/* Steps */}
            <Section label="Today's steps" contentStyle={styles.stack}>
              <BigStat value={steps} label="Goal: 10,000 steps" size={36} />
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(100, Math.round(steps / 100))}%` as any },
                  ]}
                />
              </View>
            </Section>

            {/* HRV Entry */}
            <Section label="Heart rate variability (HRV)" contentStyle={styles.stack}>
              {todayHRV !== null && (
                <BigStat value={todayHRV} unit="ms" label="Logged today" size={36} />
              )}
              <Text style={styles.sub}>
                Enter your HRV from your wearable app (Garmin, Apple Watch, WHOOP, etc.)
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.textInput}
                  value={hrvInput}
                  onChangeText={setHrvInput}
                  placeholder="e.g. 65"
                  placeholderTextColor={tokens.textTertiary}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleLogHRV}
                />
                <PressableScale
                  onPress={handleLogHRV}
                  disabled={savingHRV}
                  haptic="medium"
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel="Log HRV"
                  accessibilityState={{ disabled: savingHRV }}
                  style={[styles.logBtn, savingHRV && styles.logBtnBusy]}
                >
                  {savingHRV
                    ? <ActivityIndicator size="small" color={tokens.bg} />
                    : <Text style={styles.logBtnText}>LOG HRV</Text>}
                </PressableScale>
              </View>
            </Section>

            {/* Sleep quality */}
            <Section label="Sleep quality" contentStyle={styles.stack}>
              <Text style={styles.sub}>How did you sleep last night?</Text>
              {/* PressableScale wraps its target in a content-sized
                  Animated.View, so the fifth each button claims has to come
                  from these cells — flex on the button itself is inert, which
                  left five tiny chips huddled at the left edge. */}
              <View style={styles.sleepRow}>
                {SLEEP_EMOJIS.map((s) => {
                  const active = sleepVal === s.value;
                  return (
                    <View key={s.value} style={styles.sleepCell}>
                      <PressableScale
                        onPress={() => handleSleepTap(s.value)}
                        disabled={savingSleep}
                        haptic="light"
                        scaleTo={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={s.label}
                        accessibilityState={{ selected: active, disabled: savingSleep }}
                        style={[styles.sleepBtn, active && styles.sleepBtnActive]}
                      >
                        <Text style={styles.sleepEmoji}>{s.emoji}</Text>
                        <Text
                          style={[styles.sleepLabel, active && styles.sleepLabelActive]}
                          numberOfLines={1}
                        >
                          {s.label}
                        </Text>
                      </PressableScale>
                    </View>
                  );
                })}
              </View>
            </Section>

            {/* Apply to workout — the screen's single accent spend */}
            <PressableScale
              onPress={handleApply}
              disabled={applied}
              haptic="heavy"
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Apply to today's workout"
              accessibilityState={{ disabled: applied }}
              style={[styles.applyBtn, applied && styles.applyBtnDone]}
            >
              <Text style={[styles.applyBtnText, applied && styles.applyBtnTextDone]}>
                {applied ? '✓ APPLIED TO TODAY\'S WORKOUT' : 'APPLY TO TODAY\'S WORKOUT'}
              </Text>
            </PressableScale>
          </>
        )}
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown hero ─────────────────────────────────────────────────────────────
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 24,
  },
  // Skeleton's plate is the border token — dark ink at 9%, which is invisible on
  // the near-black crown. Overriding it to the crown's own hairline keeps the
  // loading shape readable up there.
  crownPlate: { backgroundColor: t.crownLine },
  // The one hero on the page: bigger than the crown title and every body stat.
  ringScore: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    lineHeight: 48,
    // -0.045em at 46px.
    letterSpacing: -2.07,
    fontVariant: ['tabular-nums'],
  },
  ringLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.6,
    color: t.crownTextDim,
    marginTop: 2,
  },
  heroSide: { flex: 1, gap: 10 },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  modifierLabel: {
    fontFamily: Fonts.displayBold,
    fontSize: 21,
    lineHeight: 24,
    // -0.04em at 21px.
    letterSpacing: -0.84,
  },

  // ── Loading body ───────────────────────────────────────────────────────────
  loadingBody: { marginTop: 34, gap: 26 },

  // ── Body rhythm ────────────────────────────────────────────────────────────
  // Section's own 34px top margin is the page rhythm; the first block after the
  // crown gets the same figure so the hero is not crowded.
  firstSection: { marginTop: 34 },
  stack: { gap: 16 },
  sub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.textSecondary,
  },

  // ── Breakdown ──────────────────────────────────────────────────────────────
  breakdownRule: { marginTop: 26 },

  // ── Connect smartwatch ─────────────────────────────────────────────────────
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: t.surfaceAlt,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  // The breakdown already opened the body with its own rule, so the connect
  // block sits closer under it than a fresh section would.
  connectTight: { marginTop: 22 },
  connectText: { flex: 1, gap: 3 },
  connectTitle: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
  },
  connectSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.textSecondary,
  },

  // ── Steps gauge ────────────────────────────────────────────────────────────
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: t.border,
    overflow: 'hidden',
  },
  // Ink, not emerald: the accent is spent once on the apply CTA.
  barFill: { height: '100%', borderRadius: 3, backgroundColor: t.text },

  // ── HRV entry ──────────────────────────────────────────────────────────────
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  textInput: {
    flex: 1,
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontFamily: Fonts.displayMedium,
    fontSize: 17,
    letterSpacing: -0.4,
    color: t.text,
  },
  logBtn: {
    backgroundColor: t.text,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  logBtnBusy: { opacity: 0.6 },
  logBtnText: {
    fontFamily: Fonts.displayBold,
    fontSize: 11,
    letterSpacing: 1.3,
    color: t.bg,
  },

  // ── Sleep quality ──────────────────────────────────────────────────────────
  sleepRow: { flexDirection: 'row', gap: 8 },
  sleepCell: { flex: 1 },
  sleepBtn: {
    alignItems: 'center',
    backgroundColor: t.surfaceAlt,
    borderRadius: 20,
    // No horizontal padding: at 360dp a fifth of the row is ~57px and the
    // five-letter labels ("Great") already fill it.
    paddingVertical: 13,
  },
  sleepBtnActive: { backgroundColor: t.text },
  sleepEmoji: { fontSize: 22 },
  sleepLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 6,
  },
  sleepLabelActive: { color: t.bg },

  // ── Apply ──────────────────────────────────────────────────────────────────
  applyBtn: {
    backgroundColor: t.accent,
    // Brand emerald is under 3:1 on a light page; the deeper tone at its edge is
    // what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    borderColor: t.accentLine,
    borderRadius: 26,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 34,
  },
  applyBtnDone: { backgroundColor: t.surfaceAlt, borderColor: t.border },
  applyBtnText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    color: t.accentInk,
  },
  applyBtnTextDone: { color: t.accentText },
});
