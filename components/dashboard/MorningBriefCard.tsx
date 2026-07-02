/**
 * Morning Brief Card
 *
 * Tiny two-step ritual on the home screen — your coach asks how you slept
 * and what your intent is. Takes 5 seconds. Produces a volume modifier
 * that adjusts today's workout.
 *
 * States:
 *   1. Not done   → shows step 1 (sleep) → tap → step 2 (intent) → save
 *   2. Done       → collapsed summary chip ("Coach set your day: Charged · Heavy Push")
 *
 * Tap the summary chip to expand it again and review the recommendation.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  useMorningBrief, describeBrief, briefAdvice,
  type SleepQuality, type Intent,
} from '@/hooks/useMorningBrief';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

interface Option<T> {
  value: T;
  emoji: string;
  label: string;
  sub: string;
}

const SLEEP_OPTIONS: Option<SleepQuality>[] = [
  { value: 'rough', emoji: '😴', label: 'Rough',  sub: '< 6 hrs / restless' },
  { value: 'ok',    emoji: '😐', label: 'OK',     sub: 'Slept fine' },
  { value: 'great', emoji: '💪', label: 'Great',  sub: 'Charged up' },
];

const INTENT_OPTIONS: Option<Intent>[] = [
  { value: 'light',  emoji: '🧘', label: 'Light',  sub: 'Movement only' },
  { value: 'steady', emoji: '⚡', label: 'Steady', sub: 'Hit the numbers' },
  { value: 'push',   emoji: '🔥', label: 'Push',   sub: 'Send the top set' },
];

export function MorningBriefCard({ persona }: { persona: PersonaTheme }) {
  const { brief, loading, save, reset, isDone } = useMorningBrief();
  const [step, setStep] = useState<'sleep' | 'intent'>('sleep');
  const [pickedSleep, setPickedSleep] = useState<SleepQuality | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (loading) return null;

  // ── DONE state: small summary chip (tap to expand) ─────────────────────────
  if (isDone && brief && !expanded) {
    return (
      <TouchableOpacity
        style={[styles.doneChip, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.doneIcon, { color: persona.accent }]}>✓</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.doneLabel, { color: persona.accent }]}>
            {styleText(persona, 'BRIEF COMPLETE')}
          </Text>
          <Text style={styles.doneText}>{describeBrief(brief)} · tap to review</Text>
        </View>
        <Text style={[styles.doneModifier, { color: persona.accent }]}>
          ×{brief.modifier.toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  }

  // ── DONE + expanded: full recommendation card ──────────────────────────────
  if (isDone && brief && expanded) {
    return (
      <View style={[styles.card, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardEyebrow, { color: persona.accent }]}>
            ✦ {styleText(persona, `${persona.shortName}'S MORNING BRIEF`)}
          </Text>
          <TouchableOpacity onPress={() => setExpanded(false)}>
            <Text style={[styles.collapseBtn, { color: persona.accent }]}>—</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.cardHeadline}>{describeBrief(brief)}</Text>
        <Text style={styles.cardAdvice}>{briefAdvice(brief)}</Text>

        <View style={styles.modifierRow}>
          <Text style={styles.modifierLabel}>VOLUME MODIFIER</Text>
          <Text style={[styles.modifierValue, { color: persona.accent }]}>
            ×{brief.modifier.toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={async () => { await reset(); setStep('sleep'); setPickedSleep(null); setExpanded(false); }}
          style={styles.resetLink}
        >
          <Text style={styles.resetLinkText}>Re-do brief</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── ACTIVE: step 1 (sleep) or step 2 (intent) ──────────────────────────────
  const isStep1 = step === 'sleep';
  const options = isStep1 ? SLEEP_OPTIONS : INTENT_OPTIONS;
  const question = isStep1 ? 'How did you sleep last night?' : "What's the intent today?";
  const eyebrow = isStep1
    ? `${persona.shortName}'S MORNING BRIEF · STEP 1 OF 2`
    : `${persona.shortName}'S MORNING BRIEF · STEP 2 OF 2`;

  return (
    <View style={[styles.card, { borderLeftColor: persona.accent, backgroundColor: persona.accentSoft }]}>
      <Text style={[styles.cardEyebrow, { color: persona.accent }]}>
        ✦ {styleText(persona, eyebrow)}
      </Text>
      <Text style={styles.cardQuestion}>{styleText(persona, question)}</Text>

      <View style={styles.optionsRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={String(opt.value)}
            style={[styles.option, { borderColor: persona.accent }]}
            onPress={async () => {
              if (isStep1) {
                setPickedSleep(opt.value as SleepQuality);
                setStep('intent');
              } else if (pickedSleep) {
                setSaving(true);
                try {
                  await save(pickedSleep, opt.value as Intent);
                } finally {
                  setSaving(false);
                }
              }
            }}
            disabled={saving}
            activeOpacity={0.75}
          >
            <Text style={styles.optionEmoji}>{opt.emoji}</Text>
            <Text style={[styles.optionLabel, { color: persona.accent }]}>
              {styleText(persona, opt.label)}
            </Text>
            <Text style={styles.optionSub}>{opt.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Progress dots */}
      <View style={styles.progressRow}>
        <View style={[styles.progressDot, { backgroundColor: persona.accent }]} />
        <View style={[
          styles.progressDot,
          { backgroundColor: isStep1 ? Colors.borderStrong : persona.accent },
        ]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Active card ────────────────────────────────────────────────────────────
  card: {
    borderLeftWidth: 3, borderRadius: 6,
    padding: 16, marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardEyebrow: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, marginBottom: 4 },
  cardQuestion: {
    fontFamily: Fonts.display, fontSize: 20, color: Colors.text,
    lineHeight: 24, letterSpacing: -0.3, marginBottom: 14, marginTop: 2,
  },
  cardHeadline: {
    fontFamily: Fonts.display, fontSize: 22, color: Colors.text,
    lineHeight: 26, marginTop: 4,
  },
  cardAdvice: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary,
    lineHeight: 19, marginTop: 6,
  },
  collapseBtn: { fontSize: 22, lineHeight: 22, paddingHorizontal: 8 },

  // ── Options ────────────────────────────────────────────────────────────────
  optionsRow: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1, borderWidth: 1, borderRadius: 5,
    padding: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  optionEmoji: { fontSize: 24, marginBottom: 6 },
  optionLabel: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: -0.2 },
  optionSub: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 4, textAlign: 'center', letterSpacing: 0.4 },

  // ── Progress dots ──────────────────────────────────────────────────────────
  progressRow: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 14 },
  progressDot: { width: 18, height: 3, borderRadius: 2 },

  // ── Modifier readout (expanded) ────────────────────────────────────────────
  modifierRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  modifierLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4 },
  modifierValue: { fontFamily: Fonts.display, fontSize: 20, letterSpacing: -0.3 },
  resetLink: { marginTop: 10, alignSelf: 'flex-start' },
  resetLinkText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, textDecorationLine: 'underline' },

  // ── Collapsed done chip ────────────────────────────────────────────────────
  doneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, borderRadius: 5,
    paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14,
  },
  doneIcon: { fontSize: 16, fontFamily: Fonts.display },
  doneLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4 },
  doneText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  doneModifier: { fontFamily: Fonts.display, fontSize: 16, letterSpacing: -0.3 },
});
