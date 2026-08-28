/**
 * Social Stake setup screen — Bold Canvas.
 *
 * Lets the user pick a single "witness" — a friend, partner, or sibling
 * they trust to call them out if they skip a week. Three modes:
 *   1. View current witness (if set) — option to text now, edit, or remove
 *   2. Pick from device contacts (with permission)
 *   3. Enter manually (no contacts permission needed)
 *
 * Privacy: witness is stored on-device only. No server sync.
 *
 * The crown carries the argument for the mechanic — the two follow-through
 * figures are the hero, typeset as numerals rather than buried in a paragraph.
 * The light body is the ledger: the witness's name as the one big word, then
 * the form. Every save/remove/SMS handler below is the pre-migration behaviour
 * unchanged; only the paint moved.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pencil, Send, X } from 'lucide-react-native';
import {
  getWitness, setWitness, clearWitness, buildWitnessMessage,
  type Witness,
} from '@/lib/socialStake';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

const RELATIONSHIPS = ['Partner', 'Friend', 'Sibling', 'Parent', 'Coach', 'Other'];

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

type FieldKey = 'name' | 'phone';

export default function SocialStakeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so its tint always resolves against
  // the dark triplet — the light accent would sink into the ink.
  const crownTint = personaAccent(persona, 'dark').accent;

  const [existing, setExisting] = useState<Witness | null>(null);
  const [loaded, setLoaded]     = useState(false);

  // Form state for adding/editing
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [relationship, setRelationship] = useState<string>('Friend');
  const [editing, setEditing]           = useState(false);
  const [saving, setSaving]             = useState(false);
  // One key rather than a flag per input — only ever one field is focused.
  const [focus, setFocus]               = useState<FieldKey | null>(null);

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

  // The crown states the case for the mechanic and never depends on stored data,
  // so it paints identically while the witness loads.
  const crown = (
    <Crown
      eyebrow={styleText(persona, '✦ Public commitment mechanic')}
      title={styleText(persona, 'Pick one person.')}
      accentLine={styleText(persona, 'Don\'t let them down.')}
      accent={crownTint}
      onBack={() => router.back()}
    >
      <Text style={styles.proofCaption}>Follow-through · commitment research</Text>
      <View style={styles.proof}>
        <View style={styles.proofCell}>
          <Text style={styles.proofValueDim}>
            35<Text style={styles.proofPct}>%</Text>
          </Text>
          <Text style={styles.proofLabel} numberOfLines={2}>Private commitment</Text>
        </View>
        <View style={styles.proofCell}>
          <Text style={styles.proofValue}>
            78<Text style={styles.proofPct}>%</Text>
          </Text>
          <Text style={styles.proofLabelOn} numberOfLines={2}>Public · to one person</Text>
        </View>
      </View>
      <Text style={styles.proofNote}>
        Choose someone you respect enough that disappointing them stings.
      </Text>
    </Crown>
  );

  // Same gate as before — nothing witness-derived renders until the read
  // resolves. It just holds the page's shape now instead of flashing blank.
  if (!loaded) {
    return (
      <View style={styles.root}>
        <CanvasScreen tabBar={false} bottomSpace={28}>
          {crown}
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            <Section label="Your partner" style={styles.firstSection}>
              <Skeleton height={38} width="62%" radius={0} />
              <Skeleton height={11} width="44%" radius={0} style={styles.skelMeta} />
              <Skeleton height={58} radius={29} style={styles.skelPrimary} />
              <Skeleton height={50} radius={25} style={styles.skelSecondary} />
            </Section>
          </SafeAreaView>
        </CanvasScreen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CanvasScreen tabBar={false} bottomSpace={28}>
        {crown}

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          {/* ── CURRENT WITNESS state ── */}
          {existing && !editing && (
            <>
              <Section label="Your partner" style={styles.firstSection}>
                <Text style={styles.witnessName} numberOfLines={2}>{existing.name}</Text>
                <Text style={styles.witnessMeta} numberOfLines={1}>
                  {existing.relationship ?? 'Friend'}  ·  {existing.phone}
                </Text>

                {/* The screen's one filled control. The fill is the coach's
                    colour, so its boundary hairline takes the persona's
                    text-safe tone — a light page needs that edge. */}
                <PressableScale
                  onPress={handleTestText}
                  haptic="heavy"
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityLabel="Send them a test message"
                  style={[styles.primary, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
                >
                  <Send size={17} color={pa.ink} />
                  <Text style={[styles.primaryText, { color: pa.ink }]} numberOfLines={1}>
                    Send them a test message
                  </Text>
                </PressableScale>

                <View style={styles.secondaryRow}>
                  <PressableScale
                    onPress={() => setEditing(true)}
                    haptic="light"
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityLabel="Edit partner"
                    style={styles.secondary}
                  >
                    <Pencil size={15} color={tokens.textSecondary} />
                    <Text style={styles.secondaryText} numberOfLines={1}>Edit</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={handleRemove}
                    haptic="light"
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityLabel="Remove partner"
                    style={[styles.secondary, { borderColor: tokens.danger }]}
                  >
                    <X size={15} color={tokens.danger} />
                    <Text style={[styles.secondaryText, { color: tokens.danger }]} numberOfLines={1}>
                      Remove
                    </Text>
                  </PressableScale>
                </View>
              </Section>

              <Text style={styles.footnote}>
                You'll get a Sunday nudge if you train fewer than 3 days that week.
                The app NEVER auto-sends — only opens your SMS app with a pre-written
                message. You tap Send. Your witness's contact never leaves this device.
              </Text>
            </>
          )}

          {/* ── ADD / EDIT WITNESS form ── */}
          {(!existing || editing) && (
            <Section
              label={existing ? 'Edit your partner' : 'Name your partner'}
              style={styles.firstSection}
            >
              <Text style={styles.label}>Partner name</Text>
              <TextInput
                style={[styles.field, focus === 'name' && { backgroundColor: pa.accentSoft }]}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocus('name')}
                onBlur={() => setFocus(null)}
                placeholder="e.g. Priya"
                placeholderTextColor={tokens.textTertiary}
                keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
                autoFocus={!existing}
                maxLength={40}
              />

              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={[styles.field, focus === 'phone' && { backgroundColor: pa.accentSoft }]}
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocus('phone')}
                onBlur={() => setFocus(null)}
                placeholder="+91 98XXXXXXXX"
                placeholderTextColor={tokens.textTertiary}
                keyboardType="phone-pad"
                keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
                maxLength={20}
              />
              <Text style={styles.helper}>
                Include country code. We never call this number — only open your SMS app
                pre-filled when YOU tap Send.
              </Text>

              <Text style={styles.label}>Relationship</Text>
              <View style={styles.relGrid}>
                {RELATIONSHIPS.map((r) => {
                  const active = relationship === r;
                  return (
                    <PressableScale
                      key={r}
                      onPress={() => setRelationship(r)}
                      haptic="light"
                      scaleTo={0.96}
                      accessibilityRole="button"
                      accessibilityLabel={r}
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.relChip,
                        active && { backgroundColor: pa.accentSoft, borderColor: pa.accentText },
                      ]}
                    >
                      <Text
                        style={[styles.relChipText, active && { color: pa.accentText }]}
                        numberOfLines={1}
                      >
                        {r}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <View style={styles.formActions}>
                {editing && (
                  <PressableScale
                    onPress={() => { setEditing(false); }}
                    haptic="light"
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    style={[styles.secondary, styles.formCancel]}
                  >
                    <Text style={styles.secondaryText} numberOfLines={1}>Cancel</Text>
                  </PressableScale>
                )}
                <PressableScale
                  onPress={handleSave}
                  disabled={saving}
                  haptic="heavy"
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityLabel={existing ? 'Update partner' : 'Lock it in'}
                  accessibilityState={{ disabled: saving }}
                  style={[
                    styles.primary,
                    styles.primaryFlex,
                    { backgroundColor: pa.accent, borderColor: pa.accentText },
                  ]}
                >
                  <Text style={[styles.primaryText, { color: pa.ink }]} numberOfLines={1}>
                    {saving ? 'Saving…' : (existing ? 'Update' : 'Lock it in  →')}
                  </Text>
                </PressableScale>
              </View>
            </Section>
          )}
        </SafeAreaView>
      </CanvasScreen>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  // The crown is full-bleed, so the gutter lives on the body.
  body: { paddingHorizontal: BODY_PAD },
  // Section's own top margin is tuned for a mid-page break; the first one sits
  // right under the crown and needs less.
  firstSection: { marginTop: 22 },

  // ── Crown: the research pair ───────────────────────────────────────────────
  proofCaption: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginTop: 26,
    marginBottom: 12,
  },
  proof: { flexDirection: 'row', gap: 18 },
  proofCell: { flex: 1, gap: 7 },
  proofValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    lineHeight: 47,
    // -0.045em at 46px.
    letterSpacing: -2.07,
    color: t.crownText,
    fontVariant: ['tabular-nums'],
  },
  // The losing figure is the same numeral held back in the dim ink — the gap
  // between the two IS the argument, so it must not be a second colour.
  proofValueDim: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    lineHeight: 47,
    letterSpacing: -2.07,
    color: t.crownTextDim,
    fontVariant: ['tabular-nums'],
  },
  proofPct: {
    fontFamily: Fonts.displayBold,
    fontSize: 19,
    letterSpacing: 0,
    color: t.crownTextDim,
  },
  proofLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.crownTextDim,
  },
  proofLabelOn: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.crownText,
  },
  proofNote: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
    color: t.crownTextDim,
    marginTop: 18,
  },

  // ── Current witness ────────────────────────────────────────────────────────
  witnessName: {
    fontFamily: Fonts.displayBold,
    fontSize: 38,
    lineHeight: 41,
    // -0.045em at 38px.
    letterSpacing: -1.71,
    color: t.text,
  },
  witnessMeta: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 9,
  },

  // ── Controls ───────────────────────────────────────────────────────────────
  primary: {
    marginTop: 26,
    minHeight: 58,
    borderRadius: 29,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22,
  },
  primaryFlex: { flex: 2, marginTop: 0 },
  primaryText: {
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    letterSpacing: -0.3,
  },

  secondaryRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: t.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 13,
    letterSpacing: -0.1,
    color: t.textSecondary,
  },

  // ── Form ───────────────────────────────────────────────────────────────────
  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 20,
    marginBottom: 9,
  },
  // Borderless: the field is a filled plate, and focus warms that fill to the
  // persona tint instead of growing a ring.
  field: {
    height: 58,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 0,
    backgroundColor: t.surfaceAlt,
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    color: t.text,
  },
  helper: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    color: t.textTertiary,
    marginTop: 10,
  },

  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  relChipText: {
    fontFamily: Fonts.bodySemi,
    fontSize: 13.5,
    letterSpacing: -0.1,
    color: t.textSecondary,
  },

  formActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 },
  // Matches the primary's box so the pair reads as one control, not two sizes.
  formCancel: { minHeight: 58, borderRadius: 29 },

  // ── Loading placeholders ───────────────────────────────────────────────────
  skelMeta: { marginTop: 11 },
  skelPrimary: { marginTop: 26 },
  skelSecondary: { marginTop: 12 },

  footnote: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    lineHeight: 15,
    letterSpacing: 0.9,
    color: t.textTertiary,
    textAlign: 'center',
    marginTop: 30,
  },
});
