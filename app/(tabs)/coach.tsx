import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { aiCoachChat } from '@/lib/api/edgeFunctions';
import type { ClaudeMessage } from '@/lib/api/types';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

interface Persona {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  color: string;
}

const PERSONAS: Persona[] = [
  { id: 'arnold', name: 'Arnold', emoji: '🏆', tagline: '7x Mr. Olympia', color: '#1a1a2e' },
  { id: 'cbum', name: 'CBum', emoji: '⭐', tagline: '5x Classic O', color: '#7c3aed' },
  { id: 'nippard', name: 'Nippard', emoji: '🔬', tagline: 'Evidence-Based', color: '#0369a1' },
  { id: 'ct_fletcher', name: 'CT Fletcher', emoji: '💥', tagline: 'ISYMFS', color: '#991b1b' },
  { id: 'dr_mike', name: 'Dr. Mike', emoji: '📊', tagline: 'RP Method', color: '#065f46' },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  personaId?: string;
}

const QUICK_PROMPTS = [
  "What should I eat before a workout?",
  "How do I break through a plateau?",
  "How much protein do I actually need?",
  "How do I improve my squat depth?",
];

export default function Coach() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
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

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply } = await aiCoachChat(selectedPersona.id, trimmed, getHistory());
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        personaId: selectedPersona.id,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "Sorry, I couldn't connect right now. Check your connection and try again.",
          personaId: selectedPersona.id,
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [selectedPersona, isLoading, messages]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Persona selector */}
      <View style={styles.personaBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaScroll}>
          {PERSONAS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.personaChip,
                { borderColor: p.color },
                selectedPersona.id === p.id && { backgroundColor: p.color },
              ]}
              onPress={() => setSelectedPersona(p)}
            >
              <Text style={styles.personaEmoji}>{p.emoji}</Text>
              <Text style={[styles.personaName, selectedPersona.id === p.id && styles.personaNameActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Active persona header */}
      <View style={[styles.personaHeader, { backgroundColor: selectedPersona.color }]}>
        <Text style={styles.personaHeaderEmoji}>{selectedPersona.emoji}</Text>
        <View>
          <Text style={styles.personaHeaderName}>{selectedPersona.name}</Text>
          <Text style={styles.personaHeaderTagline}>{selectedPersona.tagline}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>{selectedPersona.emoji}</Text>
              <Text style={styles.emptyTitle}>Ask {selectedPersona.name} anything</Text>
              <Text style={styles.emptySubtitle}>Training, nutrition, recovery, mindset</Text>
              <View style={styles.quickPrompts}>
                {QUICK_PROMPTS.map((q) => (
                  <TouchableOpacity key={q} style={styles.quickPrompt} onPress={() => sendMessage(q)}>
                    <Text style={styles.quickPromptText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
            >
              {msg.role === 'assistant' && (
                <Text style={styles.bubblePersonaEmoji}>
                  {PERSONAS.find((p) => p.id === msg.personaId)?.emoji ?? '🤖'}
                </Text>
              )}
              <View style={[
                styles.bubbleContent,
                msg.role === 'user'
                  ? styles.bubbleContentUser
                  : [styles.bubbleContentAssistant, { borderLeftColor: selectedPersona.color }],
              ]}>
                <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextUser]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          ))}

          {isLoading && (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <Text style={styles.bubblePersonaEmoji}>{selectedPersona.emoji}</Text>
              <View style={[styles.bubbleContent, styles.bubbleContentAssistant, { borderLeftColor: selectedPersona.color }]}>
                <ActivityIndicator size="small" color={Colors.textSecondary} />
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
            placeholder={`Ask ${selectedPersona.name}…`}
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: selectedPersona.color },
              (!input.trim() || isLoading) && styles.sendBtnDisabled,
            ]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  personaBar: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  personaScroll: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 8, flexDirection: 'row' },
  personaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
  },
  personaEmoji: { fontSize: 14 },
  personaName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  personaNameActive: { color: '#fff' },
  personaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  personaHeaderEmoji: { fontSize: 28 },
  personaHeaderName: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  personaHeaderTagline: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)' },
  messageList: { flex: 1 },
  messageContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.lg },
  emptyState: { alignItems: 'center', paddingTop: Spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: Spacing.sm },
  emptyTitle: { ...Typography.h3, marginBottom: 4 },
  emptySubtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.lg },
  quickPrompts: { width: '100%', gap: 8 },
  quickPrompt: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickPromptText: { ...Typography.body, color: Colors.text },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAssistant: { justifyContent: 'flex-start' },
  bubblePersonaEmoji: { fontSize: 22, marginBottom: 2 },
  bubbleContent: { maxWidth: '78%', padding: Spacing.sm, borderRadius: Radius.md },
  bubbleContentUser: { backgroundColor: Colors.primary },
  bubbleContentAssistant: {
    backgroundColor: Colors.surface, borderLeftWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  bubbleText: { ...Typography.body, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: Colors.background, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' },
});
