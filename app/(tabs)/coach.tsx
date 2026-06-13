/**
 * Coach Hub
 *
 * The coach's "office" — where you visit your trainer.
 * Not a chat app — a complete persona experience:
 *   • Hero card with portrait, era, today's quote
 *   • Today's session CTA (deep-links into workout-lobby)
 *   • Training philosophy (focus on / avoid)
 *   • Nutrition approach (macros, signature foods)
 *   • Signature lifts (their pet exercises)
 *   • Coach switcher (chip bar)
 *   • Inline chat at the bottom (existing functionality, integrated)
 *
 * Picking a different coach changes everything — colors, copy, exercises, food.
 */
import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, X as XIcon, Play, ArrowUp } from 'lucide-react-native';
import { aiCoachChat } from '@/lib/api/edgeFunctions';
import type { ClaudeMessage } from '@/lib/api/types';
import { useAuthStore } from '@/stores/authStore';
import { useProgramSchedule } from '@/hooks/useDashboardStats';
import { supabase } from '@/lib/supabase';
import {
  personaFromProgramId, quoteOfTheDay, styleText, getPersona, type PersonaId,
} from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

// Map persona.id → the program_id stored in profiles.selected_program.
// Coach hub uses PersonaId in local state for the switcher chips; persisting
// requires the matching program_id from constants/experts.
const PROGRAM_FOR_PERSONA: Record<PersonaId, string> = {
  cbum: 'cbum_evolved',
  arnold: 'arnold_blueprint',
  nippard: 'nippard_fundamentals',
  ct_fletcher: 'ct_strength',
  dr_mike: 'dr_mike_mav',
};

const PERSONA_ORDER: PersonaId[] = ['cbum', 'arnold', 'nippard', 'ct_fletcher', 'dr_mike'];

