/**
 * Profile & settings — Bold Canvas (migrated from the light-locked `Colors`
 * shim, 2026-08-13).
 *
 * This screen deliberately opens WITHOUT a dark <Crown>, unlike the tab
 * screens: the hero here is the user's name, and the name has to stay
 * tap-to-edit — Crown carries its title as a plain string and cannot host a
 * TextInput or a press target. The identity block is therefore built on the
 * light canvas with the same vocabulary (mono eyebrow, 36px display name,
 * oversized numerals, no card chrome).
 *
 * The persona accent is spent once — on the avatar. Everything else recedes to
 * ink/secondary, so settings rows read as a list rather than a colour chart.
 * Every row is a kit <ListRow>; only the destructive pair is local, because the
 * kit row has no danger tone.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Share, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, User as UserIcon } from 'lucide-react-native';

import { BigStat, CanvasScreen, Hairline, ListRow, Section, StatRow } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { useWorkoutStreak } from '@/hooks/useDashboardStats';
import { usePersonalRecords } from '@/hooks/useProgressStats';
import { canAccess, getUserTier } from '@/lib/featureGates';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { supabase } from '@/lib/supabase';
import { calculateBMR, calculateTDEE, calculateMacros, getAgeFromDOB } from '@/lib/tdee';
import type { ActivityLevel, Goal } from '@/lib/tdee';
import { useTheme, useThemedStyles, type SemanticTokens, type ThemeMode } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';

// Matches Crown's own horizontal inset, so a pushed screen lines up with the
// tab screens the user just came from.
const BODY_PAD = Spacing.heroPad;

const PROGRAM_NAMES: Record<string, string> = {
  cbum_evolved:          'The Sculptor Method',
  arnold_blueprint:      "The Monument's Blueprint",
  nippard_fundamentals:  'Science Fundamentals',
  ct_strength:           'Commander Strength',
  dr_mike_mav:           'RP Hypertrophy',
};
// Persona color comes from the single source of truth — personaTheme.ts —
// so when accent values change there, profile.tsx automatically follows.
const GOAL_LABELS: Record<string, string> = {
  lose_fat:             'Lose Fat',
  build_muscle:         'Build Muscle',
  maintain:             'Maintain',
  athletic_performance: 'Athletic Performance',
};
const ACTIVITY_LABELS: Record<string, string> = {
  sedentary:         'Sedentary',
  lightly_active:    'Lightly Active',
  moderately_active: 'Moderately Active',
  very_active:       'Very Active',
  extremely_active:  'Extremely Active',
};

const APPEARANCE_OPTIONS: { mode: ThemeMode; label: string; sub: string }[] = [
  { mode: 'system', label: 'System', sub: 'Follow your device appearance' },
  { mode: 'light',  label: 'Light',  sub: 'Always light' },
  { mode: 'dark',   label: 'Dark',   sub: 'Always dark' },
];

/**
 * The kit's <ListRow> paints its title in `text` with no override, so the two
 * destructive rows need their own row to keep the danger tone. Geometry and
 * hairline behaviour mirror ListRow exactly.
 */
