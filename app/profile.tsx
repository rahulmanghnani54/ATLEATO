import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Linking, Share,
} from 'react-native';
import { useVoiceCues } from '@/hooks/useVoiceCues';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useWorkoutStreak } from '@/hooks/useDashboardStats';
import { usePersonalRecords } from '@/hooks/useProgressStats';
import { calculateBMR, calculateTDEE, calculateMacros, getAgeFromDOB } from '@/lib/tdee';
import type { ActivityLevel, Goal } from '@/lib/tdee';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  ArrowLeft, ChevronRight, ArrowUpRight, ArrowDownRight, ExternalLink,
  Zap, Trophy, Gift, Handshake, DollarSign, Camera, Users, User as UserIcon,
  Phone, Volume2, Mic, Globe, Share2, Unlock, Ticket, Award, RotateCcw,
  Flame, Calendar,
} from 'lucide-react-native';
import { getUserTier, canAccess } from '@/lib/featureGates';
import { personaFromProgramId } from '@/lib/personaTheme';

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

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function SettingsRow({
  Icon, iconColor, label, sub, trail, trailColor, trailIcon: TrailIcon, onPress, danger,
}: {
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  label: string;
  sub?: string;
  trail?: string;
  trailColor?: string;
  trailIcon?: React.ComponentType<{ size?: number; color?: string }>;
  onPress?: () => void;
  danger?: boolean;
}) {
  const labelColor = danger ? '#ef4444' : Colors.text;
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      {Icon && (
        <View style={styles.iconSlot}>
          <Icon size={18} color={iconColor ?? Colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsLabel, { color: labelColor }]}>{label}</Text>
        {sub ? <Text style={styles.settingsSub}>{sub}</Text> : null}
      </View>
      {TrailIcon ? (
        <TrailIcon size={16} color={trailColor ?? Colors.textSecondary} />
      ) : trail ? (
        <Text style={[styles.settingsTrail, trailColor ? { color: trailColor } : {}]}>{trail}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
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
  const programColor = personaFromProgramId(profile?.selected_program).accent;
  const initials = (profile?.full_name ?? 'U').slice(0, 2).toUpperCase();
  const programName = PROGRAM_NAMES[profile?.selected_program ?? ''] ?? profile?.selected_program ?? '—';

  // Calculate weeks on app
  const weeksOnApp = (() => {
    const created = (profile as any)?.created_at;
    if (!created) return 0;
    return Math.floor((Date.now() - new Date(created).getTime()) / (7 * 24 * 60 * 60 * 1000));
  })();

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile & settings</Text>
        {saving
          ? <ActivityIndicator size="small" color={Colors.primary} style={{ width: 32 }} />
          : <View style={{ width: 32 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <View style={[styles.proBadge, { borderColor: programColor }]}>
                <View style={[styles.proBadgeDot, { backgroundColor: programColor }]} />
                <Text style={[styles.proBadgeText, { color: programColor }]}>Founding member</Text>
              </View>
              {editingName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      await saveField({ full_name: nameInput.trim() || (profile?.full_name ?? '') });
                      setEditingName(false);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: programColor }]}
                    onPress={async () => {
                      await saveField({ full_name: nameInput.trim() || (profile?.full_name ?? '') });
                      setEditingName(false);
                    }}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setNameInput(profile?.full_name ?? ''); setEditingName(true); }}>
                  <Text style={styles.heroName}>{profile?.full_name ?? '—'}</Text>
                </TouchableOpacity>
              )}
              {(() => {
                const stats = [
                  profile?.weight_kg ? `${profile.weight_kg} kg` : null,
                  profile?.height_cm ? `${profile.height_cm} cm` : null,
                  age ? `${age} y/o` : null,
                ].filter(Boolean).join(' · ');
                return stats ? (
                  <Text style={styles.heroSub}>{stats}</Text>
                ) : (
                  <TouchableOpacity onPress={() => setEditingWeight(true)}>
                    <Text style={[styles.heroSub, { color: programColor }]}>Add your body stats →</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
            {/* Avatar at the top of the panel — tappable, opens My Avatar. */}
            <TouchableOpacity
              style={[styles.avatarCircle, { borderColor: programColor }]}
              onPress={() => router.push('/my-avatar' as any)}
              activeOpacity={0.8}
            >
              {initials
                ? <Text style={[styles.avatarInitials, { color: programColor }]}>{initials}</Text>
                : <UserIcon size={30} color={programColor} />}
            </TouchableOpacity>
          </View>

          {/* Stat strip — prominent: big numbers, icon-led, persona-accent
              on the headline card (streak), softer surface on the other two */}
          <View style={styles.statStrip}>
            <View style={[styles.statCardHero, { borderColor: programColor + '44', backgroundColor: programColor + '12' }]}>
              <View style={styles.statHead}>
                <Flame size={14} color={programColor} fill={programColor} />
                <Text style={[styles.statLabel, { color: programColor }]}>Streak</Text>
              </View>
              <Text style={[styles.statValueBig, { color: programColor }]}>
                {streak || 0}<Text style={styles.statUnit}>d</Text>
              </Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statHead}>
                <Trophy size={14} color={Colors.textTertiary} />
                <Text style={styles.statLabel}>PRs</Text>
              </View>
              <Text style={styles.statValueBig}>{prs.length}</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statHead}>
                <Calendar size={14} color={Colors.textTertiary} />
                <Text style={styles.statLabel}>Weeks</Text>
              </View>
              <Text style={styles.statValueBig}>{weeksOnApp}</Text>
            </View>
          </View>
        </View>

        {/* Subscription Tier */}
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: Colors.surface, borderRadius: 12,
            padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
            marginHorizontal: Spacing.md, marginTop: 20,
          }}
          onPress={() => router.push('/paywall' as any)}
        >
          <View>
            <Text style={{ fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.2 }}>
              Current plan
            </Text>
            <Text style={{ fontFamily: Fonts.display, fontSize: 20, color: Colors.primary, marginTop: 4, textTransform: 'capitalize' }}>
              {getUserTier()}
            </Text>
          </View>
          {getUserTier() !== 'legend' && (
            <View style={{ backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: Fonts.displayMedium, fontSize: 13, color: Colors.bg, letterSpacing: 0.2 }}>
                Upgrade
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Progression & Avatar ── */}
        <SettingsGroup title="Progression">
          <SettingsRow
            Icon={Zap}
            iconColor={programColor}
            label="Legend Progress"
            sub="RPG levels, XP, and persona-flavoured rank"
            trailIcon={ChevronRight}
            onPress={() => router.push('/legend-progress' as any)}
          />
          {/* (My Avatar moved to the tappable avatar at the top of the panel.) */}
          {/* Health Dashboard / watch integration hidden for launch (founder
              call 2026-07-04): focus the app on the coach-calls core. The
              /health-dashboard route + healthIntegration lib stay dormant —
              re-add this row to bring it back. */}
        </SettingsGroup>

        {/* ── Active Coach ── */}
        <SettingsGroup title="Active coach">
          <SettingsRow
            label={programName}
            sub={`${GOAL_LABELS[profile?.goal ?? ''] ?? ''} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? ''}`}
            trail="Change"
            trailColor={programColor}
            onPress={() => router.push({ pathname: '/(onboarding)/step5-program', params: { fromProfile: '1' } } as any)}
          />
        </SettingsGroup>

        {/* ── Training ── */}
        <SettingsGroup title="Training">
          <SettingsRow
            label="Body stats"
            sub={editingWeight || editingHeight
              ? 'Editing below…'
              : `${profile?.weight_kg ?? '—'} kg · ${profile?.height_cm ?? '—'} cm`}
            trail="Edit"
            trailColor={programColor}
            onPress={() => setEditingWeight(true)}
          />
          {editingWeight && (
            <View style={styles.inlineEditWrap}>
              <Text style={styles.inlineEditLabel}>Weight (kg)</Text>
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.statInput}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => setEditingHeight(true)}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: programColor }]}
                  onPress={async () => {
                    const val = parseFloat(weightInput);
                    if (!isNaN(val) && val > 20 && val < 500) await saveField({ weight_kg: val });
                    setEditingHeight(true);
                  }}
                >
                  <Text style={styles.saveBtnText}>Next</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.inlineEditLabel, { marginTop: 12 }]}>Height (cm)</Text>
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.statInput}
                  value={heightInput}
                  onChangeText={setHeightInput}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: programColor }]}
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
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={styles.rowDivider} />
          <SettingsRow
            label="Goals"
            sub={`${GOAL_LABELS[profile?.goal ?? ''] ?? '—'} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? '—'}`}
            trailIcon={ChevronRight}
            onPress={() => router.push({ pathname: '/(onboarding)/step1-goal', params: { fromProfile: '1' } } as any)}
          />
        </SettingsGroup>

        {/* ── Nutrition ── */}
        <SettingsGroup title="Nutrition">
          <SettingsRow
            label="Daily macros"
            sub={profile?.tdee
              ? `${profile.tdee} kcal · ${profile.protein_g ?? '—'} / ${profile.carbs_g ?? '—'} / ${profile.fat_g ?? '—'} g`
              : 'Not set'}
            trailIcon={ChevronRight}
            onPress={() => router.push({ pathname: '/(onboarding)/step4-diet', params: { fromProfile: '1' } } as any)}
          />
        </SettingsGroup>

        {/* ── Community + Accountability — DEV BUILDS ONLY for now ──
            Renamed + kept wired for a future release, but hidden from the
            public launch build to keep Settings simple (founder call). Daily
            selfie stays public (it's complete + shipped) — see below. */}
        {__DEV__ && (
        <>
        {/* ── Community ── */}
        <SettingsGroup title="Community">
          <SettingsRow
            Icon={Trophy}
            iconColor={programColor}
            label="Community Squads"
            sub="Train with your squad — weekly challenges & leaderboards"
            trailIcon={ChevronRight}
            onPress={() => router.push('/squads' as any)}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={Gift}
            iconColor={programColor}
            label="Refer friends, earn Pro"
            sub="Share your code — 3 referrals = 1 month Pro free"
            trailIcon={ChevronRight}
            onPress={() => router.push('/referral' as any)}
          />
        </SettingsGroup>

        {/* ── Accountability ── */}
        <SettingsGroup title="Accountability">
          <SettingsRow
            Icon={Handshake}
            iconColor={programColor}
            label="Accountability partner"
            sub="One person who gets notified if you skip a week"
            trailIcon={ChevronRight}
            onPress={() => router.push('/social-stake' as any)}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={DollarSign}
            iconColor={programColor}
            label="Penalty stake"
            sub="Put $2 on the line — miss your week, forfeit it"
            trailIcon={ChevronRight}
            onPress={() => router.push('/charity-stake' as any)}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={Users}
            iconColor={programColor}
            label="Leaderboard"
            sub="Weekly ranking against your training circle"
            trailIcon={ChevronRight}
            onPress={() => router.push('/friend-scoreboard' as any)}
          />
        </SettingsGroup>
        </>
        )}

        {/* ── Accountability (public) ── */}
        <SettingsGroup title="Accountability">
          <SettingsRow
            Icon={Camera}
            iconColor={programColor}
            label="Daily selfie accountability"
            sub="Private 7-day photo streak — never uploaded"
            trailIcon={ChevronRight}
            onPress={() => router.push('/daily-selfie' as any)}
          />
        </SettingsGroup>

        {/* ── Coach Calls & Voice ── */}
        <SettingsGroup title="Coach calls">
          <SettingsRow
            Icon={Phone}
            iconColor={programColor}
            label="Daily reminders from your coach"
            sub="Wake-up + workout reminders, in their voice"
            trailIcon={ChevronRight}
            onPress={() => router.push('/coach-reminders' as any)}
          />
          <View style={styles.rowDivider} />
          {/* Voice cues toggle — custom row with a Switch */}
          <View style={styles.voiceToggleRow}>
            <View style={styles.iconSlot}>
              <Volume2 size={18} color={programColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Voice cues during workouts</Text>
              <Text style={styles.settingsSub}>
                Coach speaks set-complete, rest-over, form issues, PR alerts
              </Text>
            </View>
            <Switch
              value={voice.enabled}
              onValueChange={voice.toggle}
              trackColor={{ false: '#3a3a3a', true: programColor }}
              thumbColor="#fff"
            />
          </View>
          {canAccess('voice_customization') && (
            <>
              <View style={styles.rowDivider} />
              <SettingsRow
                Icon={Mic}
                iconColor={programColor}
                label="Coach Voice"
                sub="Adjust pitch & speed"
                trailIcon={ChevronRight}
                onPress={() => router.push('/voice-settings' as any)}
              />
            </>
          )}
        </SettingsGroup>

        {/* ── About Evulto ── */}
        <SettingsGroup title="About Evulto">
          <SettingsRow
            Icon={Globe}
            iconColor={programColor}
            label="Visit evulto.com"
            sub="Marketing site · waitlist · pricing"
            trailIcon={ExternalLink}
            onPress={() => Linking.openURL('https://evulto.com').catch(() => {})}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={Share2}
            iconColor={programColor}
            label="Share Evulto"
            sub="Send the showreel to a friend"
            trailIcon={ChevronRight}
            onPress={() =>
              Share.share({
                message:
                  "Evulto — your coach calls. 5 legend coaches, real wake-up calls, live AI form correction. Watch the 60-sec showreel: https://evulto.com/showreel.html",
                url: 'https://evulto.com/showreel.html',
                title: 'Evulto — Your Coach Calls',
              }).catch(() => {})
            }
          />
        </SettingsGroup>

        {/* ── Founder admin (debug tier switcher) — DEV BUILDS ONLY ──
            Gated behind __DEV__ so the public/release app never shows the tier
            switcher. Stays fully available in development for the founder. */}
        {__DEV__ && (
        <SettingsGroup title="Founder admin">
          <SettingsRow
            Icon={Unlock}
            iconColor={programColor}
            label="Unlock Legend tier"
            sub="All 5 coaches, AI form, video review, voice tuning — instant"
            trailIcon={ArrowUpRight}
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('legend');
              Alert.alert('Legend unlocked', 'Restart the app to see all premium features.');
            }}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={Ticket}
            iconColor={programColor}
            label="Set tier: Pro"
            sub="3 coaches, AI form, physique progress"
            trailIcon={ArrowUpRight}
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('pro');
              Alert.alert('Pro tier set');
            }}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={RotateCcw}
            iconColor={Colors.textSecondary}
            label="Reset to Free"
            sub="See what a free user experiences"
            trailIcon={ArrowDownRight}
            onPress={async () => {
              const { applyTier } = await import('@/lib/subscriptionManager');
              applyTier('free');
              Alert.alert('Reset to Free');
            }}
          />
        </SettingsGroup>
        )}

        {/* ── App icon (temporary test — visible in release for triage) ──
            Proves the native icon switch works independent of the coach-change
            flow. Remove once per-coach icons are confirmed on-device. */}
        <SettingsGroup title="App icon">
          <SettingsRow
            Icon={RotateCcw}
            iconColor="#D6412A"
            label="Set icon: Commander (red)"
            sub="Then press Home — Pixel repaints instantly; Samsung/Xiaomi may need an unlock"
            trailIcon={ArrowUpRight}
            onPress={async () => {
              const { forceAppIcon } = await import('@/lib/appIcon');
              const r = await forceAppIcon('ct_fletcher');
              Alert.alert('App icon', r);
            }}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            Icon={RotateCcw}
            iconColor={Colors.primary}
            label="Set icon: Sculptor (emerald)"
            sub="Force the launcher icon back to the default"
            trailIcon={ArrowUpRight}
            onPress={async () => {
              const { forceAppIcon } = await import('@/lib/appIcon');
              const r = await forceAppIcon('cbum');
              Alert.alert('App icon', r);
            }}
          />
        </SettingsGroup>

        {/* ── Account ── */}
        <SettingsGroup title="Account">
          <SettingsRow label="Email" sub={user?.email ?? ''} />
          <View style={styles.rowDivider} />
          <SettingsRow
            label="Sign out"
            trailIcon={ChevronRight}
            onPress={handleSignOut}
            danger
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            label={deleting ? 'Deleting…' : 'Delete account'}
            sub="Permanently erase your account & data"
            trailIcon={ChevronRight}
            onPress={deleting ? undefined : handleDeleteAccount}
            danger
          />
        </SettingsGroup>

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
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 60 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  headerTitle: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.textTertiary, letterSpacing: 0.2 },

  // Hero
  hero: {
    padding: Spacing.md,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  proBadge: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  proBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  proBadgeText: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2 },
  heroName: { fontFamily: Fonts.display, fontSize: 30, color: Colors.text, letterSpacing: -0.5, lineHeight: 34 },
  heroSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4, letterSpacing: 0.1 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  nameInput: {
    fontFamily: Fonts.display, fontSize: 22, color: Colors.text,
    borderBottomWidth: 1, borderBottomColor: Colors.primary,
    paddingVertical: 2, minWidth: 160,
  },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: Fonts.display, fontSize: 24 },

  statStrip: { flexDirection: 'row', gap: 10, paddingBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12,
  },
  // Hero stat — persona-tinted background, persona-coloured number,
  // makes the streak visibly the headline metric.
  statCardHero: {
    flex: 1, borderWidth: 1, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 12,
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  statLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2 },
  // 36 vs the old 22 — closer to the hero name's weight, reads as the
  // anchor of the screen instead of a footnote under the avatar.
  statValueBig: { fontFamily: Fonts.display, fontWeight: '800', fontSize: 36, lineHeight: 38, color: Colors.text, letterSpacing: -1 },
  statUnit: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.1 },

  // Settings groups
  group: { paddingHorizontal: Spacing.md, paddingTop: 20 },
  groupTitle: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.textTertiary, letterSpacing: 0.2, marginBottom: 8 },
  groupCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' },

  settingsRow: { padding: 14, flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 },
  iconSlot: { width: 24, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontFamily: Fonts.bodySemi, fontSize: 14, color: Colors.text },
  settingsSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.1, lineHeight: 16 },
  settingsTrail: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.1 },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },
  voiceToggleRow: {
    padding: 14, flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12,
  },

  // Inline edit
  inlineEditWrap: { paddingHorizontal: 14, paddingBottom: 12 },
  inlineEditLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.2, marginBottom: 6 },
  inlineEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statInput: {
    flex: 1, fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 4,
  },
  saveBtn: {
    borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnText: { fontFamily: Fonts.displayMedium, fontSize: 13, color: '#000', letterSpacing: 0.2 },

  version: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary, textAlign: 'center', marginTop: 28 },

  // Branded footer
  brandFooter: { alignItems: 'center', marginTop: 32, paddingHorizontal: 24 },
  brandMark: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: -0.5 },
  brandTag:  { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.primary, letterSpacing: 0.4, marginTop: 4 },
  brandUrl:  { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.1, marginTop: 14 },
  brandCopyright: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textTertiary, letterSpacing: 0.1, marginTop: 6 },
  brandLegal: {
    fontFamily: Fonts.body, fontSize: 10, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 14, marginTop: 14, fontStyle: 'italic',
    letterSpacing: 0.1,
  },
});
