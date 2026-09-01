/**
 * Coach Hub — Bold Canvas
 *
 * The coach's "office" — where you visit your trainer.
 * A dark Crown carries the identity (vibe word, name, era pills, today's quote)
 * and the light body below holds the detail:
 *   • Today's session CTA (deep-links into workout-lobby)
 *   • Training philosophy (focus on / avoid)
 *   • Signature lifts · Nutrition approach
 *   • Coach switcher — persists profiles.selected_program, re-themes the app
 *   • Inline chat with a typing indicator while a reply is in flight
 *
 * Picking a different coach changes everything — colors, copy, exercises, food.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, StyleSheet,
  KeyboardAvoidingView, Keyboard, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Check, X as XIcon, Play, ArrowUp } from 'lucide-react-native';
import { aiCoachChat } from '@/lib/api/edgeFunctions';
import type { ClaudeMessage } from '@/lib/api/types';
import { useAuthStore } from '@/stores/authStore';
import { useProgramSchedule } from '@/hooks/useDashboardStats';
import { supabase } from '@/lib/supabase';
import {
  personaFromProgramId, personaAccent, quoteOfTheDay, styleText, getPersona, type PersonaId,
} from '@/lib/personaTheme';
import {
  BigStat, Crown, CrownSlot, ListRow, Section, StatRow, TAB_BAR_SPACE, useCrownStatusBar,
} from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles } from '@/lib/theme';
import { track } from '@/lib/analytics';

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

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator — three dots that breathe, never a spinner.
// One component per dot so each can hold its own shared value and stagger.
// ─────────────────────────────────────────────────────────────────────────────

function TypingDot({ color, index }: { color: string; index: number }) {
  const reduced = useReducedMotion();
  // Reduce-motion mounts settled at full opacity rather than at the trough,
  // otherwise the static dots would sit at 35% and read as disabled.
  const p = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(
      index * 140,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 440, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [p, index, reduced]);

  const anim = useAnimatedStyle(() => ({
    opacity: 0.35 + p.value * 0.65,
    transform: [{ translateY: p.value * -3 }],
  }));

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, anim]}
    />
  );
}

function TypingDots({ color }: { color: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Coach is typing"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      {[0, 1, 2].map((i) => (
        <TypingDot key={i} color={color} index={i} />
      ))}
    </View>
  );
}

export default function CoachHub() {
  const router = useRouter();
  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  // This screen owns its scroller (the composer has to stay pinned under it), so
  // it also owns the crown's status-bar contract that CanvasScreen would
  // otherwise handle — without it the bar keeps white icons after the dark crown
  // has scrolled off and the light body is behind the clock.
  const crownBar = useCrownStatusBar();

  // The tab bar is a floating pill that reserves no layout space, so the input
  // bar has to lift over it — but the bar hides on keyboard, and holding that
  // gap open would leave the composer floating above the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const styles = useThemedStyles((t) => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    scrollContent: { paddingBottom: 24 },
    gutter: { paddingHorizontal: 22 },

    // ── CROWN EXTRAS ──
    crownAvatar: {
      width: 54, height: 54, borderRadius: 20, borderWidth: 1,
      borderColor: t.crownLine, backgroundColor: t.crownLine,
      alignItems: 'center', justifyContent: 'center',
    },
    crownInitials: {
      fontFamily: Fonts.displayBold, fontSize: 17, letterSpacing: -0.7, color: t.crownText,
    },
    quoteRule: { height: 1, backgroundColor: t.crownLine, marginTop: 24 },
    quote: {
      fontFamily: Fonts.body, fontSize: 15, lineHeight: 24, fontStyle: 'italic',
      color: t.crownText, marginTop: 18,
    },

    // ── TODAY ──
    today: {
      flexDirection: 'row', alignItems: 'center', gap: 18,
      marginHorizontal: 22, marginTop: 26, padding: 22,
      borderRadius: 26, backgroundColor: t.surfaceAlt,
    },
    todayEyebrow: {
      fontFamily: Fonts.legacyMono, fontSize: 9, letterSpacing: 1.7,
      textTransform: 'uppercase', color: t.textTertiary,
    },
    todayName: {
      fontFamily: Fonts.displayBold, fontSize: 30, lineHeight: 33,
      letterSpacing: -1.35, color: t.text, marginTop: 10,
    },
    todayMeta: {
      fontFamily: Fonts.body, fontSize: 13, lineHeight: 19, color: t.textSecondary, marginTop: 8,
    },
    todayBtn: {
      width: 58, height: 58, borderRadius: 29, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },

    // ── BODY COPY ──
    statement: {
      fontFamily: Fonts.displayMedium, fontSize: 18, lineHeight: 26,
      letterSpacing: -0.4, color: t.text,
    },
    lede: {
      fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 21, color: t.textSecondary,
    },
    miniLabel: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.3,
      textTransform: 'uppercase', marginBottom: 8,
    },
    bulletRow: { flexDirection: 'row', gap: 11, paddingVertical: 5, alignItems: 'flex-start' },
    bulletText: {
      flex: 1, fontFamily: Fonts.body, fontSize: 14, lineHeight: 21, color: t.text,
    },

    // ── CHIPS ──
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: t.surfaceAlt },
    chipText: { fontFamily: Fonts.bodyMedium, fontSize: 12.5, color: t.textSecondary },

    // ── COACH SWITCHER ──
    switchRow: { flexDirection: 'row', gap: 9 },
    switchTile: {
      flex: 1, height: 64, borderRadius: 22, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    switchInitials: { fontFamily: Fonts.displayBold, fontSize: 15, letterSpacing: -0.5 },
    switchMarker: { position: 'absolute', top: 9, right: 9, width: 5, height: 5, borderRadius: 3 },

    // ── CHAT ──
    bubbleWrap: { marginTop: 18, gap: 6, maxWidth: '86%' },
    bubbleWrapUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    bubbleWrapCoach: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubbleSender: {
      fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.3, textTransform: 'uppercase',
    },
    bubble: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 22 },
    bubbleUser: { backgroundColor: t.surfaceAlt, borderBottomRightRadius: 7 },
    bubbleCoach: { borderBottomLeftRadius: 7 },
    bubbleText: { fontFamily: Fonts.body, fontSize: 14.5, lineHeight: 22, color: t.text },

    // ── INPUT BAR ──
    inputRule: { height: 1, backgroundColor: t.border },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      paddingHorizontal: 18, paddingTop: 12,
      backgroundColor: t.bg,
    },
    input: {
      flex: 1, minHeight: 48, maxHeight: 124,
      backgroundColor: t.surfaceAlt, borderRadius: 24,
      paddingHorizontal: 18, paddingVertical: 13,
      fontFamily: Fonts.body, fontSize: 14.5, color: t.text,
    },
    sendBtn: {
      width: 48, height: 48, borderRadius: 24, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
  }));

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
  const pa = personaAccent(persona, scheme);
  // The crown is a dark block in BOTH schemes, so it always takes the persona's
  // dark-tuned accent — the light accents fall under AA on near-black.
  const crownTint = personaAccent(persona, 'dark').accent;

  const todayQuote = quoteOfTheDay(persona);
  const todaySchedule = schedule.find((d) => d.isToday);
  const todayWorkoutName = todaySchedule?.isRest ? 'REST DAY' : (todaySchedule?.name ?? 'Today');
  const todayWorkout = todaySchedule?.workout;

  // "The Monument" → title "The", accent line "Monument". Every persona name is
  // multi-word today; the guard keeps a single-word name from losing its title.
  const displayName = styleText(persona, persona.fullName);
  const nameParts = displayName.split(' ');
  const crownTitle = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : displayName;
  const crownAccentLine = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;
  const eraPills = persona.era.split('·').map((s) => s.trim()).filter(Boolean);

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
      // persona is an enum slug; the message itself is never sent to analytics.
      track('coach_message_sent', { persona: persona.id });
      const { reply } = await aiCoachChat(persona.id, trimmed, history);
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply }]);
    } catch (e: any) {
      // Show the real reason so the failure is diagnosable: "HTTP 401" = Anthropic
      // key bad/missing, "HTTP 429" = credits/rate limit, "HTTP 404" = model.
      const why = e?.message ? ` (${String(e.message).slice(0, 90)})` : '';
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: `Connection issue — try again in a moment.${why}`,
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
    if (!profile?.id) {
      Alert.alert('Not signed in', 'Log out and back in, then try switching again.');
      return;
    }
    setSwitching(id);
    const programId = PROGRAM_FOR_PERSONA[id];

    // Try UPDATE first. If no row exists (e.g. account created via Supabase
    // dashboard with no profile trigger), fall back to UPSERT so the user
    // isn't stuck — the row gets created with sensible defaults.
    const { data: updated, error: updErr } = await (supabase.from('profiles') as any)
      .update({ selected_program: programId })
      .eq('id', profile.id)
      .select('id');

    if (updErr) {
      Alert.alert("Couldn't switch coach", `${updErr.message ?? updErr}`);
      setSwitching(null);
      return;
    }

    // No row matched → INSERT a fresh profile so subsequent updates work
    if (!updated || updated.length === 0) {
      const { error: insErr } = await (supabase.from('profiles') as any)
        .upsert({
          id: profile.id,
          selected_program: programId,
          goal: 'build_muscle',
          activity_level: 'moderately_active',
          onboarding_complete: false,
        }, { onConflict: 'id' });
      if (insErr) {
        Alert.alert("Couldn't create profile", `${insErr.message ?? insErr}`);
        setSwitching(null);
        return;
      }
    }

    setMessages([]); // fresh conversation with new coach
    await fetchProfile(profile.id);
    setSwitching(null);
  };

  const startTodaysWorkout = () => {
    // Route through the workout-picker so the user can swap day on the fly
    // (e.g. today is Push but they want Pull instead).
    router.push('/workout-picker' as any);
  };

  const isRest = Boolean(todaySchedule?.isRest);
  const todayBody = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={styles.todayEyebrow}>Today</Text>
        <Text style={styles.todayName}>{todayWorkoutName}</Text>
        <Text style={styles.todayMeta}>
          {isRest
            ? 'Rest day — recovery is when you grow.'
            : `${todayWorkout?.exercises.length ?? 0} lifts · ${todayWorkout?.estimatedMinutes ?? 60} min`}
        </Text>
      </View>
      {!isRest && (
        <View style={[styles.todayBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}>
          <Play size={20} color={pa.ink} fill={pa.ink} />
        </View>
      )}
    </>
  );

  return (
    <CrownSlot value={crownBar.registerCrown}>
      <View style={styles.root}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {crownBar.statusBar}
          <ScrollView
            ref={chatRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            onScroll={crownBar.onScroll}
            scrollEventThrottle={32}
          >
            {/* ── CROWN ── full-bleed coach identity ───────────────────────── */}
            <Crown
              eyebrow={styleText(persona, persona.vibe)}
              title={crownTitle}
              accentLine={crownAccentLine}
              pills={eraPills}
              accent={crownTint}
              right={
                <View style={styles.crownAvatar}>
                  <Text style={styles.crownInitials}>{persona.initials}</Text>
                </View>
              }
            >
              <View style={styles.quoteRule} />
              <Text style={styles.quote}>{`“${todayQuote}”`}</Text>
            </Crown>

            {/* ── TODAY'S SESSION CTA ───────────────────────────────────── */}
            {isRest ? (
              // Rest day is not a tap target — rendered flat so it keeps full
              // contrast instead of the pressable's disabled dimming.
              <View style={styles.today}>{todayBody}</View>
            ) : (
              <PressableScale
                style={styles.today}
                onPress={startTodaysWorkout}
                haptic="heavy"
                accessibilityRole="button"
                accessibilityLabel={`Start ${todayWorkoutName}`}
              >
                {todayBody}
              </PressableScale>
            )}

            <View style={styles.gutter}>
              {/* ── PHILOSOPHY ──────────────────────────────────────────── */}
              <Section label="Training philosophy">
                <Text style={styles.statement}>{persona.training.signature}</Text>

                <Text style={[styles.miniLabel, { color: pa.accentText, marginTop: 22 }]}>Focus on</Text>
                {persona.training.focusOn.map((f, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Check size={17} color={pa.accentText} strokeWidth={2.6} />
                    <Text style={styles.bulletText}>{f}</Text>
                  </View>
                ))}

                <Text style={[styles.miniLabel, { color: tokens.danger, marginTop: 20 }]}>Never</Text>
                {persona.training.avoid.map((a, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <XIcon size={17} color={tokens.danger} strokeWidth={2.6} />
                    <Text style={styles.bulletText}>{a}</Text>
                  </View>
                ))}
              </Section>

              {/* ── SIGNATURE LIFTS ─────────────────────────────────────── */}
              <Section label="Signature lifts">
                <Text style={[styles.lede, { marginBottom: 6 }]}>
                  The exercises that define {persona.shortName}'s training.
                </Text>
                {persona.training.signatureLifts.map((lift, i, arr) => (
                  <ListRow
                    key={i}
                    title={lift}
                    value={String(i + 1).padStart(2, '0')}
                    last={i === arr.length - 1}
                  />
                ))}
              </Section>

              {/* ── NUTRITION APPROACH ──────────────────────────────────── */}
              <Section label="Nutrition approach">
                <Text style={styles.statement}>{styleText(persona, persona.nutrition.headline)}</Text>
                <Text style={[styles.lede, { marginTop: 10 }]}>{persona.nutrition.style}</Text>

                {/* The macro split is NOT a third column. "30/45/25" is eight
                    glyphs — ~106pt at 27px — and a third-width cell on a 360dp
                    screen is 96pt, so BigStat's numberOfLines={1} clipped it to
                    "30/45/2…". It gets the full column width on its own line
                    instead, which also lets all three numerals share one size. */}
                <StatRow style={{ marginTop: 26 }}>
                  <BigStat value={persona.nutrition.mealsPerDay} label="Meals / day" size={30} />
                  <BigStat
                    value={persona.nutrition.proteinPerKg}
                    unit="g"
                    decimals={1}
                    label="Protein / kg"
                    size={30}
                  />
                </StatRow>
                <BigStat
                  style={{ marginTop: 26 }}
                  value={`${persona.nutrition.macroSplit.protein}/${persona.nutrition.macroSplit.carbs}/${persona.nutrition.macroSplit.fat}`}
                  label="Protein / carbs / fat · % of calories"
                  size={30}
                />

                <Text style={[styles.miniLabel, { color: tokens.textTertiary, marginTop: 30 }]}>
                  Signature foods
                </Text>
                <View style={styles.chipWrap}>
                  {persona.nutrition.signatureFoods.map((food, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{food}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.miniLabel, { color: tokens.textTertiary, marginTop: 26 }]}>
                  Cutting approach
                </Text>
                <Text style={styles.lede}>{persona.nutrition.cuttingApproach}</Text>
              </Section>

              {/* ── COACH SWITCHER ──────────────────────────────────────── */}
              <Section label="Explore other coaches">
                <Text style={[styles.lede, { marginBottom: 16 }]}>
                  Tap any coach to switch — the whole app re-themes around their world.
                </Text>
                <View style={styles.switchRow}>
                  {PERSONA_ORDER.map((id) => {
                    const p = getPersona(id);
                    const pAccent = personaAccent(p, scheme);
                    const active = id === selectedId;
                    const isUserId = id === persona.id;
                    return (
                      <PressableScale
                        key={id}
                        style={[
                          styles.switchTile,
                          {
                            backgroundColor: active ? pAccent.accent : tokens.surfaceAlt,
                            borderColor: active ? pAccent.accentText : 'transparent',
                          },
                        ]}
                        onPress={() => switchTo(id)}
                        haptic="light"
                        scaleTo={0.95}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active, busy: switching === id }}
                        accessibilityLabel={`Switch to ${p.fullName}`}
                      >
                        {switching === id ? (
                          // switchTo() already no-ops while a switch is in flight,
                          // so the tiles stay undimmed and only the target shows work.
                          <Skeleton width="100%" height={62} radius={21} />
                        ) : (
                          <>
                            <Text style={[
                              styles.switchInitials,
                              { color: active ? pAccent.ink : pAccent.accentText },
                            ]}>
                              {p.initials}
                            </Text>
                            {isUserId && (
                              <View style={[styles.switchMarker, { backgroundColor: pAccent.ink }]} />
                            )}
                          </>
                        )}
                      </PressableScale>
                    );
                  })}
                </View>
              </Section>

              {/* ── CHAT ──────────────────────────────────────────────── */}
              <Section label={`Chat with ${persona.shortName}`} style={{ paddingBottom: 8 }}>
                {messages.length === 0 ? (
                  <View>
                    <Text style={[styles.lede, { marginBottom: 16 }]}>
                      Ask {persona.shortName} anything — training, nutrition, mindset.
                    </Text>
                    <View style={styles.chipWrap}>
                      {QUICK_PROMPTS.map((q) => (
                        <PressableScale
                          key={q}
                          style={[styles.chip, { backgroundColor: pa.accentSoft }]}
                          onPress={() => sendMessage(q)}
                          haptic="light"
                          scaleTo={0.96}
                          accessibilityRole="button"
                          accessibilityLabel={q}
                        >
                          <Text style={[styles.chipText, { color: pa.accentText }]}>{q}</Text>
                        </PressableScale>
                      ))}
                    </View>
                  </View>
                ) : (
                  messages.map((msg) => {
                    const mine = msg.role === 'user';
                    return (
                      <View
                        key={msg.id}
                        style={[styles.bubbleWrap, mine ? styles.bubbleWrapUser : styles.bubbleWrapCoach]}
                      >
                        {!mine && (
                          <Text style={[styles.bubbleSender, { color: pa.accentText }]}>
                            {persona.shortName}
                          </Text>
                        )}
                        <View style={[
                          styles.bubble,
                          mine ? styles.bubbleUser : [styles.bubbleCoach, { backgroundColor: pa.accentSoft }],
                        ]}>
                          <Text style={styles.bubbleText}>{msg.content}</Text>
                        </View>
                      </View>
                    );
                  })
                )}

                {chatLoading && (
                  <View style={[styles.bubbleWrap, styles.bubbleWrapCoach]}>
                    <Text style={[styles.bubbleSender, { color: pa.accentText }]}>{persona.shortName}</Text>
                    <View style={[styles.bubble, styles.bubbleCoach, { backgroundColor: pa.accentSoft }]}>
                      <TypingDots color={pa.accentText} />
                    </View>
                  </View>
                )}
              </Section>
            </View>
          </ScrollView>

          {/* ── INPUT BAR (always visible) ─────────────────────────────── */}
          <View style={styles.inputRule} />
          <View
            style={[
              styles.inputBar,
              // 8px of air between the composer and the top of the floating pill;
              // with the keyboard up the pill is gone, so the bar sits on the keys.
              { paddingBottom: keyboardUp ? 14 : insets.bottom + TAB_BAR_SPACE - 8 },
            ]}
          >
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={`Ask ${persona.shortName} anything…`}
              placeholderTextColor={tokens.textTertiary}
              multiline
              maxLength={500}
              keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
            />
            <PressableScale
              // PressableScale dims itself while disabled, so the button needs no
              // separate disabled style — one source of truth for that state.
              style={[styles.sendBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || chatLoading}
              haptic="medium"
              accessibilityRole="button"
              accessibilityLabel={`Send message to ${persona.shortName}`}
            >
              {chatLoading
                ? <TypingDots color={pa.ink} />
                : <ArrowUp size={21} color={pa.ink} strokeWidth={2.6} />
              }
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </View>
    </CrownSlot>
  );
}