function DangerRow({
  label, sub, onPress, last = false,
}: {
  label: string;
  sub?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const body = (
    <View style={styles.dangerRow}>
      <Text style={styles.dangerLabel}>{label}</Text>
      {sub ? <Text style={styles.dangerSub}>{sub}</Text> : null}
    </View>
  );
  return (
    <View>
      {onPress ? (
        <PressableScale
          onPress={onPress}
          haptic="light"
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel={sub ? `${label}, ${sub}` : label}
        >
          {body}
        </PressableScale>
      ) : (
        body
      )}
      {last ? null : <Hairline />}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  // Appearance — setMode repaints the tree immediately, so no restart prompt.
  const { tokens, scheme, mode: themeMode, setMode: setThemeMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile, user, signOut, fetchProfile } = useAuthStore();
  const { data: streak = 0 } = useWorkoutStreak();
  const { data: prs = [] } = usePersonalRecords();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.full_name ?? '');
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState(String(profile?.weight_kg ?? ''));
  const [editingHeight, setEditingHeight] = useState(false);
  const [heightInput, setHeightInput] = useState(String(profile?.height_cm ?? ''));
  const [saving, setSaving] = useState(false);

  // Voice cues — toggle that lives in the settings list below
  const voice = useVoiceCues();

  const age = profile?.date_of_birth ? getAgeFromDOB(profile.date_of_birth) : null;
  const persona = personaFromProgramId(profile?.selected_program);
  const pa = personaAccent(persona, scheme);
  const initials = (profile?.full_name ?? 'U').slice(0, 2).toUpperCase();
  const programName = PROGRAM_NAMES[profile?.selected_program ?? ''] ?? profile?.selected_program ?? '—';
  const tier = getUserTier();
  const voiceCustomizable = canAccess('voice_customization');

  // Calculate weeks on app
  const weeksOnApp = (() => {
    const created = profile?.created_at;
    if (!created) return 0;
    return Math.floor((Date.now() - new Date(created).getTime()) / (7 * 24 * 60 * 60 * 1000));
  })();

  const bodyStats = [
    profile?.weight_kg ? `${profile.weight_kg} kg` : null,
    profile?.height_cm ? `${profile.height_cm} cm` : null,
    age ? `${age} y/o` : null,
  ].filter(Boolean).join(' · ');

  const saveField = useCallback(async (fields: Record<string, string | number | null>) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      let extra: Record<string, number> = {};
      const newWeight = 'weight_kg' in fields ? Number(fields.weight_kg) : profile?.weight_kg;
      const newHeight = 'height_cm' in fields ? Number(fields.height_cm) : profile?.height_cm;
      if (('weight_kg' in fields || 'height_cm' in fields) && age && profile?.gender && newWeight && newHeight) {
        const bmr = calculateBMR(newWeight, newHeight, age, profile.gender as 'male' | 'female');
        const tdee = calculateTDEE(bmr, (profile.activity_level as ActivityLevel) ?? 'moderately_active');
        const macros = calculateMacros(tdee, (profile.goal as Goal) ?? 'build_muscle', newWeight);
        extra = {
          tdee: macros.calories,           // goal-adjusted, matches onboarding
          protein_g: macros.proteinG,
          carbs_g: macros.carbsG,
          fat_g: macros.fatG,
        };
      }
      const { error } = await (supabase
        .from('profiles') as any)
        .update({ ...fields, ...extra, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      await fetchProfile(user.id);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }, [user?.id, profile, age, fetchProfile]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login' as any);
        },
      },
    ]);
  };

  // Google Play requires an in-app way to delete the account + all data. Calls
  // the delete-account Edge Function (service-role) which removes the auth user;
  // all user-owned rows cascade via ON DELETE CASCADE.
  const [deleting, setDeleting] = useState(false);
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently erases your account and ALL your data — workouts, nutrition, photos, streaks. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.functions.invoke('delete-account', { body: {} });
              if (error) throw error;
              await signOut();
              router.replace('/(auth)/login' as any);
            } catch (e) {
              setDeleting(false);
              Alert.alert(
                'Could not delete',
                (e instanceof Error ? e.message : String(e)) +
                  '\n\nYou can also email hello@evulto.com and we will delete it within 7 days.',
              );
            }
          },
        },
      ],
    );
  };

  const saveName = async () => {
    await saveField({ full_name: nameInput.trim() || (profile?.full_name ?? '') });
    setEditingName(false);
  };

  return (
    <CanvasScreen topInset tabBar={false} bottomSpace={32}>
      <SafeAreaView edges={['left', 'right']} style={styles.body}>

        {/* ── Top bar ── no navigation header on this stack, so the screen
            carries its own back affordance and save indicator. */}
        <View style={styles.topBar}>
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            scaleTo={0.92}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <ArrowLeft size={19} color={tokens.text} />
          </PressableScale>
          {saving ? <ActivityIndicator size="small" color={pa.accentText} /> : null}
        </View>

        {/* ── Profile Hero ── the one hero on the screen ── */}
        <Text style={styles.eyebrow}>Founding member</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  returnKeyType="done"
                  selectionColor={pa.accent}
                  onSubmitEditing={saveName}
                />
                <PressableScale
                  haptic="medium"
                  scaleTo={0.96}
                  accessibilityRole="button"
                  style={[styles.saveBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
                  onPress={saveName}
                >
                  <Text style={[styles.saveBtnText, { color: pa.ink }]}>Save</Text>
                </PressableScale>
              </View>
            ) : (
              <PressableScale
                onPress={() => { setNameInput(profile?.full_name ?? ''); setEditingName(true); }}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel="Edit your name"
              >
                <Text style={styles.heroName} numberOfLines={2}>{profile?.full_name ?? '—'}</Text>
              </PressableScale>
            )}
            {bodyStats ? (
              <Text style={styles.heroSub}>{bodyStats}</Text>
            ) : (
              <PressableScale
                onPress={() => setEditingWeight(true)}
                haptic="light"
                scaleTo={0.98}
                accessibilityRole="button"
              >
                <Text style={[styles.heroSub, styles.heroSubLink, { color: pa.accentText }]}>
                  Add your body stats →
                </Text>
              </PressableScale>
            )}
          </View>
          {/* Avatar at the top of the panel — tappable, opens My Avatar.
              The single accent spend on this screen. */}
          <PressableScale
            onPress={() => router.push('/my-avatar' as any)}
            haptic="light"
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel="Open My Avatar"
            style={[styles.avatar, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
          >
            {initials
              ? <Text style={[styles.avatarInitials, { color: pa.ink }]}>{initials}</Text>
              : <UserIcon size={28} color={pa.ink} />}
          </PressableScale>
        </View>

        <StatRow style={styles.statRow}>
          <BigStat value={streak || 0} unit="d" label="Day streak" size={30} />
          <BigStat value={prs.length} label="Personal records" size={30} />
          <BigStat value={weeksOnApp} label="Weeks in" size={30} />
        </StatRow>
        <Hairline />

        {/* Subscription Tier */}
        <Section label="Plan">
          <ListRow
            title={tier.charAt(0).toUpperCase() + tier.slice(1)}
            subtitle="Current plan"
            onPress={() => router.push('/paywall' as any)}
            last
            right={tier !== 'legend' ? (
              <View style={styles.pill}>
                <Text style={styles.pillText}>Upgrade</Text>
              </View>
            ) : undefined}
          />
        </Section>

        {/* ── Progression & Avatar ── */}
        <Section label="Progression">
          <ListRow
            title="Legend Progress"
            subtitle="RPG levels, XP, and persona-flavoured rank"
            onPress={() => router.push('/legend-progress' as any)}
            last
          />
          {/* (My Avatar moved to the tappable avatar at the top of the panel.) */}
          {/* Health Dashboard / watch integration hidden for launch (founder
              call 2026-07-04): focus the app on the coach-calls core. The
              /health-dashboard route + healthIntegration lib stay dormant —
              re-add this row to bring it back. */}
        </Section>

        {/* ── Active Coach ── */}
        <Section label="Active coach">
          <ListRow
            title={programName}
            subtitle={`${GOAL_LABELS[profile?.goal ?? ''] ?? ''} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? ''}`}
            value="Change"
            onPress={() => router.push({ pathname: '/(onboarding)/step5-program', params: { fromProfile: '1' } } as any)}
            last
          />
        </Section>

        {/* ── Training ── */}
        <Section label="Training">
          <ListRow
            title="Body stats"
            subtitle={editingWeight || editingHeight
              ? 'Editing below…'
              : `${profile?.weight_kg ?? '—'} kg · ${profile?.height_cm ?? '—'} cm`}
            value="Edit"
            onPress={() => setEditingWeight(true)}
            // The editor drops in under this row, so the rule moves below it.
            divider={!editingWeight}
          />
          {editingWeight && (
            <>
              <View style={styles.editBlock}>
                <Text style={styles.editLabel}>Weight (kg)</Text>
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.editInput}
                    value={weightInput}
                    onChangeText={setWeightInput}
                    keyboardType="decimal-pad"
                    autoFocus
                    returnKeyType="next"
                    selectionColor={pa.accent}
                    onSubmitEditing={() => setEditingHeight(true)}
                  />
                  <PressableScale
                    haptic="medium"
                    scaleTo={0.96}
                    accessibilityRole="button"
                    style={[styles.saveBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
                    onPress={async () => {
                      const val = parseFloat(weightInput);
                      if (!isNaN(val) && val > 20 && val < 500) await saveField({ weight_kg: val });
                      setEditingHeight(true);
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: pa.ink }]}>Next</Text>
                  </PressableScale>
                </View>

                <Text style={[styles.editLabel, styles.editLabelGap]}>Height (cm)</Text>
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.editInput}
                    value={heightInput}
                    onChangeText={setHeightInput}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    selectionColor={pa.accent}
                  />
                  <PressableScale
                    haptic="medium"
                    scaleTo={0.96}
                    accessibilityRole="button"
                    style={[styles.saveBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
                    onPress={async () => {
                      const w = parseFloat(weightInput);
                      const h = parseFloat(heightInput);
                      const updates: Record<string, number> = {};
                      if (!isNaN(w) && w > 20 && w < 500) updates.weight_kg = w;
                      if (!isNaN(h) && h > 50 && h < 300) updates.height_cm = h;
                      if (Object.keys(updates).length > 0) await saveField(updates);
                      setEditingWeight(false);
                      setEditingHeight(false);
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: pa.ink }]}>Save</Text>
                  </PressableScale>
                </View>
              </View>
              <Hairline />
            </>
          )}
          <ListRow
            title="Goals"
            subtitle={`${GOAL_LABELS[profile?.goal ?? ''] ?? '—'} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? '—'}`}
            onPress={() => router.push({ pathname: '/(onboarding)/step1-goal', params: { fromProfile: '1' } } as any)}
            last
          />
        </Section>

        {/* ── Nutrition ── */}
        <Section label="Nutrition">
          <ListRow
            title="Daily macros"
            subtitle={profile?.tdee
              ? `${profile.tdee} kcal · ${profile.protein_g ?? '—'} / ${profile.carbs_g ?? '—'} / ${profile.fat_g ?? '—'} g`
              : 'Not set'}
            onPress={() => router.push({ pathname: '/(onboarding)/step4-diet', params: { fromProfile: '1' } } as any)}
            last
          />
        </Section>

        {/* ── Community + Accountability — DEV BUILDS ONLY for now ──
            Renamed + kept wired for a future release, but hidden from the
            public launch build to keep Settings simple (founder call). Daily
            selfie stays public (it's complete + shipped) — see below. */}
        {__DEV__ && (
        <>
        {/* ── Community ── */}
        <Section label="Community">
          <ListRow
            title="Community Squads"
            subtitle="Train with your squad — weekly challenges & leaderboards"
            onPress={() => router.push('/squads' as any)}
          />
          <ListRow
            title="Refer friends, earn Pro"
            subtitle="Share your code — 3 referrals = 1 month Pro free"
            onPress={() => router.push('/referral' as any)}
            last
          />
        </Section>

        {/* ── Accountability ── */}
        <Section label="Accountability">
          <ListRow
            title="Accountability partner"
            subtitle="One person who gets notified if you skip a week"
            onPress={() => router.push('/social-stake' as any)}
          />
          <ListRow
            title="Penalty stake"
            subtitle="Put $2 on the line — miss your week, forfeit it"
            onPress={() => router.push('/charity-stake' as any)}
          />
          <ListRow
            title="Leaderboard"
            subtitle="Weekly ranking against your training circle"
            onPress={() => router.push('/friend-scoreboard' as any)}
            last
          />
        </Section>
        </>
        )}

        {/* ── Accountability (public) ── */}
        <Section label="Accountability">
          <ListRow
            title="Daily selfie accountability"
            subtitle="Private 7-day photo streak — never uploaded"
            onPress={() => router.push('/daily-selfie' as any)}
            last
          />
        </Section>

        {/* ── Coach Calls & Voice ── */}
        <Section label="Coach calls">
          <ListRow
            title="Daily reminders from your coach"
            subtitle="Wake-up + workout reminders, in their voice"
            onPress={() => router.push('/coach-reminders' as any)}
          />
          {/* Voice cues toggle — the row itself is inert, the Switch owns the tap. */}
          <ListRow
            title="Voice cues during workouts"
            subtitle="Coach speaks set-complete, rest-over, form issues, PR alerts"
            last={!voiceCustomizable}
            right={
              <Switch
                value={voice.enabled}
                onValueChange={voice.toggle}
                trackColor={{ false: tokens.borderStrong, true: tokens.accent }}
                thumbColor={tokens.surface}
              />
            }
          />
          {voiceCustomizable && (
            <ListRow
              title="Coach Voice"
              subtitle="Adjust pitch & speed"
              onPress={() => router.push('/voice-settings' as any)}
              last
            />
          )}
        </Section>

        {/* ── Appearance ── Deliberately not __DEV__-gated: this is a user
            setting and has to ship in release builds. */}
        <Section label="Appearance">
          {APPEARANCE_OPTIONS.map(({ mode, label, sub }, i) => (
            <ListRow
              key={mode}
              title={label}
              subtitle={sub}
              onPress={() => setThemeMode(mode)}
              last={i === APPEARANCE_OPTIONS.length - 1}
              right={themeMode === mode ? <Check size={17} color={tokens.text} /> : undefined}
            />
          ))}
        </Section>

        {/* ── About Evulto ── */}
        <Section label="About Evulto">
          <ListRow
            title="Visit evulto.com"
            subtitle="Marketing site · waitlist · pricing"
            onPress={() => Linking.openURL('https://evulto.com').catch(() => {})}
          />
          <ListRow
            title="Share Evulto"
            subtitle="Send the showreel to a friend"
            last
            onPress={() =>
              Share.share({
                message:
                  "Evulto — your coach calls. 5 legend coaches, real wake-up calls, live AI form correction. Watch the 60-sec showreel: https://evulto.com/showreel.html",
                url: 'https://evulto.com/showreel.html',
                title: 'Evulto — Your Coach Calls',
              }).catch(() => {})
            }
          />
        </Section>

        {/* ── Founder admin (debug tier switcher) — DEV BUILDS ONLY ──
            Gated behind __DEV__ so the public/release app never shows the tier
            switcher. Stays fully available in development for the founder. */}
        {__DEV__ && (
        <Section label="Founder admin">
          <ListRow
            title="Unlock Legend tier"
            subtitle="All 5 coaches, AI form, video review, voice tuning — instant"
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('legend');
              Alert.alert('Legend unlocked', 'Restart the app to see all premium features.');
            }}
          />
          <ListRow
            title="Set tier: Pro"
            subtitle="3 coaches, AI form, physique progress"
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('pro');
              Alert.alert('Pro tier set');
            }}
          />
          <ListRow
            title="Reset to Free"
            subtitle="See what a free user experiences"
            last
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('free');
              Alert.alert('Reset to Free');
            }}
          />
        </Section>
        )}

        {/* ── Account ── */}
        <Section label="Account">
          <ListRow title="Email" subtitle={user?.email ?? ''} />
          <DangerRow label="Sign out" onPress={handleSignOut} />
          <DangerRow
            label={deleting ? 'Deleting…' : 'Delete account'}
            sub="Permanently erase your account & data"
            onPress={deleting ? undefined : handleDeleteAccount}
            last
          />
        </Section>

        {/* Branded footer — claim trademark + show domain + dated copyright */}
        <View style={styles.brandFooter}>
          <Text style={styles.brandMark}>Evulto™</Text>
          <Text style={styles.brandTag}>TRAIN  ·  FUEL  ·  RISE</Text>
          <Text style={styles.brandUrl}>evulto.com</Text>
          <Text style={styles.brandCopyright}>
            © {new Date().getFullYear()} Evulto.  v1.0.0
          </Text>
          <Text style={styles.brandLegal}>
            Coach Hub™, PR Shelf™, Morning Brief™, Streak Hero™ and Coach Calls™ are
            trademarks of Evulto. All persona theming, voice routing, and form-coach
            biomechanics analysis are proprietary.
          </Text>
        </View>
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    marginBottom: 26,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  eyebrow: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginBottom: 12,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  heroText: { flex: 1 },
  heroName: {
    fontFamily: Fonts.displayBold,
    fontSize: 36,
    lineHeight: 39,
    // -0.04em at 36px.
    letterSpacing: -1.44,
    color: t.text,
  },
  heroSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.textSecondary,
    marginTop: 8,
  },
  heroSubLink: { fontFamily: Fonts.bodySemi },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: {
    flex: 1,
    fontFamily: Fonts.displayBold,
    fontSize: 26,
    letterSpacing: -1.04,
    color: t.text,
    borderBottomWidth: 1,
    borderBottomColor: t.borderStrong,
    paddingVertical: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: Fonts.displayBold,
    fontSize: 26,
    letterSpacing: -1,
  },

  statRow: { marginTop: 32, marginBottom: 30 },

  // Trailing affordance on the plan row — outlined, not filled: the accent is
  // already spent on the avatar.
  pill: {
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.text,
  },

  // Inline body-stat editor — one filled block, no border.
  editBlock: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 26,
    padding: 20,
    marginBottom: 4,
  },
  editLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginBottom: 8,
  },
  editLabelGap: { marginTop: 20 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editInput: {
    flex: 1,
    fontFamily: Fonts.displayBold,
    fontSize: 30,
    letterSpacing: -1.2,
    color: t.text,
    fontVariant: ['tabular-nums'],
    borderBottomWidth: 1,
    borderBottomColor: t.borderStrong,
    paddingVertical: 2,
  },
  saveBtn: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  saveBtnText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // Destructive rows — ListRow geometry, danger tone.
  dangerRow: { paddingVertical: 15, gap: 3 },
  dangerLabel: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.danger,
  },
  dangerSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.textSecondary,
  },

  // Branded footer
  brandFooter: { alignItems: 'center', marginTop: 46, paddingHorizontal: 12 },
  brandMark: {
    fontFamily: Fonts.displayBold,
    fontSize: 27,
    letterSpacing: -1.08,
    color: t.text,
  },
  brandTag: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    color: t.textTertiary,
    marginTop: 10,
  },
  brandUrl: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    color: t.textSecondary,
    marginTop: 16,
  },
  brandCopyright: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: t.textTertiary,
    marginTop: 6,
  },
  brandLegal: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: t.textTertiary,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 16,
    fontStyle: 'italic',
  },
});
