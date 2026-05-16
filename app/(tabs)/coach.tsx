import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { aiCoachChat } from '@/lib/api/edgeFunctions';
import type { ClaudeMessage } from '@/lib/api/types';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

interface Persona {
  id: string;
  name: string;
  full: string;
  tag: string;
  hue: string;
  initials: string;
}

const PERSONAS: Persona[] = [
  { id: 'cbum',       name: 'CBUM',    full: 'Chris Bumstead',   tag: 'Classic Physique · 5× Mr O',      hue: '#dfff1f', initials: 'CB' },
  { id: 'arnold',     name: 'ARNOLD',  full: 'Arnold S.',        tag: 'Golden Era · 7× Mr Olympia',      hue: '#f5b942', initials: 'AR' },
  { id: 'nippard',    name: 'NIPPARD', full: 'Jeff Nippard',     tag: 'Evidence-based · MSc',             hue: '#5b8cff', initials: 'JN' },
  { id: 'ct_fletcher',name: 'CT',      full: 'CT Fletcher',      tag: 'Iron Addict · "I command you"',   hue: '#ff4d2e', initials: 'CT' },
  { id: 'dr_mike',    name: 'DR MIKE', full: 'Dr Mike Israetel', tag: 'RP Strength · PhD Sport Phys',    hue: '#00e0a4', initials: 'DM' },
];

const QUICK_PROMPTS = [
  'Analyze today',
  'Plan next session',
  'Form check',
  'Weekly review',
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  personaId?: string;
}

export default function Coach() {
  const [persona, setPersona] = useState<Persona>(PERSONAS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const getHistory = (): ClaudeMessage[] =>
    messages.map((m) => ({ role: m.role, content: m.content }));

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply } = await aiCoachChat(persona.id, trimmed, getHistory());
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, personaId: persona.id },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(), role: 'assistant', personaId: persona.id,
          content: "Connection issue — try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [persona, isLoading, messages]);

  const isCT = persona.id === 'ct_fletcher';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Coach header */}
      <View style={styles.coachHeader}>
        <View style={[styles.coachAvatar, { backgroundColor: persona.hue }]}>
          <Text style={styles.coachAvatarText}>{persona.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.coachNameRow}>
            <Text style={styles.coachName}>{persona.name}</Text>
            <View style={styles.onlineDot} />
          </View>
          <Text style={styles.coachTag}>{persona.tag}</Text>
        </View>
        {/* Persona selector chevron */}
        <TouchableOpacity style={styles.switchBtn}>
          <Text style={{ color: Colors.textSecondary, fontSize: 18 }}>⌄</Text>
        </TouchableOpacity>
      </View>

      {/* Persona chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chipBarContent}
      >
        {PERSONAS.map((p) => {
          const active = p.id === persona.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, active && { backgroundColor: p.hue }]}
              onPress={() => { setPersona(p); setMessages([]); }}
            >
              <Text style={[styles.chipText, active && { color: Colors.accentInk }]}>{p.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty state with quick prompts */}
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>ASK {persona.name}{'\n'}ANYTHING.</Text>
              <Text style={styles.emptySub}>{persona.full} · {persona.tag}</Text>
              <View style={styles.quickRow}>
                {QUICK_PROMPTS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.quickChip, { borderColor: persona.hue }]}
                    onPress={() => sendMessage(q)}
                  >
                    <Text style={[styles.quickChipText, { color: persona.hue }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleCoach]}
            >
              {msg.role === 'assistant' && (
                <Text style={[styles.bubbleSender, { color: persona.hue }]}>{persona.name}</Text>
              )}
              <View style={[
                styles.bubbleContent,
                msg.role === 'user'
                  ? [styles.bubbleContentUser, { backgroundColor: persona.hue }]
                  : styles.bubbleContentCoach,
              ]}>
                <Text style={[
                  styles.bubbleText,
                  msg.role === 'user' ? { color: Colors.accentInk } : { color: Colors.text },
                  isCT && msg.role === 'assistant' && styles.ctText,
                ]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <View style={styles.bubbleCoach}>
              <Text style={[styles.bubbleSender, { color: persona.hue }]}>{persona.name}</Text>
              <View style={styles.bubbleContentCoach}>
                <View style={styles.typingDots}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: persona.hue, opacity: 0.3 + i * 0.25 }]} />
                  ))}
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={`Ask ${persona.name} anything…`}
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={500}
            keyboardAppearance="dark"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: persona.hue }, (!input.trim() || isLoading) && styles.sendDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={Colors.accentInk} />
              : <Text style={[styles.sendArrow, { color: Colors.accentInk }]}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Coach header
  coachHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  coachAvatar: {
    width: 48, height: 48, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontFamily: Fonts.display, fontSize: 16, color: Colors.accentInk },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachName: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: -0.3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.good },
  coachTag: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, marginTop: 2, letterSpacing: 1 },
  switchBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },

  // Persona chips
  chipBar: { flexShrink: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  chipBarContent: { paddingHorizontal: 20, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16,
  },
  chipText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.textSecondary },

  // Messages
  messageList: { flex: 1 },
  messageContent: { padding: 20, gap: 10, paddingBottom: 24 },

  emptyState: { paddingTop: 32, paddingHorizontal: 4 },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 36, color: Colors.text, lineHeight: 34, letterSpacing: -0.8 },
  emptySub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 8, marginBottom: 24 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
  },
  quickChipText: { fontFamily: Fonts.bodySemi, fontSize: 12 },

  bubble: { gap: 4 },
  bubbleUser: { alignItems: 'flex-end' },
  bubbleCoach: { alignItems: 'flex-start' },
  bubbleSender: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4, marginBottom: 2, marginLeft: 2 },
  bubbleContent: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 4 },
  bubbleContentUser: {},
  bubbleContentCoach: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 4,
  },
  bubbleText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21 },
  ctText: { fontFamily: Fonts.bodySemi, letterSpacing: 0.1, textTransform: 'uppercase' },
  typingDots: { flexDirection: 'row', gap: 4, padding: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: Colors.surface, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: Fonts.body, fontSize: 13, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
  sendArrow: { fontSize: 20, fontFamily: Fonts.bodyBold },
});
