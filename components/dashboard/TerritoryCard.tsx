/**
 * TerritoryCard — home preview of the user's territory + run CTA.
 *
 * Two states:
 *   - Empty (zero cells owned) → primary "🌍 RUN TO CLAIM TERRITORY" CTA
 *   - Owned → big cell count, rank, total km, and a smaller "RUN AGAIN" CTA
 *
 * Tapping the big area routes to /run; tapping the small "see leaderboard"
 * link routes to /territory-leaderboard.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMyTerritoryStats } from '@/hooks/useTerritory';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export function TerritoryCard({ persona }: { persona: PersonaTheme }) {
  const router = useRouter();
  const { data: stats } = useMyTerritoryStats();
  const cellsOwned = stats?.cells_owned ?? 0;
  const rank       = stats?.rank ?? 0;
  const km         = ((stats?.total_distance_m ?? 0) / 1000).toFixed(1);
  const runs       = stats?.total_runs ?? 0;

  if (cellsOwned === 0) {
    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: persona.accent }]}
        onPress={() => router.push('/run' as any)}
        activeOpacity={0.85}
      >
        <View style={styles.headRow}>
          <Text style={[styles.label, { color: persona.accent }]}>
            🌍 {styleText(persona, 'TERRITORY')}
          </Text>
          <Text style={styles.headRight}>NEW</Text>
        </View>
        <Text style={styles.emptyTitle}>Claim your first territory.</Text>
        <Text style={styles.emptyBody}>
          Run anywhere — every 200×200m cell you touch becomes yours. Anyone
          who runs through it next steals it.
        </Text>
        <View style={[styles.cta, { backgroundColor: persona.accent }]}>
          <Text style={[styles.ctaText, { color: persona.ink }]}>
            ▶  START A RUN
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: persona.accent, backgroundColor: persona.accentSoft }]}
      onPress={() => router.push('/(tabs)/territory' as any)}
      activeOpacity={0.88}
    >
      <View style={styles.headRow}>
        <Text style={[styles.label, { color: persona.accent }]}>
          🌍 {styleText(persona, 'TERRITORY')}
        </Text>
        <TouchableOpacity onPress={() => router.push('/territory-leaderboard' as any)}>
          <Text style={[styles.linkRight, { color: persona.accent }]}>LEADERBOARD →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cellsNum, { color: persona.accent }]}>{cellsOwned}</Text>
          <Text style={styles.cellsLabel}>CELLS OWNED</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaItem}>
            {rank > 0 ? `RANK #${rank}` : 'UNRANKED'}
          </Text>
          <Text style={styles.metaItem}>
            {runs} run{runs === 1 ? '' : 's'} · {km} km
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: persona.accent }]}
          onPress={() => router.push('/(tabs)/territory' as any)}
          activeOpacity={0.85}
        >
          <Text style={[styles.actionText, { color: persona.accent }]}>🗺  VIEW MAP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: persona.accent, borderColor: persona.accent }]}
          onPress={() => router.push('/run' as any)}
          activeOpacity={0.85}
        >
          <Text style={[styles.actionText, { color: persona.ink }]}>▶  RUN AGAIN</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 8, padding: 16, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  label:    { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.4 },
  headRight:{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.2 },
  linkRight:{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },

  // Empty state
  emptyTitle: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 22, color: Colors.text, marginTop: 4, marginBottom: 8, letterSpacing: -0.4 },
  emptyBody:  { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 14 },

  // Owned state
  statsRow:   { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 12 },
  cellsNum:   { fontFamily: Fonts.display, fontWeight: '800', fontSize: 56, letterSpacing: -2, lineHeight: 56 },
  cellsLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginTop: 2 },
  metaCol:    { alignItems: 'flex-end', gap: 6 },
  metaItem:   { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1 },

  // CTA buttons
  cta:        { paddingVertical: 14, borderRadius: 100, alignItems: 'center', marginTop: 4 },
  ctaText:    { fontFamily: Fonts.display, fontWeight: '700', fontSize: 13, letterSpacing: 0.9 },

  actionRow:  { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn:  {
    flex: 1, borderWidth: 1, paddingVertical: 12, borderRadius: 100,
    alignItems: 'center',
  },
  actionText: { fontFamily: Fonts.display, fontWeight: '700', fontSize: 11, letterSpacing: 0.9 },
});
