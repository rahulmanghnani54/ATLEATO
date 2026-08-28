/**
 * Friend Scoreboard — neutral/encouraging social accountability (MVP)
 *
 * V2 plan §1.2 (Reconcile dark patterns): refactored from the original
 * loss-framed copy ("you're behind by 2 sessions") to neutral/encouraging
 * framing. The goal is shared visibility + light positive nudges, not
 * guilt or pressure. Opt-in social-stake / charity-stake remain for
 * users who explicitly want commitment devices — those are legitimate.
 *
 * Shows weekly workout counts for manually-added friends.
 * No contacts access — friends join by referral code.
 * All friend data is simulated (generated deterministically from their code).
 * Weekly reset every Monday.
 *
 * Encouraging header: "3 friends trained today. Join them."
 *
 * Bold Canvas: the crown carries the encouraging message and the
 * trained-today count; the light body is a borderless ranked list where the
 * rank is the oversized numeral. The persona accent is spent on the ADD
 * control and the single live "trained today" signal — podium position is
 * shown by SIZE, not by a second colour.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles } from '@/lib/theme';
import {
  addFriend, removeFriend, getFriends, getScoreboardMessage,
  type Friend,
} from '@/lib/friendScoreboard';
import { useTrainedToday } from '@/hooks/useTrainedToday';

type PersonaAccent = ReturnType<typeof personaAccent>;
type ScoreboardStyles = ReturnType<typeof useScoreboardStyles>;

const TODAY_ISO = format(new Date(), 'yyyy-MM-dd');

function trainedToday(friend: Friend): boolean {
  return friend.lastTrained === TODAY_ISO;
}

// ─── Row component ────────────────────────────────────────────────────────────

function FriendRow({
  friend, rank, pa, dim, styles, onRemove,
}: {
  friend: Friend;
  rank: number;
  pa: PersonaAccent;
  dim: string;
  styles: ScoreboardStyles;
  onRemove: () => void;
}) {
  const trained = trainedToday(friend);
  // Podium is carried by the numeral's SIZE. The accent stays reserved for the
  // ADD control and the live trained-today signal.
  const podium = rank <= 3;

  return (
    <View style={styles.row}>
      <Text
        style={[styles.rankNum, podium ? styles.rankNumPodium : styles.rankNumRest]}
        numberOfLines={1}
      >
        {rank}
      </Text>

      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{friend.name}</Text>
          {trained && (
            <View style={[styles.trainedPill, { backgroundColor: pa.accentSoft }]}>
              <Text style={[styles.trainedText, { color: pa.accentText }]} numberOfLines={1}>
                TRAINED TODAY
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {friend.workoutsThisWeek} WORKOUTS THIS WEEK · {friend.streak}🔥
        </Text>
      </View>

      <PressableScale
        onPress={onRemove}
        haptic="light"
        scaleTo={0.9}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${friend.name}`}
        style={styles.removeBtn}
      >
        <X size={16} color={dim} />
      </PressableScale>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FriendScoreboardScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: userTrainedToday = false } = useTrainedToday();

  const { tokens, scheme } = useTheme();
  const styles = useScoreboardStyles();
  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so its tint always comes from the
  // dark triplet — the light-tuned persona accents go muddy against ink.
  const crownTint = personaAccent(persona, 'dark').accent;

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

  const trainedFriendCount = friends.filter(trainedToday).length;
  const headerMsg = getScoreboardMessage(userTrainedToday, trainedFriendCount);

  // User's simulated rank — their workoutsThisWeek from useSessionsThisWeek
  // For MVP we just show the board without inserting the user row inline.

  // V2 §1.2 — no more "isLosing" / red-pressure UI. Use neutral accent always.
  // The opt-in commitment devices (social-stake, charity-stake) provide
  // accountability without guilt-shaming the dashboard.
  const isLosing = false;
  const heroTint = isLosing ? tokens.danger : crownTint;

  const crown = (
    <Crown
      eyebrow={`${isLosing ? '😤' : '💪'}  Your circle · this week`}
      title={styleText(persona, 'Leaderboard')}
      meta={headerMsg}
      accent={heroTint}
      onBack={() => router.back()}
    >
      {loaded ? (
        <View style={styles.crownStats}>
          <View>
            <Text style={[styles.crownBig, { color: heroTint }]} numberOfLines={1}>
              {trainedFriendCount}
            </Text>
            <Text style={styles.crownLabel} numberOfLines={1}>TRAINED TODAY</Text>
          </View>
          <View style={styles.crownSide}>
            <Text style={styles.crownSideNum} numberOfLines={1}>{friends.length}</Text>
            <Text style={styles.crownLabel} numberOfLines={1}>IN YOUR CIRCLE</Text>
          </View>
        </View>
      ) : (
        <View style={styles.crownStats}>
          <View style={styles.crownSkel}>
            <Skeleton width={62} height={44} radius={10} />
            <Skeleton width={86} height={8} radius={4} />
          </View>
        </View>
      )}

      <Text style={styles.crownReset} numberOfLines={1}>
        Weekly reset every Monday · {format(new Date(), 'EEEE, MMM d')}
      </Text>
    </Crown>
  );

  if (!loaded) {
    return (
      <CanvasScreen tabBar={false} bottomSpace={28}>
        {crown}
        <View style={styles.gutter}>
          <Section label="This week's board">
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i}>
                <View style={styles.skelRow}>
                  <Skeleton width={34} height={28} radius={8} />
                  <View style={styles.skelText}>
                    <Skeleton width="56%" height={15} radius={6} />
                    <Skeleton width="38%" height={8} radius={4} />
                  </View>
                  <Skeleton width={16} height={16} radius={8} />
                </View>
                {i < 4 ? <Hairline /> : null}
              </View>
            ))}
          </Section>
        </View>
      </CanvasScreen>
    );
  }

  return (
    <CanvasScreen tabBar={false} bottomSpace={28}>
      {crown}

      <View style={styles.gutter}>
        {/* Add friend */}
        <Section label="Add a friend by code">
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. ALEX42"
              placeholderTextColor={tokens.textTertiary}
              autoCapitalize="characters"
              maxLength={12}
            />
            <PressableScale
              // A persona-tinted fill on a light page needs a boundary the same
              // way tokens.accentLine backs the emerald one; accentText is that tone.
              style={[styles.addBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
              onPress={handleAdd}
              disabled={adding}
              haptic="medium"
              accessibilityRole="button"
              accessibilityLabel="Add friend by referral code"
            >
              <Text style={[styles.addBtnText, { color: pa.ink }]}>
                {adding ? '…' : 'ADD'}
              </Text>
            </PressableScale>
          </View>
          <Text style={styles.addHelper}>
            Share your own code with friends: {((profile as any)?.username ?? profile?.full_name?.slice(0, 6) ?? 'YOURCODE').toUpperCase()}
          </Text>
        </Section>

        {/* Scoreboard */}
        {friends.length === 0 ? (
          <Section label="This week's board">
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySub}>
              Add friends by their referral code. Once added, you&apos;ll see how your
              weekly workouts compare — light, friendly accountability without the pressure.
            </Text>
          </Section>
        ) : (
          <Section
            label="This week's board"
            right={
              <Text style={styles.headHint}>
                {friends.length} {friends.length === 1 ? 'FRIEND' : 'FRIENDS'}
              </Text>
            }
          >
            {friends.map((f, i) => (
              <View key={f.id}>
                <FriendRow
                  friend={f}
                  rank={i + 1}
                  pa={pa}
                  dim={tokens.textTertiary}
                  styles={styles}
                  onRemove={() => handleRemove(f.id, f.name)}
                />
                {i < friends.length - 1 ? <Hairline /> : null}
              </View>
            ))}
          </Section>
        )}

        {/* How it works */}
        <Section label="How it works">
          <View style={styles.howPlate}>
            <Text style={styles.howBody}>
              Friends are added by code — no contacts access needed.
              Workout counts reset every Monday. The board is updated whenever
              your friends log a session.{'\n\n'}
              MVP note: friend data is simulated from their code for now.
              Full sync coming in a future update.
            </Text>
          </View>
        </Section>
      </View>
    </CanvasScreen>
  );
}

