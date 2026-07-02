/**
 * ImplementationIntentionSheet
 *
 * Three-step wizard for committing to TOMORROW'S workout:
 *   1. WHEN   — pick a time
 *   2. WHERE  — quick chips (home / gym / outdoors) + free text
 *   3. WHAT   — what you'll wear (chips)
 *
 * Saves to AsyncStorage via `setIntention`. Coach acknowledges the
 * commitment in their voice on the success step.
 *
 * Surfaces:
 *   - Right after post-workout (most reliable trigger — habit chains)
 *   - From dashboard "TOMORROW" card when no intention is set for tomorrow
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BottomSheet } from '@/components/ui';
import { setIntention, formatTime12h } from '@/lib/implementationIntention';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** ISO date this intention is FOR (defaults to tomorrow). */
  dateISO: string;
  persona: PersonaTheme;
  onCommitted?: () => void;
}

type Step = 'when' | 'where' | 'wear' | 'done';

const LOCATION_CHIPS = [
  '🏠  Home',
  '🏋️  My gym',
  '🌳  Outdoors',
  '🏨  Hotel gym',
];

const WEAR_CHIPS = [
  '👕  Shorts + tee',
  '👟  Full gear',
  '🧥  Hoodie + joggers',
  '🩳  Just shorts',
];

const COACH_COMMITMENT_LINE: Record<string, string> = {
  cbum:        'Locked in. See you tomorrow.',
  arnold:      'The plan is set. The body will follow.',
  nippard:     'Implementation intention recorded. Adherence likely +60%.',
  ct_fletcher: 'YOU JUST MADE A PROMISE. I WILL HOLD YOU TO IT.',
  dr_mike:     'Pre-commitment logged. n=1 study on you begins.',
};

