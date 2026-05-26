import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
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

const PROGRAM_NAMES: Record<string, string> = {
  cbum_evolved:          'CBum Evolved',
  arnold_blueprint:      "Arnold's Blueprint",
  nippard_fundamentals:  'Science Fundamentals',
  ct_strength:           'ISYMFS Strength',
  dr_mike_mav:           'RP Hypertrophy',
};
const PROGRAM_COLORS: Record<string, string> = {
  cbum_evolved:          '#dfff1f',
  arnold_blueprint:      '#ffb13a',
  nippard_fundamentals:  '#5b8cff',
  ct_strength:           '#ff5b3a',
  dr_mike_mav:           '#00e0a4',
};
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
  label, sub, trail, trailColor, onPress, danger,
}: {
  label: string; sub?: string; trail?: string; trailColor?: string; onPress?: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsLabel, danger && { color: '#ef4444' }]}>{label}</Text>
        {sub ? <Text style={styles.settingsSub}>{sub}</Text> : null}
      </View>
      {trail ? (
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
  const programColor = PROGRAM_COLORS[profile?.selected_program ?? ''] ?? Colors.primary;
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROFILE & SETTINGS</Text>
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
                <Text style={[styles.proBadgeText, { color: programColor }]}>● PRO MEMBER</Text>
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
                    <Text style={styles.saveBtnText}>OK</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setNameInput(profile?.full_name ?? ''); setEditingName(true); }}>
                  <Text style={styles.heroName}>{profile?.full_name ?? '—'}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.heroSub}>
                {[
                  profile?.weight_kg ? `${profile.weight_kg} kg` : null,
                  profile?.height_cm ? `${profile.height_cm} cm` : null,
                  age ? `${age} y/o` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={[styles.avatarCircle, { borderColor: programColor }]}>
              <Text style={[styles.avatarInitials, { color: programColor }]}>{initials}</Text>
            </View>
          </View>

          {/* Stat strip */}
          <View style={styles.statStrip}>
            {[
              { l: 'STREAK', v: String(streak || 0), u: 'd' },
              { l: 'PRs', v: String(prs.length), u: '' },
              { l: 'WEEKS', v: String(weeksOnApp), u: '' },
            ].map((s) => (
              <View key={s.l} style={styles.statCard}>
                <Text style={styles.statLabel}>{s.l}</Text>
                <Text style={[styles.statValue, { color: programColor }]}>
                  {s.v}<Text style={styles.statUnit}>{s.u}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Active Coach ── */}
        <SettingsGroup title="ACTIVE COACH">
          <SettingsRow
            label={programName}
            sub={`${GOAL_LABELS[profile?.goal ?? ''] ?? ''} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? ''}`}
            trail="CHANGE"
            trailColor={programColor}
            onPress={() => router.push('/(onboarding)/step5-program' as any)}
          />
        </SettingsGroup>

        {/* ── Training ── */}
        <SettingsGroup title="TRAINING">
          <SettingsRow
            label="Body stats"
            sub={editingWeight || editingHeight
              ? 'Editing below…'
              : `${profile?.weight_kg ?? '—'} kg · ${profile?.height_cm ?? '—'} cm`}
            trail="EDIT"
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
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: programColor }]}
                  onPress={async () => {
                    const val = parseFloat(weightInput);
                    if (!isNaN(val) && val > 20 && val < 500) await saveField({ weight_kg: val });
                    setEditingWeight(false);
                  }}
                >
                  <Text style={styles.saveBtnText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={styles.rowDivider} />
          <SettingsRow
            label="Goals"
            sub={`${GOAL_LABELS[profile?.goal ?? ''] ?? '—'} · ${ACTIVITY_LABELS[profile?.activity_level ?? ''] ?? '—'}`}
            trail="▸"
            onPress={() => router.push('/(onboarding)/step1-goal' as any)}
          />
        </SettingsGroup>

        {/* ── Nutrition ── */}
        <SettingsGroup title="NUTRITION">
          <SettingsRow
            label="Daily macros"
            sub={profile?.tdee
              ? `${profile.tdee} kcal · ${profile.protein_g ?? '—'} / ${profile.carbs_g ?? '—'} / ${profile.fat_g ?? '—'} g`
              : 'Not set'}
            trail="▸"
            onPress={() => router.push('/(onboarding)/step4-diet' as any)}
          />
        </SettingsGroup>

        {/* ── Coach Calls & Voice ── */}
        <SettingsGroup title="COACH CALLS">
          <SettingsRow
            label="📞  Daily reminders from your coach"
            sub="Wake-up + workout reminders, in their voice"
            trail="→"
            onPress={() => router.push('/coach-reminders' as any)}
          />
          <View style={styles.rowDivider} />
          {/* Voice cues toggle — custom row with a Switch */}
          <View style={styles.voiceToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>🔊  Voice cues during workouts</Text>
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
        </SettingsGroup>

        {/* ── Account ── */}
        <SettingsGroup title="ACCOUNT">
          <SettingsRow label="Email" sub={user?.email ?? ''} />
          <View style={styles.rowDivider} />
          <SettingsRow
            label="Sign Out"
            trail="→"
            onPress={handleSignOut}
            danger
          />
        </SettingsGroup>

        {/* Branded footer — claim trademark + show domain + dated copyright */}
        <View style={styles.brandFooter}>
          <Text style={styles.brandMark}>Atleato™</Text>
          <Text style={styles.brandTag}>TRAIN  ·  FUEL  ·  RISE</Text>
          <Text style={styles.brandUrl}>atleato.com</Text>
          <Text style={styles.brandCopyright}>
            © {new Date().getFullYear()} Atleato.  v1.0.0
          </Text>
          <Text style={styles.brandLegal}>
            Coach Hub™, PR Shelf™, Morning Brief™, Streak Hero™ and Coach Calls™ are
            trademarks of Atleato. All persona theming, voice routing, and form-coach
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
  backBtn: { width: 32 },
  backText: { fontSize: 22, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6 },

  // Hero
  hero: {
    padding: Spacing.md,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  proBadge: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8,
  },
  proBadgeText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
  heroName: { fontFamily: Fonts.display, fontSize: 30, color: Colors.text, letterSpacing: -0.5, lineHeight: 34 },
  heroSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, marginTop: 4, letterSpacing: 0.5 },
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

  statStrip: { flexDirection: 'row', gap: 8, paddingBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4, padding: 10,
  },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  statValue: { fontFamily: Fonts.display, fontSize: 22, marginTop: 4 },
  statUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary },

  // Settings groups
  group: { paddingHorizontal: Spacing.md, paddingTop: 20 },
  groupTitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.8, marginBottom: 8 },
  groupCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, overflow: 'hidden' },

  settingsRow: { padding: 14, flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  settingsLabel: { fontFamily: Fonts.body, fontSize: 14, color: Colors.text, fontWeight: '600' },
  settingsSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: 2, letterSpacing: 0.4 },
  settingsTrail: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },
  voiceToggleRow: {
    padding: 14, flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 10,
  },

  // Inline edit
  inlineEditWrap: { paddingHorizontal: 14, paddingBottom: 12 },
  inlineEditLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1, marginBottom: 6 },
  inlineEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statInput: {
    flex: 1, fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 4,
  },
  saveBtn: {
    borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8,
  },
  saveBtnText: { fontFamily: Fonts.display, fontSize: 11, color: '#000', letterSpacing: 0.5 },

  version: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, textAlign: 'center', marginTop: 28, letterSpacing: 0.5 },

  // Branded footer
  brandFooter: { alignItems: 'center', marginTop: 32, paddingHorizontal: 24 },
  brandMark: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: -0.5 },
  brandTag:  { fontFamily: Fonts.mono, fontSize: 9, color: Colors.primary, letterSpacing: 2.4, marginTop: 4 },
  brandUrl:  { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1.2, marginTop: 14 },
  brandCopyright: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: 6 },
  brandLegal: {
    fontFamily: Fonts.body, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 13, marginTop: 14, fontStyle: 'italic',
    letterSpacing: 0.2,
  },
});
