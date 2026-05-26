/**
 * Streak Nudge — "don't break the chain"
 *
 * Appears on the home screen only when:
 *   - Streak > 0
 *   - User hasn't trained today
 *   - Today is not a programmed rest day
 *   - Local time ≥ 4pm (reasonable nudge window)
 *
 * Renders nothing otherwise — pure overlay component.
 * Uses the coach's voice for the nudge text.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getMissDayNudge } from '@/lib/streakEngine';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export function StreakNudge({
  streak, trainedToday, isRestDay, persona, onTrainPress,
}: {
  streak: number;
  trainedToday: boolean;
  isRestDay: boolean;
  persona: PersonaTheme;
  onTrainPress: () => void;
}) {
  const nudge = getMissDayNudge({ streak, trainedToday, isRestDay, persona });
  if (!nudge) return null;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}
      onPress={onTrainPress}
      activeOpacity={0.85}
    >
      <View style={styles.left}>
        <Text style={[styles.flame, { color: persona.accent }]}>🔥</Text>
      </View>
      <View style={styles.middle}>
        <Text style={[styles.label, { color: persona.accent }]}>
          {styleText(persona, "DON'T BREAK THE CHAIN")}
        </Text>
        <Text style={styles.text}>{nudge}</Text>
      </View>
      <Text style={[styles.arrow, { color: persona.accent }]}>→</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 6,
    padding: 12, marginBottom: 14,
  },
  left: { width: 28, alignItems: 'center' },
  flame: { fontSize: 22 },
  middle: { flex: 1 },
  label: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, marginBottom: 4 },
  text: { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 17 },
  arrow: { fontSize: 18, fontFamily: Fonts.display },
});