export function ImplementationIntentionSheet({
  visible, onClose, dateISO, persona, onCommitted,
}: Props) {
  const [step, setStep]         = useState<Step>('when');
  const [pickedTime, setTime]   = useState<Date>(() => {
    // default: 7:00 AM tomorrow
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [wearing, setWearing]   = useState('');
  const [saving, setSaving]     = useState(false);

  const reset = () => {
    setStep('when');
    setLocation('');
    setWearing('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCommit = async () => {
    setSaving(true);
    try {
      const h = pickedTime.getHours();
      const m = pickedTime.getMinutes();
      const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      await setIntention({
        date: dateISO,
        timeOfDay: hm,
        location: location || 'gym',
        wearing: wearing || 'gym gear',
      });
      setStep('done');
      onCommitted?.();
    } finally {
      setSaving(false);
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) setTime(selected);
  };

  // ── DONE state ──
  if (step === 'done') {
    const h = pickedTime.getHours();
    const m = pickedTime.getMinutes();
    const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const coachLine = COACH_COMMITMENT_LINE[persona.id] ?? COACH_COMMITMENT_LINE.cbum;

    return (
      <BottomSheet visible={visible} onClose={handleClose} title="Committed">
        <View style={[styles.doneCard, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}>
          <Text style={[styles.doneCheck, { color: persona.accent }]}>✓</Text>
          <Text style={[styles.doneLabel, { color: persona.accent }]}>
            {styleText(persona, "TOMORROW'S COMMITMENT")}
          </Text>
          <Text style={styles.doneTime}>{formatTime12h(hm)}</Text>
          <Text style={styles.doneDetails}>
            {location || 'gym'}  ·  {wearing || 'gym gear'}
          </Text>
          <View style={styles.coachLineBox}>
            <Text style={[styles.coachAttrib, { color: persona.accent }]}>
              ✦ {styleText(persona, `${persona.shortName} SAYS`)}
            </Text>
            <Text style={styles.coachLine}>{coachLine}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: persona.accent }]}
          onPress={handleClose}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnPrimaryText, { color: persona.ink }]}>OK</Text>
        </TouchableOpacity>
      </BottomSheet>
    );
  }

  // ── Active wizard step ──
  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Lock in tomorrow">
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {['when', 'where', 'wear'].map((s) => (
          <View
            key={s}
            style={[
              styles.dot,
              s === step && { backgroundColor: persona.accent, width: 24 },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.eyebrow, { color: persona.accent }]}>
        ✦ {styleText(persona, 'PRE-COMMIT — RESEARCH-BACKED')}
      </Text>

      {step === 'when' && (
        <>
          <Text style={styles.question}>When does your workout happen tomorrow?</Text>
          <Text style={styles.helper}>Naming the time makes you 2× more likely to actually do it.</Text>

          <TouchableOpacity
            style={[styles.timePicker, { borderColor: persona.accent }]}
            onPress={() => setShowTimePicker(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.timeText, { color: persona.accent }]}>
              {formatTime12h(`${String(pickedTime.getHours()).padStart(2, '0')}:${String(pickedTime.getMinutes()).padStart(2, '0')}`)}
            </Text>
            <Text style={styles.timeChevron}>›</Text>
          </TouchableOpacity>

          {showTimePicker && (
            <DateTimePicker
              mode="time"
              value={pickedTime}
              onChange={onTimeChange}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            />
          )}

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: persona.accent }]}
            onPress={() => setStep('where')}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnPrimaryText, { color: persona.ink }]}>NEXT  →</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'where' && (
        <>
          <Text style={styles.question}>Where will you train?</Text>
          <Text style={styles.helper}>Naming the place removes a decision tomorrow.</Text>

          <View style={styles.chipGrid}>
            {LOCATION_CHIPS.map((chip) => {
              const active = location === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, active && { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}
                  onPress={() => setLocation(chip)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && { color: persona.accent }]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.orLabel}>or type a specific place:</Text>
          <TextInput
            style={styles.input}
            value={location.startsWith('🏠') || location.startsWith('🏋️') || location.startsWith('🌳') || location.startsWith('🏨') ? '' : location}
            onChangeText={setLocation}
            placeholder="e.g. Gold's Gym, basement"
            placeholderTextColor={Colors.textTertiary}
            maxLength={60}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('when')}>
              <Text style={styles.btnSecondaryText}>BACK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnPrimaryFlex, { backgroundColor: persona.accent }, !location && { opacity: 0.4 }]}
              onPress={() => setStep('wear')}
              disabled={!location}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnPrimaryText, { color: persona.ink }]}>NEXT  →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'wear' && (
        <>
          <Text style={styles.question}>What will you wear?</Text>
          <Text style={styles.helper}>Pre-deciding clothes removes friction in the morning.</Text>

          <View style={styles.chipGrid}>
            {WEAR_CHIPS.map((chip) => {
              const active = wearing === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  style={[styles.chip, active && { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}
                  onPress={() => setWearing(chip)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && { color: persona.accent }]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('where')}>
              <Text style={styles.btnSecondaryText}>BACK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnPrimaryFlex, { backgroundColor: persona.accent }, (!wearing || saving) && { opacity: 0.4 }]}
              onPress={handleCommit}
              disabled={!wearing || saving}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnPrimaryText, { color: persona.ink }]}>{saving ? 'COMMITTING…' : 'COMMIT  ✓'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 18 },
  dot: { width: 8, height: 3, borderRadius: 2, backgroundColor: Colors.borderStrong },

  eyebrow: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 8 },
  question: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, lineHeight: 26, letterSpacing: -0.4, marginBottom: 6 },
  helper: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 18, fontStyle: 'italic' },

  // Time picker tile
  timePicker: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 22,
    borderRadius: 8, borderWidth: 2,
    marginBottom: 18, justifyContent: 'space-between',
  },
  timeText: { fontFamily: Fonts.display, fontSize: 32, letterSpacing: -0.6 },
  timeChevron: { fontFamily: Fonts.body, fontSize: 24, color: Colors.textTertiary },

  // Chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: Colors.text },

  orLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2, marginTop: 6, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.body, fontSize: 14, color: Colors.text, marginBottom: 18,
  },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    paddingVertical: 14, alignItems: 'center', borderRadius: 6,
  },
  btnPrimaryFlex: { flex: 2 },
  btnPrimaryText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1.2 },
  btnSecondary: {
    flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  btnSecondaryText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.textSecondary, letterSpacing: 0.8 },

  // Done state
  doneCard: {
    borderLeftWidth: 3, borderRadius: 8, padding: 18, marginBottom: 14, alignItems: 'center',
  },
  doneCheck: { fontFamily: Fonts.display, fontSize: 44 },
  doneLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.8, marginTop: 6 },
  doneTime: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text, marginTop: 8, letterSpacing: -0.8 },
  doneDetails: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 4 },

  coachLineBox: {
    marginTop: 18, paddingTop: 14, alignSelf: 'stretch',
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  coachAttrib: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.6, marginBottom: 6 },
  coachLine: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 19, fontStyle: 'italic' },
});
