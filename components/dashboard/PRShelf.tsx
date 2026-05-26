/**
 * PR Shelf — top 3 personal records as trophy cards on the home screen.
 *
 * The #1 PR gets the hero treatment (full coach-accent fill, larger numbers,
 * gold trophy icon). #2 and #3 sit beside it as smaller dark cards with
 * an accent-colored top border — like medals on a shelf.
 *
 * Empty state shows a single coach-voice prompt ("No PRs yet — go set one").
 *
 * Tapping any card jumps to the Progress tab where the full PR list lives.
 */
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { usePersonalRecords } from '@/hooks/useProgressStats';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

/** Best-effort Epley formula if the stored 1RM is missing. */
function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** "5d ago" / "3w ago" / "Jan 15" — keeps trophy chrome tight. */
function shortDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7)   return `${days}d AGO`;
  if (days < 30)  return `${Math.floor(days / 7)}w AGO`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export function PRShelf({ persona }: { persona: PersonaTheme }) {
  const router = useRouter();
  const { data: prs = [], isLoading } = usePersonalRecords();

  // Don't render anything until we know — avoids a flash of empty state
  if (isLoading) return null;

  const goToProgress = () => router.push('/(tabs)/progress' as any);

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  if (prs.length === 0) {
    return (
      <TouchableOpacity
        style={[styles.emptyCard, { borderColor: persona.accent }]}
        onPress={goToProgress}
        activeOpacity={0.85}
      >
        <Text style={[styles.emptyTrophy, { color: persona.accent, opacity: 0.4 }]}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.emptyLabel, { color: persona.accent }]}>
            ✦ {styleText(persona, 'YOUR TROPHY SHELF')}
          </Text>
          <Text style={styles.emptyTitle}>Empty for now.</Text>
          <Text style={styles.emptySub}>
            Complete workouts, log your top sets — your first PR goes here.
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Take top 3 by estimated 1RM (data is already sorted desc)
  const top = prs.slice(0, 3);
  const champ = top[0];
  const others = top.slice(1);
  const champOneRM = champ.oneRepMaxKg ?? epley(champ.weightKg, champ.reps);

  return (
    <View style={styles.shelf}>
      {/* Section header */}
      <View style={styles.shelfHeader}>
        <Text style={[styles.shelfLabel, { color: persona.accent }]}>
          ✦ {styleText(persona, 'TROPHY SHELF')}
        </Text>
        <TouchableOpacity onPress={goToProgress}>
          <Text style={[styles.shelfMore, { color: persona.accent }]}>SEE ALL →</Text>
        </TouchableOpacity>
      </View>

      {/* ── #1 PR — hero treatment ──────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.champCard, { backgroundColor: persona.accent }]}
        onPress={goToProgress}
        activeOpacity={0.9}
      >
        <View style={styles.champTopRow}>
          <Text style={[styles.champRankPill, { color: persona.ink, borderColor: persona.ink }]}>
            🏆  #1 ALL-TIME
          </Text>
          <Text style={[styles.champDate, { color: persona.ink, opacity: 0.6 }]}>
            {shortDate(champ.achievedAt)}
          </Text>
        </View>
        <Text style={[styles.champExercise, { color: persona.ink }]} numberOfLines={1}>
          {champ.exerciseName.toUpperCase()}
        </Text>
        <View style={styles.champStatsRow}>
          <View>
            <Text style={[styles.champLiftMain, { color: persona.ink }]}>
              {champ.weightKg}
              <Text style={[styles.champUnit, { color: persona.ink, opacity: 0.7 }]}>kg</Text>
              {' × '}{champ.reps}
            </Text>
            <Text style={[styles.champEstimate, { color: persona.ink, opacity: 0.75 }]}>
              EST 1RM · {champOneRM}kg
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── #2 & #3 — side-by-side medals ──────────────────────────────── */}
      {others.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.medalsRow}
        >
          {others.map((pr, i) => {
            const oneRM = pr.oneRepMaxKg ?? epley(pr.weightKg, pr.reps);
            const rank = i + 2;
            return (
              <TouchableOpacity
                key={pr.id}
                style={[styles.medalCard, { borderTopColor: persona.accent }]}
                onPress={goToProgress}
                activeOpacity={0.85}
              >
                <View style={styles.medalTopRow}>
                  <Text style={[styles.medalRank, { color: persona.accent }]}>#{rank}</Text>
                  <Text style={styles.medalDate}>{shortDate(pr.achievedAt)}</Text>
                </View>
                <Text style={styles.medalExercise} numberOfLines={2}>{pr.exerciseName}</Text>
                <Text style={styles.medalLift}>
                  {pr.weightKg}<Text style={styles.medalUnit}>kg</Text> × {pr.reps}
                </Text>
                <Text style={[styles.medalEstimate, { color: persona.accent }]}>
                  {oneRM}kg e1RM
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shelf: { marginBottom: 14 },
  shelfHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 8,
  },
  shelfLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6 },
  shelfMore:  { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2 },

  // ── #1 hero card ──────────────────────────────────────────────────────────
  champCard: {
    borderRadius: 8, padding: 16, overflow: 'hidden',
  },
  champTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  champRankPill: {
    fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.4,
    borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  champDate: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2 },
  champExercise: {
    fontFamily: Fonts.display, fontSize: 16, letterSpacing: 0.3, marginBottom: 6,
  },
  champStatsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  champLiftMain: { fontFamily: Fonts.display, fontSize: 36, letterSpacing: -1, lineHeight: 38 },
  champUnit: { fontSize: 16 },
  champEstimate: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, marginTop: 4 },

  // ── #2 & #3 medal cards ──────────────────────────────────────────────────
  medalsRow: { gap: 10, marginTop: 10 },
  medalCard: {
    width: 160,
    backgroundColor: Colors.surface,
    borderTopWidth: 2,
    borderRadius: 4,
    padding: 12,
    borderWidth: 1, borderColor: Colors.border, borderTopColor: undefined,
  },
  medalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  medalRank: { fontFamily: Fonts.display, fontSize: 18, letterSpacing: -0.4 },
  medalDate: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 1 },
  medalExercise: {
    fontFamily: Fonts.bodySemi, fontSize: 12, color: Colors.text,
    marginBottom: 8, lineHeight: 15, minHeight: 30,
  },
  medalLift: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, lineHeight: 20 },
  medalUnit: { fontSize: 10, color: Colors.textTertiary },
  medalEstimate: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.2, marginTop: 4 },

  // ── Empty state ──────────────────────────────────────────────────────────
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderStyle: 'dashed',
    borderRadius: 8, padding: 14, marginBottom: 14,
  },
  emptyTrophy: { fontSize: 36 },
  emptyLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginBottom: 4 },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, marginBottom: 4, letterSpacing: -0.3 },
  emptySub:   { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
});
