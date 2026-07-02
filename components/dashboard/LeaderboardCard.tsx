/**
 * LeaderboardCard — home preview of the global weekly leaderboard.
 *
 * Shows: top 3 + the user's row (if not in top 3). Tap → /leaderboard.
 *
 * If the RPC is unavailable (migration not applied yet) we show a soft
 * placeholder so the home screen doesn't break.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useGlobalLeaderboard } from '@/hooks/useGlobalLeaderboard';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export function LeaderboardCard({ persona }: { persona: PersonaTheme }) {
  const router = useRouter();
  const { data: rows = [], isLoading } = useGlobalLeaderboard(100);

  const top3 = rows.slice(0, 3);
  const me = rows.find((r) => r.is_current_user);
  const showMeRow = me && me.rank > 3;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: persona.accent }]}
      onPress={() => router.push('/leaderboard' as any)}
      activeOpacity={0.85}
    >
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: persona.accent }]}>
          🏆 {styleText(persona, 'THIS WEEK · GLOBAL')}
        </Text>
        <Text style={styles.headRight}>→</Text>
      </View>

      {isLoading ? (
        <Text style={styles.empty}>Loading leaderboard…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          Leaderboard is warming up. Log a workout to enter the rankings.
        </Text>
      ) : (
        <>
          {top3.map((r) => (
            <Row key={r.rank} row={r} accent={persona.accent} soft={persona.accentSoft} />
          ))}
          {showMeRow && (
            <>
              <Text style={styles.divider}>· · ·</Text>
              <Row row={me!} accent={persona.accent} soft={persona.accentSoft} />
            </>
          )}
          {!me && (
            <Text style={styles.empty}>
              Log a workout this week to enter the rankings.
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

function Row({ row, accent, soft }: { row: { rank: number; anon_handle: string; volume_kg: number; sessions: number; is_current_user: boolean }; accent: string; soft: string }) {
  const medal =
    row.rank === 1 ? '🥇' :
    row.rank === 2 ? '🥈' :
    row.rank === 3 ? '🥉' : `#${row.rank}`;
  return (
    <View style={[styles.row, row.is_current_user && { backgroundColor: soft }]}>
      <Text style={[styles.rank, { width: 36 }]}>{medal}</Text>
      <Text
        style={[
          styles.handle,
          row.is_current_user && { color: accent, fontFamily: Fonts.bodySemi },
        ]}
        numberOfLines={1}
      >
        {row.is_current_user ? 'You' : row.anon_handle}
      </Text>
      <Text style={styles.volume}>
        {row.volume_kg.toLocaleString()}<Text style={styles.unit}> kg</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  label:     { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  headRight: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary },
  empty:     { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, paddingVertical: 8 },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4,
    borderRadius: 4,
  },
  rank:   { fontFamily: Fonts.display, fontSize: 14, color: Colors.text },
  handle: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: Colors.text },
  volume: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text },
  unit:   { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },

  divider: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary, textAlign: 'center', paddingVertical: 4 },
});
