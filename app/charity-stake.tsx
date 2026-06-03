/**
 * Anti-Charity Stake — gamified commitment mechanic (100% opt-in)
 *
 * User "stakes" a virtual $5/week against a charity they dislike.
 * Hit the weekly workout goal → stake returned + badge.
 * Miss it → animated "donated" loss event (no real money, no real donation).
 *
 * Storage: AsyncStorage `charity_stake:v1`
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfWeek, differenceInDays } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Types & constants ────────────────────────────────────────────────────────

const STORAGE_KEY = 'charity_stake:v1';

const CHARITIES = [
  { id: 'rival_team', label: 'Rival sports team fund 🏟', emoji: '🏟' },
  { id: 'junk_food', label: 'Generic junk food brand 🍟', emoji: '🍟' },
  { id: 'political', label: 'Political party you oppose 🗳', emoji: '🗳' },
];

const WEEKLY_GOALS = [3, 4, 5];

interface CharityStake {
  charityId: string;
  charityName: string;
  weeklyGoal: number;
  isActive: boolean;
  weekStart: string;       // YYYY-MM-DD
  workoutsThisWeek: number;
  badgesEarned: number;
}

function weekStartISO(): string {
  return startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().slice(0, 10);
}

async function loadStake(): Promise<CharityStake | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CharityStake;
  } catch {
    return null;
  }
}

async function saveStake(stake: CharityStake): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stake));
  } catch {}
}

// ─── Weekly progress bar ─────────────────────────────────────────────────────

function WeekBar({
  done, goal, accent,
}: { done: number; goal: number; accent: string }) {
  return (
    <View style={barStyles.wrap}>
      {Array.from({ length: goal }).map((_, i) => (
        <View
          key={i}
          style={[barStyles.seg, { backgroundColor: i < done ? accent : Colors.raised }]}
        />
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  seg: { flex: 1, height: 10, borderRadius: 3 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CharityStakeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const [stake, setStake] = useState<CharityStake | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Setup form state
  const [selectedCharity, setSelectedCharity] = useState(CHARITIES[0].id);
  const [selectedGoal, setSelectedGoal] = useState(3);

  // "Donated" animation
  const [showDonated, setShowDonated] = useState(false);
  const donateAnim = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    (async () => {
      let s = await loadStake();
      if (s) {
        // Check if it's a new week — resolve last week if so
        if (s.weekStart !== weekStartISO() && s.isActive) {
          const hitGoal = s.workoutsThisWeek >= s.weeklyGoal;
          s = {
            ...s,
            weekStart: weekStartISO(),
            workoutsThisWeek: 0,
            badgesEarned: hitGoal ? s.badgesEarned + 1 : s.badgesEarned,
          };
          await saveStake(s);
          if (!hitGoal) {
            triggerDonateAnimation();
          }
        }
      }
      setStake(s);
      setLoaded(true);
    })();
  }, []);

  const triggerDonateAnimation = useCallback(() => {
    setShowDonated(true);
    donateAnim.setValue(0);
    Animated.sequence([
      Animated.timing(donateAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(donateAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowDonated(false));
  }, [donateAnim]);

  const handleActivate = useCallback(async () => {
    const charity = CHARITIES.find((c) => c.id === selectedCharity)!;
    const newStake: CharityStake = {
      charityId: charity.id,
      charityName: charity.label,
      weeklyGoal: selectedGoal,
      isActive: true,
      weekStart: weekStartISO(),
      workoutsThisWeek: 0,
      badgesEarned: 0,
    };
    await saveStake(newStake);
    setStake(newStake);
  }, [selectedCharity, selectedGoal]);

  const handleDeactivate = () => {
    Alert.alert(
      'Cancel stake?',
      'Your anti-charity stake will be removed. All progress for this week is lost.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel stake', style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setStake(null);
          },
        },
      ],
    );
  };

  // Simulate logging a workout for testing (dev convenience)
  const handleLogWorkout = useCallback(async () => {
    if (!stake || !stake.isActive) return;
    const updated = {
      ...stake,
      workoutsThisWeek: Math.min(stake.workoutsThisWeek + 1, stake.weeklyGoal),
    };
    await saveStake(updated);
    setStake(updated);
  }, [stake]);

  if (!loaded) return null;

  const hitGoal = stake ? stake.workoutsThisWeek >= stake.weeklyGoal : false;
  const charity = stake ? CHARITIES.find((c) => c.id === stake.charityId) : null;
  const daysLeftInWeek = 7 - differenceInDays(new Date(), startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Donated animation overlay */}
      {showDonated && (
        <Animated.View
          style={[styles.donatedOverlay, { opacity: donateAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.donatedEmoji}>💸</Text>
          <Text style={styles.donatedText}>VIRTUAL STAKE DONATED</Text>
          <Text style={styles.donatedSub}>No real money moved. Use this feeling next week.</Text>
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ANTI-CHARITY STAKE</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: persona.accent }]}>
          <Text style={[styles.heroEyebrow, { color: persona.ink, opacity: 0.7 }]}>
            ✦ LOSS-AVERSION MECHANIC
          </Text>
          <Text style={[styles.heroTitle, { color: persona.ink }]}>
            Stake $5* against a cause you hate.
          </Text>
          <Text style={[styles.heroSub, { color: persona.ink, opacity: 0.8 }]}>
            Hit your weekly goal → stake returned + badge earned.{'\n'}
            Miss it → stake "donated" to them.{'\n\n'}
            *Virtual only. No real money. No real donations.
          </Text>
        </View>

        {/* ── ACTIVE STAKE VIEW ── */}
        {stake && stake.isActive && (
          <>
            {/* Status card */}
            <View style={[styles.activeCard, { borderLeftColor: hitGoal ? Colors.success : persona.accent }]}>
              <Text style={[styles.eyebrow, { color: hitGoal ? Colors.success : persona.accent }]}>
                {hitGoal ? '✓ GOAL HIT THIS WEEK' : 'STAKE ACTIVE'}
              </Text>
              <Text style={styles.stakeAmount}>$5*</Text>
              <Text style={styles.stakeAgainst}>staked against {charity?.label ?? stake.charityName}</Text>

              <Text style={styles.progressLabel}>
                {stake.workoutsThisWeek} / {stake.weeklyGoal} workouts this week
              </Text>
              <WeekBar done={stake.workoutsThisWeek} goal={stake.weeklyGoal} accent={hitGoal ? Colors.success : persona.accent} />
              <Text style={styles.daysLeft}>
                {daysLeftInWeek} day{daysLeftInWeek !== 1 ? 's' : ''} remaining this week
              </Text>
            </View>

            {/* Badges earned */}
            {stake.badgesEarned > 0 && (
              <View style={styles.badgeRow}>
                <Text style={styles.badgeLabel}>BADGES EARNED</Text>
                <Text style={styles.badgeValue}>
                  {'🏅'.repeat(Math.min(stake.badgesEarned, 10))}
                  {stake.badgesEarned > 10 ? ` +${stake.badgesEarned - 10}` : ''}
                </Text>
              </View>
            )}

            {/* Log workout (links to real workout flow in production) */}
            {!hitGoal && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: persona.accent }]}
                onPress={() => router.push('/workout-picker' as any)}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnText, { color: persona.ink }]}>
                  START TODAY'S WORKOUT →
                </Text>
              </TouchableOpacity>
            )}

            {hitGoal && (
              <View style={[styles.goalHitBanner, { borderColor: Colors.success + '66' }]}>
                <Text style={[styles.goalHitText, { color: Colors.success }]}>
                  🎉 Weekly goal hit! Stake returned.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleDeactivate}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Cancel stake</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── SETUP FORM ── */}
        {!stake && (
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>CHOOSE YOUR ANTI-CHARITY</Text>
            {CHARITIES.map((c) => {
              const active = selectedCharity === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.charityChip, active && {
                    borderColor: persona.accent,
                    backgroundColor: persona.accentSoft,
                  }]}
                  onPress={() => setSelectedCharity(c.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.charityChipText, active && { color: persona.accent }]}>
                    {c.label}
                  </Text>
                  {active && <Text style={[styles.checkmark, { color: persona.accent }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>WEEKLY WORKOUT GOAL</Text>
            <View style={styles.goalRow}>
              {WEEKLY_GOALS.map((g) => {
                const active = selectedGoal === g;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[styles.goalChip, active && {
                      borderColor: persona.accent,
                      backgroundColor: persona.accentSoft,
                    }]}
                    onPress={() => setSelectedGoal(g)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.goalChipNum, active && { color: persona.accent }]}>{g}</Text>
                    <Text style={[styles.goalChipLabel, active && { color: persona.accent }]}>
                      workouts
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.stakePreview}>
              <Text style={styles.stakePreviewTitle}>YOUR STAKE</Text>
              <Text style={styles.stakePreviewAmount}>$5 virtual*</Text>
              <Text style={styles.stakePreviewNote}>
                No real money. This is a gamified commitment device.
                The sting of "donating" to them is the mechanic.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: persona.accent }]}
              onPress={handleActivate}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: persona.ink }]}>
                LOCK IN MY STAKE →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.disclaimer}>
          * No real money is charged, transferred, or donated. This is a gamified
          commitment mechanic that uses loss-aversion psychology to increase
          workout adherence. 100% opt-in and removable at any time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  donatedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100, alignItems: 'center', justifyContent: 'center',
  },
  donatedEmoji: { fontSize: 64, marginBottom: 16 },
  donatedText: {
    fontFamily: Fonts.display, fontSize: 22, color: Colors.error,
    letterSpacing: -0.4, marginBottom: 8,
  },
  donatedSub: {
    fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 20,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 0.4 },

  scroll: { padding: Spacing.md, paddingBottom: 48 },

  hero: { borderRadius: 10, padding: 20, marginBottom: 20 },
  heroEyebrow: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 8 },
  heroTitle: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, marginBottom: 10 },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20 },

  activeCard: {
    backgroundColor: Colors.surface, borderLeftWidth: 3,
    borderRadius: 8, padding: 18, marginBottom: 14,
  },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 8 },
  stakeAmount: {
    fontFamily: Fonts.display, fontSize: 48, color: Colors.text,
    letterSpacing: -1, lineHeight: 52,
  },
  stakeAgainst: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
  progressLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1 },
  daysLeft: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.8 },

  badgeRow: {
    backgroundColor: Colors.raised, borderRadius: 8, padding: 14, marginBottom: 14,
  },
  badgeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginBottom: 6 },
  badgeValue: { fontSize: 28 },

  goalHitBanner: {
    borderWidth: 1, borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 14,
  },
  goalHitText: { fontFamily: Fonts.display, fontSize: 14, letterSpacing: 0.2 },

  primaryBtn: {
    paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 10,
  },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1 },

  secondaryBtn: {
    paddingVertical: 14, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  secondaryBtnText: {
    fontFamily: Fonts.display, fontSize: 12,
    color: Colors.textSecondary, letterSpacing: 0.6,
  },

  // Form
  form: { gap: 4 },
  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.6, marginBottom: 10,
  },
  charityChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 14, marginBottom: 8,
  },
  charityChipText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary },
  checkmark: { fontFamily: Fonts.display, fontSize: 14 },

  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  goalChip: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8,
  },
  goalChipNum: {
    fontFamily: Fonts.display, fontSize: 28, color: Colors.textSecondary, letterSpacing: -0.5,
  },
  goalChipLabel: {
    fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: 4,
  },

  stakePreview: {
    backgroundColor: Colors.raised, borderRadius: 8, padding: 16, marginBottom: 18, alignItems: 'center',
  },
  stakePreviewTitle: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 6,
  },
  stakePreviewAmount: {
    fontFamily: Fonts.display, fontSize: 36, color: Colors.text, letterSpacing: -0.5, marginBottom: 6,
  },
  stakePreviewNote: {
    fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 16,
  },

  disclaimer: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    lineHeight: 14, marginTop: 24, fontStyle: 'italic', textAlign: 'center',
  },
});
