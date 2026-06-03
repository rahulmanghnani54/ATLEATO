/**
 * Friend Scoreboard — loss-framed social accountability (MVP)
 *
 * Shows weekly workout counts for manually-added friends.
 * No contacts access — friends join by referral code.
 * All friend data is simulated (generated deterministically from their code).
 * Weekly reset every Monday.
 *
 * Loss-framing header: "3 friends trained today. You're behind."
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  addFriend, removeFriend, getFriends, getScoreboardMessage,
  type Friend,
} from '@/lib/friendScoreboard';
import { useTrainedToday } from '@/hooks/useTrainedToday';

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd');

function trainedToday(friend: Friend): boolean {
  return friend.lastTrained === TODAY_ISO;
}

// ─── Row component ────────────────────────────────────────────────────────────

function FriendRow({
  friend, rank, accent, onRemove,
}: { friend: Friend; rank: number; accent: string; onRemove: () => void }) {
  const trained = trainedToday(friend);
  return (
    <View style={rowStyles.wrap}>
      <Text style={[rowStyles.rank, { color: rank <= 3 ? accent : Colors.textTertiary }]}>
        #{rank}
      </Text>
      <View style={rowStyles.info}>
        <View style={rowStyles.nameRow}>
          <Text style={rowStyles.name}>{friend.name}</Text>
          {trained && (
            <View style={[rowStyles.trainedBadge, { backgroundColor: accent + '22' }]}>
              <Text style={[rowStyles.trainedText, { color: accent }]}>trained today</Text>
            </View>
          )}
        </View>
        <Text style={rowStyles.meta}>
          {friend.workoutsThisWeek} workouts this week · {friend.streak}🔥
        </Text>
      </View>
      <TouchableOpacity onPress={onRemove} style={rowStyles.removeBtn} hitSlop={8}>
        <Text style={rowStyles.removeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rank: { fontFamily: Fonts.display, fontSize: 14, width: 30, textAlign: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { fontFamily: Fonts.bodySemi, fontSize: 15, color: Colors.text },
  trainedBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  trainedText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  meta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary },
  removeBtn: { padding: 4 },
  removeText: { fontSize: 14, color: Colors.textTertiary },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FriendScoreboardScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: userTrainedToday = false } = useTrainedToday();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);

  const loadFriends = useCallback(async () => {
    const f = await getFriends();
    // Sort by workoutsThisWeek desc, then streak desc
    f.sort((a, b) =>
      b.workoutsThisWeek !== a.workoutsThisWeek
        ? b.workoutsThisWeek - a.workoutsThisWeek
        : b.streak - a.streak,
    );
    setFriends(f);
  }, []);

  useEffect(() => {
    loadFriends().then(() => setLoaded(true));
  }, [loadFriends]);

  const handleAdd = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      Alert.alert('Invalid code', 'Enter a valid referral code (at least 4 characters).');
      return;
    }
    setAdding(true);
    try {
      const friend = await addFriend(trimmed);
      if (!friend) {
        Alert.alert('Already added', 'A friend with that code is already in your scoreboard.');
        return;
      }
      setCode('');
      await loadFriends();
    } finally {
      setAdding(false);
    }
  }, [code, loadFriends]);

  const handleRemove = useCallback((id: string, name: string) => {
    Alert.alert(
      `Remove ${name}?`,
      'They will be removed from your scoreboard.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await removeFriend(id);
            await loadFriends();
          },
        },
      ],
    );
  }, [loadFriends]);

  if (!loaded) return null;

  const trainedFriendCount = friends.filter(trainedToday).length;
  const headerMsg = getScoreboardMessage(userTrainedToday, trainedFriendCount);

  // User's simulated rank — their workoutsThisWeek from useSessionsThisWeek
  // For MVP we just show the board without inserting the user row inline.

  const isLosing = !userTrainedToday && trainedFriendCount > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FRIEND SCOREBOARD</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Loss-framed header */}
        <View style={[
          styles.heroCard,
          { backgroundColor: isLosing ? Colors.error + '1a' : persona.accent + '1a',
            borderColor: isLosing ? Colors.error + '55' : persona.accent + '55' },
        ]}>
          <Text style={[
            styles.heroEmoji,
          ]}>{isLosing ? '😤' : '💪'}</Text>
          <Text style={[
            styles.heroMsg,
            { color: isLosing ? Colors.error : persona.accent },
          ]}>
            {headerMsg}
          </Text>
          <Text style={styles.heroSub}>
            Weekly reset every Monday · {format(new Date(), 'EEEE, MMM d')}
          </Text>
        </View>

        {/* Add friend */}
        <View style={styles.addSection}>
          <Text style={styles.sectionLabel}>ADD A FRIEND BY CODE</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. ALEX42"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="characters"
              maxLength={12}
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: persona.accent }, adding && { opacity: 0.5 }]}
              onPress={handleAdd}
              disabled={adding}
              activeOpacity={0.85}
            >
              <Text style={[styles.addBtnText, { color: persona.ink }]}>
                {adding ? '…' : 'ADD'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.addHelper}>
            Share your own code with friends: {((profile as any)?.username ?? profile?.full_name?.slice(0, 6) ?? 'YOURCODE').toUpperCase()}
          </Text>
        </View>

        {/* Scoreboard */}
        {friends.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySub}>
              Add friends by their referral code. Once added, you'll see how your
              weekly workouts stack up — and feel the pressure when they're ahead.
            </Text>
          </View>
        ) : (
          <View style={styles.boardCard}>
            <Text style={styles.sectionLabel}>THIS WEEK'S BOARD</Text>
            {friends.map((f, i) => (
              <FriendRow
                key={f.id}
                friend={f}
                rank={i + 1}
                accent={persona.accent}
                onRemove={() => handleRemove(f.id, f.name)}
              />
            ))}
          </View>
        )}

        {/* How it works */}
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>HOW IT WORKS</Text>
          <Text style={styles.howBody}>
            Friends are added by code — no contacts access needed.
            Workout counts reset every Monday. The board is updated whenever
            your friends log a session.{'\n\n'}
            MVP note: friend data is simulated from their code for now.
            Full sync coming in a future update.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 0.4 },

  scroll: { padding: Spacing.md, paddingBottom: 48 },

  heroCard: {
    borderRadius: 10, padding: 20, marginBottom: 20,
    borderWidth: 1, alignItems: 'center',
  },
  heroEmoji: { fontSize: 36, marginBottom: 8 },
  heroMsg: {
    fontFamily: Fonts.display, fontSize: 18, letterSpacing: -0.3,
    textAlign: 'center', lineHeight: 24, marginBottom: 8,
  },
  heroSub: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 0.8, textAlign: 'center',
  },

  addSection: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.6, marginBottom: 10,
  },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  input: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.mono, fontSize: 14, color: Colors.text, letterSpacing: 1.2,
  },
  addBtn: {
    paddingHorizontal: 18, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 0.8 },
  addHelper: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 0.6, fontStyle: 'italic',
  },

  boardCard: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 16, marginBottom: 16,
  },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    letterSpacing: -0.2, marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 19,
  },

  howCard: {
    backgroundColor: Colors.raised, borderRadius: 8, padding: 16,
  },
  howTitle: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.6, marginBottom: 8,
  },
  howBody: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, lineHeight: 20,
  },
});