const QUICK_PROMPTS = ['Analyze my last week', 'Plan next session', 'Form check', 'Nutrition advice'];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function CoachHub() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const { data: schedule = [] } = useProgramSchedule();
  const [switching, setSwitching] = useState<PersonaId | null>(null);

  // The user's current coach derives from profile.selected_program — that's
  // the single source of truth. Tapping a different coach in the switcher
  // PERSISTS the change (was preview-only previously, which left other
  // screens out of sync).
  const persona = personaFromProgramId(profile?.selected_program);
  const selectedId = persona.id;
  const isUsersCoach = true; // always — we always reflect the persisted choice

  const todayQuote = quoteOfTheDay(persona);
  const todaySchedule = schedule.find((d) => d.isToday);
  const todayWorkoutName = todaySchedule?.isRest ? 'REST DAY' : (todaySchedule?.name ?? 'Today');
  const todayWorkout = todaySchedule?.workout;

  // ── Chat ───────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<ScrollView>(null);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    setInput('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history: ClaudeMessage[] = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await aiCoachChat(persona.id, trimmed, history);
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: "Connection issue — try again in a moment.",
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [persona.id, chatLoading, messages]);

  // ── Switch coach handler ───────────────────────────────────────────────────
  // Persists the change to profiles.selected_program so EVERY screen
  // (dashboard hero, tab bar pill, nutrition macros, etc.) re-themes.
  const switchTo = async (id: PersonaId) => {
    if (id === selectedId || switching) return;
    setSwitching(id);
    const programId = PROGRAM_FOR_PERSONA[id];
    const { error } = await (supabase.from('profiles') as any)
      .update({ selected_program: programId })
      .eq('id', profile?.id ?? '');
    if (error) {
      Alert.alert('Error', "Couldn't switch coach. Try again.");
      setSwitching(null);
      return;
    }
    setMessages([]); // fresh conversation with new coach
    await fetchProfile(profile?.id ?? '');
    setSwitching(null);
  };

  const startTodaysWorkout = () => {
    // Route through the workout-picker so the user can swap day on the fly
    // (e.g. today is Push but they want Pull instead).
    router.push('/workout-picker' as any);
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={chatRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* ── HERO ── full-bleed coach identity ────────────────────────── */}
          <View style={[styles.hero, { backgroundColor: persona.accent }]}>
            <View style={styles.heroTopRow}>
              <View style={[styles.heroAvatar, { borderColor: persona.ink }]}>
                <Text style={[styles.heroInitials, { color: persona.ink }]}>{persona.initials}</Text>
              </View>
              {switching && (
                <View style={[styles.previewChip, { borderColor: persona.ink }]}>
                  <ActivityIndicator size="small" color={persona.ink} />
                </View>
              )}
            </View>
            <Text style={[styles.heroVibe, { color: persona.ink, opacity: 0.6 }]}>
              {styleText(persona, persona.vibe)}
            </Text>
            <Text style={[styles.heroName, { color: persona.ink }]}>
              {styleText(persona, persona.fullName)}
            </Text>
            <Text style={[styles.heroEra, { color: persona.ink, opacity: 0.7 }]}>{persona.era}</Text>
            <View style={[styles.quoteDivider, { backgroundColor: persona.ink, opacity: 0.2 }]} />
            <Text style={[styles.heroQuote, { color: persona.ink }]}>"{todayQuote}"</Text>
          </View>

          {/* ── TODAY'S SESSION CTA ───────────────────────────────────── */}
          {(
            <TouchableOpacity
              style={[styles.todayCard, { borderLeftColor: persona.accent }]}
              onPress={startTodaysWorkout}
              activeOpacity={todaySchedule?.isRest ? 1 : 0.85}
              disabled={todaySchedule?.isRest}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionLabel, { color: persona.accent }]}>Today</Text>
                <Text style={styles.todayWorkoutName}>{todayWorkoutName}</Text>
                <Text style={styles.todayMeta}>
                  {todaySchedule?.isRest
                    ? 'Rest day — recovery is when you grow.'
                    : `${todayWorkout?.exercises.length ?? 0} lifts · ${todayWorkout?.estimatedMinutes ?? 60} min`}
                </Text>
              </View>
              {!todaySchedule?.isRest && (
                <View style={[styles.todayBtn, { backgroundColor: persona.accent }]}>
                  <Play size={18} color={persona.ink} fill={persona.ink} />
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── PHILOSOPHY ──────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Training philosophy</Text>
            <Text style={styles.philosophySig}>{persona.training.signature}</Text>

            <Text style={[styles.miniLabel, { color: persona.accent }]}>Focus on</Text>
            {persona.training.focusOn.map((f, i) => (
              <View key={i} style={styles.bulletRow}>
                <Check size={16} color={persona.accent} strokeWidth={2.5} />
                <Text style={styles.bulletText}>{f}</Text>
              </View>
            ))}

            <Text style={[styles.miniLabel, { color: '#ef4444', marginTop: 10 }]}>Never</Text>
            {persona.training.avoid.map((a, i) => (
              <View key={i} style={styles.bulletRow}>
                <XIcon size={16} color="#ef4444" strokeWidth={2.5} />
                <Text style={styles.bulletText}>{a}</Text>
              </View>
            ))}
          </View>

          {/* ── SIGNATURE LIFTS ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Signature lifts</Text>
            <Text style={styles.signatureSub}>The exercises that define {persona.shortName}'s training.</Text>
            <View style={styles.signatureGrid}>
              {persona.training.signatureLifts.map((lift, i) => (
                <View key={i} style={[styles.signatureChip, { borderColor: persona.accent }]}>
                  <Text style={[styles.signatureChipText, { color: persona.accent }]}>{lift}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── NUTRITION APPROACH ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Nutrition approach</Text>
            <Text style={styles.nutritionHeadline}>{styleText(persona, persona.nutrition.headline)}</Text>
            <Text style={styles.nutritionStyle}>{persona.nutrition.style}</Text>

            <View style={styles.macroRow}>
              <View style={styles.macroBox}>
                <Text style={styles.macroNum}>{persona.nutrition.mealsPerDay}</Text>
                <Text style={styles.macroLabel}>Meals / day</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroNum}>{persona.nutrition.proteinPerKg}g</Text>
                <Text style={styles.macroLabel}>Protein / kg</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={[styles.macroNum, { fontSize: 16 }]}>
                  {persona.nutrition.macroSplit.protein}/{persona.nutrition.macroSplit.carbs}/{persona.nutrition.macroSplit.fat}
                </Text>
                <Text style={styles.macroLabel}>P / C / F</Text>
              </View>
            </View>

            <Text style={[styles.miniLabel, { color: persona.accent, marginTop: 14 }]}>Signature foods</Text>
            <View style={styles.foodGrid}>
              {persona.nutrition.signatureFoods.map((food, i) => (
                <View key={i} style={styles.foodChip}>
                  <Text style={styles.foodChipText}>{food}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.miniLabel, { color: persona.accent, marginTop: 14 }]}>Cutting approach</Text>
            <Text style={styles.cuttingText}>{persona.nutrition.cuttingApproach}</Text>
          </View>

          {/* ── COACH SWITCHER ──────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Explore other coaches</Text>
            <Text style={styles.signatureSub}>
              Tap any coach to switch — the whole app re-themes around their world.
            </Text>
            <View style={styles.coachSwitchRow}>
              {PERSONA_ORDER.map((id) => {
                const p = getPersona(id);
                const active = id === selectedId;
                const isUserId = id === userCoach.id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.coachAvatarBtn,
                      { borderColor: active ? p.accent : 'transparent' },
                      active && { backgroundColor: p.accent },
                    ]}
                    onPress={() => switchTo(id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.coachAvatarBtnText,
                      { color: active ? p.ink : p.accent },
                    ]}>
                      {p.initials}
                    </Text>
                    {isUserId && <View style={[styles.userMarker, { backgroundColor: '#fff' }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── CHAT ──────────────────────────────────────────────── */}
          <View style={[styles.section, { paddingBottom: 14 }]}>
            <Text style={styles.sectionLabel}>
              Chat with {persona.shortName}
            </Text>

            {messages.length === 0 ? (
              <View>
                <Text style={styles.chatPrompt}>
                  Ask {persona.shortName} anything — training, nutrition, mindset.
                </Text>
                <View style={styles.quickRow}>
                  {QUICK_PROMPTS.map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={[styles.quickChip, { borderColor: persona.accent }]}
                      onPress={() => sendMessage(q)}
                    >
                      <Text style={[styles.quickChipText, { color: persona.accent }]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((msg) => (
                <View
                  key={msg.id}
                  style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleCoach]}
                >
                  {msg.role === 'assistant' && (
                    <Text style={[styles.bubbleSender, { color: persona.accent }]}>
                      {persona.shortName}
                    </Text>
                  )}
                  <View style={[
                    styles.bubbleContent,
                    msg.role === 'user'
                      ? { backgroundColor: persona.accent }
                      : styles.bubbleContentCoach,
                  ]}>
                    <Text style={[
                      styles.bubbleText,
                      msg.role === 'user' ? { color: persona.ink } : { color: Colors.text },
                    ]}>
                      {msg.content}
                    </Text>
                  </View>
                </View>
              ))
            )}

            {chatLoading && (
              <View style={styles.bubbleCoach}>
                <Text style={[styles.bubbleSender, { color: persona.accent }]}>{persona.shortName}</Text>
                <View style={styles.bubbleContentCoach}>
                  <View style={styles.typingDots}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: persona.accent, opacity: 0.3 + i * 0.25 }]} />
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── INPUT BAR (always visible) ─────────────────────────────── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={`Ask ${persona.shortName} anything…`}
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={500}
            keyboardAppearance="dark"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: persona.accent },
              (!input.trim() || chatLoading) && styles.sendDisabled,
            ]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || chatLoading}
          >
            {chatLoading
              ? <ActivityIndicator size="small" color={persona.ink} />
              : <ArrowUp size={20} color={persona.ink} strokeWidth={2.5} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── HERO ──
  hero: {
    paddingTop: 24, paddingBottom: 24, paddingHorizontal: 20,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 8, borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroInitials: { fontFamily: Fonts.display, fontSize: 22, letterSpacing: -0.4 },
  previewChip: {
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  previewChipText: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.3 },
  heroVibe: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5, marginTop: 16 },
  heroName: { fontFamily: Fonts.display, fontSize: 28, letterSpacing: -0.6, marginTop: 4 },
  heroEra: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.3, marginTop: 4 },
  quoteDivider: { height: 1, marginVertical: 16 },
  heroQuote: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },

  // ── TODAY CTA ──
  todayCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 16, padding: 16,
    backgroundColor: Colors.surface, borderRadius: 6,
    borderLeftWidth: 3,
  },
  todayWorkoutName: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, marginTop: 4, letterSpacing: -0.4 },
  todayMeta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 6, letterSpacing: 0.1 },
  todayBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── SECTIONS ──
  section: {
    marginHorizontal: 16, marginTop: 20, padding: 16,
    backgroundColor: Colors.surface, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionLabel: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.2 },
  miniLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2, marginBottom: 6, marginTop: 4 },

  philosophySig: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, marginTop: 8, marginBottom: 14, lineHeight: 20, fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', gap: 9, paddingVertical: 4, alignItems: 'center' },
  bulletText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 19 },

  signatureSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 6, marginBottom: 10, lineHeight: 17 },
  signatureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signatureChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 3, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  signatureChipText: { fontFamily: Fonts.bodySemi, fontSize: 12 },

  nutritionHeadline: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, marginTop: 8, lineHeight: 22, letterSpacing: -0.3 },
  nutritionStyle: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },

  macroRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  macroBox: {
    flex: 1, padding: 10, borderRadius: 4,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  macroNum: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text },
  macroLabel: { fontFamily: Fonts.bodyMedium, fontSize: 10, color: Colors.textTertiary, letterSpacing: 0.2, marginTop: 3 },

  foodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foodChip: {
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 3,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  foodChipText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.text },

  cuttingText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.text, lineHeight: 18 },

  // ── COACH SWITCHER ──
  coachSwitchRow: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'space-between' },
  coachAvatarBtn: {
    flex: 1, aspectRatio: 1, borderRadius: 8, borderWidth: 2,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  coachAvatarBtnText: { fontFamily: Fonts.display, fontSize: 14 },
  userMarker: {
    position: 'absolute', top: 4, right: 4,
    width: 5, height: 5, borderRadius: 3,
  },

  // ── CHAT ──
  chatPrompt: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 8, marginBottom: 12, lineHeight: 19 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1,
  },
  quickChipText: { fontFamily: Fonts.bodySemi, fontSize: 11 },

  bubble: { gap: 3, marginTop: 10 },
  bubbleUser: { alignItems: 'flex-end' },
  bubbleCoach: { alignItems: 'flex-start' },
  bubbleSender: { fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 0.2 },
  bubbleContent: { maxWidth: '85%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 4 },
  bubbleContentCoach: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  bubbleText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 19 },
  typingDots: { flexDirection: 'row', gap: 4, padding: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // ── INPUT BAR (fixed bottom) ──
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    backgroundColor: Colors.surface, borderRadius: 21,
    paddingHorizontal: 15, paddingVertical: 10,
    fontFamily: Fonts.body, fontSize: 13, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
});
