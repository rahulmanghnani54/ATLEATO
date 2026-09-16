/**
 * /leaderboard — full global weekly leaderboard.
 *
 * Anonymous handles (Lifter #1234). The rank is the oversized numeral that
 * carries each row; the user's own row is the single accent moment and stays
 * pinned at the bottom if they're outside the top.
 */
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Crown, CrownSlot, Hairline, Section, useCrownStatusBar } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useGlobalLeaderboard, type LeaderboardRow } from '@/hooks/useGlobalLeaderboard';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles } from '@/lib/theme';

type PersonaAccent = ReturnType<typeof personaAccent>;
type LeaderboardStyles = ReturnType<typeof useLeaderboardStyles>;

const NO_ROWS: LeaderboardRow[] = [];

export default function LeaderboardScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  useFeatureGate('reward_chests');
  const persona = personaFromProgramId(profile?.selected_program);
  const { data: rows = [], isLoading, refetch, isFetching, isError } = useGlobalLeaderboard(100);

  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useLeaderboardStyles();
  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so its tint always comes from the
  // dark triplet — the light-tuned persona accents go muddy against ink.
  const crownTint = personaAccent(persona, 'dark').accent;

  // This screen owns its scroller (a FlatList of 100 rows), so it also owns the
  // crown's status-bar contract that CanvasScreen would otherwise handle.
  const crownBar = useCrownStatusBar();

  const me = rows.find((r) => r.is_current_user);
  const top = rows.filter((r) => r.rank <= 100);

  const showList = !isLoading && !isError && top.length > 0;

  const header = (
    <>
      <Crown
        eyebrow="Global · this week · anonymous"
        title={styleText(persona, 'Weekly leaderboard')}
        meta={'Ranked by total weight moved (kg) Monday → Sunday. Names hidden — only your "Lifter #" handle is shown. Resets every Monday at midnight.'}
        accent={crownTint}
        onBack={() => router.back()}
      >
        {me && (
          <View style={styles.crownYou}>
            <Text style={styles.crownYouLabel}>Your position</Text>
            <View style={styles.crownYouRow}>
              <Text style={[styles.crownYouRank, { color: crownTint }]}>
                #{me.rank}
              </Text>
              <View style={styles.crownYouVol}>
                <Text style={styles.crownYouVolNum}>{me.volume_kg.toLocaleString()}</Text>
                <Text style={styles.crownYouVolLabel}>kg moved</Text>
              </View>
            </View>
          </View>
        )}
      </Crown>

      <View style={styles.gutter}>
        <Section
          label={showList ? `Top ${top.length}` : 'Top 100'}
          right={<Text style={styles.headHint}>kg</Text>}
        >
          <Hairline />
        </Section>
      </View>
    </>
  );

  const placeholder = isLoading ? (
    <View style={styles.gutter}>
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton width={44} height={30} radius={8} />
          <View style={styles.skelText}>
            <Skeleton width="58%" height={15} radius={6} />
            <Skeleton width="34%" height={9} radius={4} />
          </View>
          <Skeleton width={72} height={20} radius={6} />
        </View>
      ))}
    </View>
  ) : isError ? (
    <View style={styles.stateWrap}>
      <Text style={styles.stateTitle}>Couldn&apos;t load the leaderboard</Text>
      <Text style={styles.stateBody}>Check your connection and try again.</Text>
      <PressableScale
        style={[styles.stateBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        onPress={() => refetch()}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Retry loading the leaderboard"
      >
        <Text style={[styles.stateBtnText, { color: pa.ink }]}>RETRY</Text>
      </PressableScale>
    </View>
  ) : (
    <View style={styles.stateWrap}>
      <Text style={styles.stateEmoji}>🏆</Text>
      <Text style={styles.stateTitle}>Fresh board — resets every Monday</Text>
      <Text style={styles.stateBody}>
        No lifts logged yet this week. One workout puts you at #1.
      </Text>
      <PressableScale
        style={[styles.stateBtn, { backgroundColor: pa.accent, borderColor: pa.accentText }]}
        onPress={() => router.push('/(tabs)/workouts' as any)}
        haptic="heavy"
        accessibilityRole="button"
        accessibilityLabel="Log today's workout"
      >
        <Text style={[styles.stateBtnText, { color: pa.ink }]}>LOG TODAY&apos;S WORKOUT →</Text>
      </PressableScale>
    </View>
  );

  return (
    <CrownSlot value={crownBar.registerCrown}>
      <View style={styles.root}>
        {crownBar.statusBar}
        <FlatList
          data={showList ? top : NO_ROWS}
          keyExtractor={(r) => String(r.rank)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
          renderItem={({ item }) => <Row row={item} pa={pa} styles={styles} />}
          ItemSeparatorComponent={() => <Hairline style={styles.sep} />}
          ListHeaderComponent={header}
          ListEmptyComponent={placeholder}
          // Pull-to-refresh belongs to the populated list only — the loading,
          // error and empty branches never carried it.
          refreshing={showList ? isFetching : undefined}
          onRefresh={showList ? refetch : undefined}
          onScroll={crownBar.onScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            me && me.rank > 100 ? (
              // No gutter here — Row carries its own horizontal inset, and the
              // pinned row must line up with the ones above it.
              <View>
                <Hairline style={styles.sep} />
                <Text style={styles.youBreak}>· · ·</Text>
                <Hairline style={styles.sep} />
                <Row row={me} pa={pa} styles={styles} />
              </View>
            ) : null
          }
        />
      </View>
    </CrownSlot>
  );
}

function Row({
  row,
  pa,
  styles,
}: {
  row: LeaderboardRow;
  pa: PersonaAccent;
  styles: LeaderboardStyles;
}) {
  const podium = row.rank <= 3;
  // The medal is kept ALONGSIDE the numeral rather than replacing it — the rank
  // is the row's oversized moment and must read at every position.
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;

  return (
    <View
      style={[
        styles.row,
        row.is_current_user && [styles.rowMe, { backgroundColor: pa.accentSoft }],
      ]}
    >
      {row.is_current_user ? (
        <View style={[styles.meBar, { backgroundColor: pa.accent }]} />
      ) : null}

      <View style={styles.rankCell}>
        <Text
          style={[
            styles.rankNum,
            podium && styles.rankNumPodium,
            row.is_current_user && { color: pa.accentText },
          ]}
          numberOfLines={1}
        >
          {row.rank}
        </Text>
        {medal ? <Text style={styles.rankMedal}>{medal}</Text> : null}
      </View>

      <View style={styles.rowText}>
        <Text
          style={[styles.handle, row.is_current_user && { color: pa.accentText }]}
          numberOfLines={1}
        >
          {row.is_current_user ? 'You' : row.anon_handle}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {row.sessions} session{row.sessions === 1 ? '' : 's'}
        </Text>
      </View>

      <Text style={styles.volume} numberOfLines={1}>
        {row.volume_kg.toLocaleString()}
        <Text style={styles.unit}> kg</Text>
      </Text>
    </View>
  );
}

function useLeaderboardStyles() {
  return useThemedStyles((t) =>
    StyleSheet.create({
      root: { flex: 1, backgroundColor: t.bg },
      list: { paddingTop: 0 },
      gutter: { paddingHorizontal: 22 },

      // ── Crown hero — the one place the user's standing is shouted ──────────
      crownYou: { marginTop: 22 },
      crownYouLabel: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: t.crownTextDim,
        marginBottom: 6,
      },
      crownYouRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 18 },
      crownYouRank: {
        fontFamily: Fonts.displayBold,
        fontSize: 52,
        lineHeight: 53,
        letterSpacing: -2.34,
        fontVariant: ['tabular-nums'],
      },
      crownYouVol: { paddingBottom: 8 },
      crownYouVolNum: {
        fontFamily: Fonts.displayMedium,
        fontSize: 21,
        letterSpacing: -0.63,
        color: t.crownText,
        fontVariant: ['tabular-nums'],
      },
      crownYouVolLabel: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: t.crownTextDim,
        marginTop: 3,
      },

      headHint: {
        fontFamily: Fonts.legacyMono,
        fontSize: 9,
        letterSpacing: 1.7,
        textTransform: 'uppercase',
        color: t.textTertiary,
      },

      // ── Rows ──────────────────────────────────────────────────────────────
      sep: { marginHorizontal: 22 },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 22,
      },
      // The accent moment: a soft plate, not a card — the 3px bar gives it an
      // identifiable edge without introducing a visible border.
      rowMe: { marginHorizontal: 12, paddingHorizontal: 10, borderRadius: 19 },
      meBar: {
        position: 'absolute',
        left: 0,
        top: 12,
        bottom: 12,
        width: 3,
        borderRadius: 2,
      },
      rankCell: {
        width: 54,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 3,
      },
      rankNum: {
        fontFamily: Fonts.displayBold,
        fontSize: 27,
        lineHeight: 30,
        letterSpacing: -1.22,
        color: t.text,
        fontVariant: ['tabular-nums'],
      },
      rankNumPodium: { fontSize: 34, lineHeight: 37, letterSpacing: -1.53 },
      rankMedal: { fontSize: 11, lineHeight: 16 },

      rowText: { flex: 1, gap: 3 },
      handle: {
        fontFamily: Fonts.bodySemi,
        fontSize: 15,
        letterSpacing: -0.2,
        color: t.text,
      },
      meta: {
        fontFamily: Fonts.legacyMono,
        fontSize: 8,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: t.textTertiary,
      },
      volume: {
        fontFamily: Fonts.displayBold,
        fontSize: 20,
        letterSpacing: -0.6,
        color: t.text,
        fontVariant: ['tabular-nums'],
      },
      unit: {
        fontFamily: Fonts.legacyMono,
        fontSize: 9,
        letterSpacing: 1.2,
        color: t.textTertiary,
      },
      youBreak: {
        fontFamily: Fonts.legacyMono,
        fontSize: 12,
        letterSpacing: 3,
        color: t.textTertiary,
        textAlign: 'center',
        paddingVertical: 14,
      },

      // ── Loading / error / empty ───────────────────────────────────────────
      skelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
      },
      skelText: { flex: 1, gap: 7 },

      stateWrap: { alignItems: 'center', marginTop: 30, paddingHorizontal: 34, gap: 10 },
      stateEmoji: { fontSize: 44, marginBottom: 4 },
      stateTitle: {
        fontFamily: Fonts.displayBold,
        fontSize: 24,
        lineHeight: 28,
        letterSpacing: -1.08,
        color: t.text,
        textAlign: 'center',
      },
      stateBody: {
        fontFamily: Fonts.body,
        fontSize: 13.5,
        lineHeight: 20,
        color: t.textSecondary,
        textAlign: 'center',
      },
      stateBtn: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 26,
        // A persona-tinted fill on a light page needs a boundary the same way
        // tokens.accentLine backs the emerald one; accentText is that tone.
        borderWidth: 1,
      },
      stateBtnText: {
        fontFamily: Fonts.legacyMono,
        fontSize: 10,
        letterSpacing: 1.8,
      },
    }),
  );
}
