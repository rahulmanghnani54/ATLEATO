/**
 * WitnessNudgeCard
 *
 * Appears on the home screen ONLY on Sunday/Monday when:
 *   - User has an accountability witness configured
 *   - User trained fewer than 3 days this week
 *   - We haven't already nudged this week
 *
 * Tapping opens the user's SMS app pre-composed with the "honest check-in"
 * message. We mark the week as nudged whether they actually send or not.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Platform,
} from 'react-native';
import {
  shouldShowWitnessNudge, getWitness, markNudged, buildWitnessMessage,
  type Witness,
} from '@/lib/socialStake';
import { useAuthStore } from '@/stores/authStore';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

const THRESHOLD = 3;

export function WitnessNudgeCard({
  sessionsThisWeek,
  persona,
}: {
  sessionsThisWeek: number;
  persona: PersonaTheme;
}) {
  const profile = useAuthStore((s) => s.profile);
  const [show, setShow]       = useState(false);
  const [witness, setW]       = useState<Witness | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const w = await getWitness();
      if (!alive) return;
      setW(w);
      const visible = await shouldShowWitnessNudge({ sessionsThisWeek });
      if (alive) setShow(visible);
    })();
    return () => { alive = false; };
  }, [sessionsThisWeek]);

  if (!show || !witness) return null;

  const handleTextNow = async () => {
    const userName = (profile?.full_name ?? 'I').split(' ')[0];
    const msg = buildWitnessMessage({
      userName,
      witnessName: witness.name,
      sessionsThisWeek,
      thresholdSessions: THRESHOLD,
      personaShortName: persona.shortName,
    });
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${encodeURIComponent(witness.phone)}${sep}body=${encodeURIComponent(msg)}`;
    try {
      await Linking.openURL(url);
      await markNudged();
      setShow(false);
    } catch {
      // SMS app couldn't open — still mark so we don't keep prompting
      await markNudged();
      setShow(false);
    }
  };

  const handleDismiss = async () => {
    await markNudged();
    setShow(false);
  };

  return (
    <View style={[styles.card, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: persona.accent }]}>
          ✦ {styleText(persona, 'ACCOUNTABILITY CHECK-IN')}
        </Text>
        <TouchableOpacity onPress={handleDismiss}>
          <Text style={styles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>
        Time to text {witness.name}.
      </Text>
      <Text style={styles.body}>
        You hit {sessionsThisWeek}/{THRESHOLD} workouts this week. Public commitment is
        what makes this real — keep your word, or own the miss honestly.
      </Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: persona.accent }]}
        onPress={handleTextNow}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnText, { color: persona.ink }]}>
          ✉  TEXT {witness.name.toUpperCase()} NOW
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  dismiss: { fontFamily: Fonts.body, fontSize: 16, color: Colors.textTertiary, paddingHorizontal: 4 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, marginTop: 8, marginBottom: 6, letterSpacing: -0.3 },
  body: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
  btn: { paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  btnText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 1 },
});
