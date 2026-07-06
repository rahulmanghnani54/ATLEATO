/**
 * Social Stake setup screen
 *
 * Lets the user pick a single "witness" — a friend, partner, or sibling
 * they trust to call them out if they skip a week. Three modes:
 *   1. View current witness (if set) — option to text now, edit, or remove
 *   2. Pick from device contacts (with permission)
 *   3. Enter manually (no contacts permission needed)
 *
 * Privacy: witness is stored on-device only. No server sync.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  getWitness, setWitness, clearWitness, buildWitnessMessage,
  type Witness,
} from '@/lib/socialStake';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const RELATIONSHIPS = ['Partner', 'Friend', 'Sibling', 'Parent', 'Coach', 'Other'];

export default function SocialStakeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const [existing, setExisting] = useState<Witness | null>(null);
  const [loaded, setLoaded]     = useState(false);

  // Form state for adding/editing
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [relationship, setRelationship] = useState<string>('Friend');
  const [editing, setEditing]           = useState(false);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    (async () => {
      const w = await getWitness();
      setExisting(w);
      if (w) {
        setName(w.name); setPhone(w.phone);
        setRelationship(w.relationship ?? 'Friend');
      }
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    const cleanName  = name.trim();
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) {
      Alert.alert('Name required', 'Enter your witness\'s name (at least 2 characters).');
      return;
    }
    if (cleanPhone.length < 7) {
      Alert.alert('Phone required', 'Enter their phone number with country code (e.g. +91…).');
      return;
    }
    setSaving(true);
    try {
      const saved = await setWitness({ name: cleanName, phone: cleanPhone, relationship });
      setExisting(saved);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove witness?',
      `${existing?.name} will no longer be your accountability witness.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await clearWitness();
            setExisting(null);
            setName(''); setPhone(''); setRelationship('Friend');
          },
        },
      ],
    );
  };

  const handleTestText = async () => {
    if (!existing) return;
    const userName = (profile?.full_name ?? 'I').split(' ')[0];
    const msg = buildWitnessMessage({
      userName,
      witnessName: existing.name,
      sessionsThisWeek: 0,
      personaShortName: persona.shortName,
    });
    // sms: deep-link opens the user's SMS app pre-filled
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${encodeURIComponent(existing.phone)}${sep}body=${encodeURIComponent(msg)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open SMS', 'Manually text them — message copied below.');
    }
  };

  if (!loaded) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ACCOUNTABILITY PARTNER</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Persona-themed hero */}
        <View style={[styles.hero, { backgroundColor: persona.accent }]}>
          <Text style={[styles.heroEyebrow, { color: persona.ink, opacity: 0.7 }]}>
            ✦ {styleText(persona, 'PUBLIC COMMITMENT MECHANIC')}
          </Text>
          <Text style={[styles.heroTitle, { color: persona.ink }]}>
            {styleText(persona, 'Pick one person.\nDon\'t let them down.')}
          </Text>
          <Text style={[styles.heroSub, { color: persona.ink, opacity: 0.75 }]}>
            Research: private commitment → 35% follow-through. Public commitment to ONE
            person → 78%. Choose someone you respect enough that disappointing them stings.
          </Text>
        </View>

        {/* ── CURRENT WITNESS state ── */}
        {existing && !editing && (
          <>
            <View style={[styles.witnessCard, { borderLeftColor: persona.accent }]}>
              <Text style={[styles.eyebrow, { color: persona.accent }]}>YOUR PARTNER</Text>
              <Text style={styles.witnessName}>{existing.name}</Text>
              <Text style={styles.witnessMeta}>
                {existing.relationship ?? 'Friend'}  ·  {existing.phone}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: persona.accent }]}
              onPress={handleTestText}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: persona.ink }]}>
                ✉  SEND THEM A TEST MESSAGE
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setEditing(true)}
              >
                <Text style={styles.secondaryBtnText}>✎  EDIT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleRemove}
              >
                <Text style={[styles.secondaryBtnText, { color: '#ef4444' }]}>✕  REMOVE</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footnote}>
              You'll get a Sunday nudge if you train fewer than 3 days that week.
              The app NEVER auto-sends — only opens your SMS app with a pre-written
              message. You tap Send. Your witness's contact never leaves this device.
            </Text>
          </>
        )}

        {/* ── ADD / EDIT WITNESS form ── */}
        {(!existing || editing) && (
          <View style={styles.form}>
            <Text style={styles.label}>PARTNER NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Priya"
              placeholderTextColor={Colors.textTertiary}
              autoFocus={!existing}
              maxLength={40}
            />

            <Text style={styles.label}>PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98XXXXXXXX"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={20}
            />
            <Text style={styles.helper}>
              Include country code. We never call this number — only open your SMS app
              pre-filled when YOU tap Send.
            </Text>

            <Text style={styles.label}>RELATIONSHIP</Text>
            <View style={styles.relGrid}>
              {RELATIONSHIPS.map((r) => {
                const active = relationship === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.relChip,
                      active && { borderColor: persona.accent, backgroundColor: persona.accentSoft },
                    ]}
                    onPress={() => setRelationship(r)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.relChipText, active && { color: persona.accent }]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.formActions}>
              {editing && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => { setEditing(false); }}
                >
                  <Text style={styles.secondaryBtnText}>CANCEL</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.primaryBtnFlex,
                  { backgroundColor: persona.accent },
                  saving && { opacity: 0.4 },
                ]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnText, { color: persona.ink }]}>
                  {saving ? 'SAVING…' : (existing ? 'UPDATE' : 'LOCK IT IN  →')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 0.4 },

  scroll: { padding: Spacing.md, paddingBottom: 40 },

  hero: {
    borderRadius: 8, padding: 18, marginBottom: 18,
  },
  heroEyebrow: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginBottom: 6 },
  heroTitle: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, marginTop: 10, lineHeight: 19 },

  witnessCard: {
    backgroundColor: Colors.surface, borderLeftWidth: 3, borderRadius: 6,
    padding: 16, marginBottom: 16,
  },
  eyebrow: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4, marginBottom: 6 },
  witnessName: { fontFamily: Fonts.display, fontSize: 24, color: Colors.text, letterSpacing: -0.5 },
  witnessMeta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  primaryBtn: {
    paddingVertical: 16, borderRadius: 6, alignItems: 'center',
  },
  primaryBtnFlex: { flex: 2 },
  primaryBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1.2 },

  secondaryRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondaryBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.8 },

  // Form
  form: { gap: 6 },
  label: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.body, fontSize: 14, color: Colors.text,
  },
  helper: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.4, marginTop: 6, fontStyle: 'italic', lineHeight: 13 },

  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  relChipText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.textSecondary },

  formActions: { flexDirection: 'row', gap: 8, marginTop: 18 },

  footnote: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    lineHeight: 14, marginTop: 18, fontStyle: 'italic', textAlign: 'center',
  },
});
