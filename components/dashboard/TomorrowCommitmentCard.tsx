/**
 * TomorrowCommitmentCard
 *
 * Shows on the home dashboard. Two states:
 *
 *   1. Commitment SET for tomorrow:
 *      "TOMORROW · 6:30 AM · Gold's Gym · Full gear"
 *      Tap to edit.
 *
 *   2. No commitment yet:
 *      "Lock in tomorrow — 2× more likely to actually do it"
 *      Tap to open the ImplementationIntentionSheet.
 *
 * Doesn't render if today is a programmed REST day.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  getTomorrowIntention, cleanupOldIntentions, formatTime12h,
  type Intention,
} from '@/lib/implementationIntention';
import { ImplementationIntentionSheet } from './ImplementationIntentionSheet';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';
import { format } from 'date-fns';

export function TomorrowCommitmentCard({ persona }: { persona: PersonaTheme }) {
  const [intention, setIntention] = useState<Intention | null>(null);
  const [loaded, setLoaded]       = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const refresh = async () => {
    const i = await getTomorrowIntention();
    setIntention(i);
  };

  useEffect(() => {
    (async () => {
      await cleanupOldIntentions();
      await refresh();
      setLoaded(true);
    })();
  }, []);

  // Refresh whenever the home screen regains focus — picks up an intention
  // the user just committed via post-workout.tsx's sheet.
  useFocusEffect(useCallback(() => { refresh(); }, []));

  if (!loaded) return null;

  const tomorrowISO = format(new Date(Date.now() + 86_400_000), 'yyyy-MM-dd');

  return (
    <>
      {intention ? (
        <TouchableOpacity
          style={[styles.cardSet, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
        >
          <View style={styles.cardSetRow}>
            <Text style={[styles.label, { color: persona.accent }]}>
              ✓ {styleText(persona, 'TOMORROW · LOCKED IN')}
            </Text>
            <Text style={styles.editHint}>tap to edit</Text>
          </View>
          <Text style={styles.timeBig}>{formatTime12h(intention.timeOfDay)}</Text>
          <Text style={styles.details}>
            {intention.location}  ·  {intention.wearing}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.cardEmpty, { borderColor: persona.accent }]}
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: persona.accent }]}>
              ✦ {styleText(persona, 'PRE-COMMIT TOMORROW')}
            </Text>
            <Text style={styles.emptyTitle}>Lock in tomorrow's session</Text>
            <Text style={styles.emptySub}>
              Naming WHEN, WHERE, and WHAT TO WEAR makes you 2× more likely
              to actually do it. Research-backed.
            </Text>
          </View>
          <Text style={[styles.emptyArrow, { color: persona.accent }]}>→</Text>
        </TouchableOpacity>
      )}

      <ImplementationIntentionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        dateISO={tomorrowISO}
        persona={persona}
        onCommitted={refresh}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Committed state
  cardSet: {
    borderLeftWidth: 3, borderRadius: 6,
    padding: 14, marginBottom: 14,
  },
  cardSetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  editHint: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.6, fontStyle: 'italic' },
  timeBig: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text, marginTop: 8, letterSpacing: -0.6 },
  details: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  // Empty / prompt state
  cardEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 6,
    padding: 14, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 17, color: Colors.text, marginTop: 4, letterSpacing: -0.3 },
  emptySub: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  emptyArrow: { fontFamily: Fonts.display, fontSize: 22 },
});