function useScoreboardStyles() {
  return useThemedStyles((t) =>
    StyleSheet.create({
      /** Matches Crown's own horizontal inset, so the body lines up with the hero. */
      gutter: { paddingHorizontal: 22 },

      // ── Crown hero ────────────────────────────────────────────────────────
      crownStats: { flexDirection: 'row', alignItems: 'flex-end', gap: 26, marginTop: 22 },
      crownBig: {
        fontFamily: Fonts.displayBold,
        fontSize: 52,
        lineHeight: 53,
        letterSpacing: -2.34,
        fontVariant: ['tabular-nums'],
      },
      crownSide: { paddingBottom: 7 },
      crownSideNum: {
        fontFamily: Fonts.displayMedium,
        fontSize: 21,
        letterSpacing: -0.63,
        color: t.crownText,
        fontVariant: ['tabular-nums'],
      },
      crownLabel: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: t.crownTextDim,
        marginTop: 3,
      },
      crownSkel: { gap: 9 },
      crownReset: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: t.crownTextDim,
        marginTop: 20,
      },

      // ── Add a friend ──────────────────────────────────────────────────────
      addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      input: {
        flex: 1,
        height: 54,
        backgroundColor: t.surfaceAlt,
        borderRadius: 27,
        paddingHorizontal: 20,
        fontFamily: Fonts.bodySemi,
        fontSize: 15,
        letterSpacing: 1.2,
        color: t.text,
      },
      addBtn: {
        height: 54,
        paddingHorizontal: 24,
        borderRadius: 27,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      },
      addBtnText: {
        fontFamily: Fonts.legacyMono,
        fontSize: 10,
        letterSpacing: 1.8,
      },
      addHelper: {
        fontFamily: Fonts.legacyMono,
        fontSize: 9,
        letterSpacing: 0.6,
        color: t.textTertiary,
        marginTop: 12,
      },

      // ── Rows ──────────────────────────────────────────────────────────────
      headHint: {
        fontFamily: Fonts.legacyMono,
        fontSize: 9,
        letterSpacing: 1.7,
        textTransform: 'uppercase',
        color: t.textTertiary,
      },
      row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
      rankNum: {
        fontFamily: Fonts.displayBold,
        width: 40,
        fontVariant: ['tabular-nums'],
      },
      rankNumPodium: { fontSize: 34, lineHeight: 37, letterSpacing: -1.53, color: t.text },
      rankNumRest: { fontSize: 27, lineHeight: 30, letterSpacing: -1.22, color: t.textTertiary },

      rowText: { flex: 1, gap: 4 },
      nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      name: {
        flexShrink: 1,
        fontFamily: Fonts.bodySemi,
        fontSize: 15,
        letterSpacing: -0.2,
        color: t.text,
      },
      trainedPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
      trainedText: { fontFamily: Fonts.legacyMono, fontSize: 8, letterSpacing: 1.1 },
      meta: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: t.textTertiary,
      },
      removeBtn: { padding: 6 },

      // ── Empty ─────────────────────────────────────────────────────────────
      emptyTitle: {
        fontFamily: Fonts.displayBold,
        fontSize: 27,
        lineHeight: 31,
        letterSpacing: -1.22,
        color: t.text,
      },
      emptySub: {
        fontFamily: Fonts.body,
        fontSize: 13.5,
        lineHeight: 20,
        color: t.textSecondary,
        marginTop: 10,
      },

      // ── Loading ───────────────────────────────────────────────────────────
      skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
      skelText: { flex: 1, gap: 8 },

      // ── How it works ──────────────────────────────────────────────────────
      howPlate: { backgroundColor: t.surfaceAlt, borderRadius: 22, padding: 20 },
      howBody: {
        fontFamily: Fonts.body,
        fontSize: 13,
        lineHeight: 20,
        color: t.textSecondary,
      },
    }),
  );
}
