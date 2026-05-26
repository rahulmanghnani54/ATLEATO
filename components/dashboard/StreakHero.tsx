/**
 * Streak Hero
 *
 * The most visible thing on the home screen after the greeting.
 * Big flame (size scales with tier), big day count, coach-voice subline,
 * milestone progress bar.
 *
 * If `atMilestone === true`, displays a special "MILESTONE HIT" celebration
 * badge for one day.
 */
import { View, Text, StyleSheet } from 'react-native';
import { getStreakStatus } from '@/lib/streakEngine';
import { type PersonaTheme, styleText } from '@/lib/personaTheme';
import { useStreakFreezes } from '@/hooks/useStreakFreezes';
import { Colors, Fonts } from '@/constants/theme';

export function StreakHero({ days, persona }: { days: number; persona: PersonaTheme }) {
  const status = getStreakStatus(days, persona);
  const { freezes, maxFreezes } = useStreakFreezes();

  // Day 0 → render an "INVITATION" card instead — no flame, just a CTA tone
  if (days === 0) {
    return (
      <View style={[styles.card, styles.cardEmpty, { borderColor: persona.accent }]}>
        <Text style={[styles.label, { color: persona.accent }]}>
          ✦ {styleText(persona, 'YOUR STREAK')}
        </Text>
        <Text style={styles.emptyHeadline}>Start today.</Text>
        <Text style={styles.subline}>
          Log one workout to start your streak. {persona.shortName} is waiting.
        </Text>
      </View>
    );
  }

  return (
    <View style={[
      styles.card,
      {
        borderColor: persona.accent,
        backgroundColor: persona.accentSoft,
      },
    ]}>
      {/* Top row: flame + number + tier */}
      <View style={styles.topRow}>
        <Text style={[styles.flame, { fontSize: status.flameSize }]}>🔥</Text>
        <View style={styles.numberStack}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { color: persona.accent }]}>{status.days}</Text>
            <Text style={styles.unit}>{status.days === 1 ? 'DAY' : 'DAYS'}</Text>
          </View>
          <Text style={[styles.tier, { color: persona.accent }]}>
            {styleText(persona, status.headline)}
          </Text>
        </View>

        {/* Milestone badge */}
        {status.atMilestone && (
          <View style={[styles.milestoneBadge, { backgroundColor: persona.accent }]}>
            <Text style={[styles.milestoneBadgeText, { color: persona.ink }]}>
              ★ {status.milestoneLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Streak Freezes inventory — Duolingo-style ice cubes */}
      <View style={styles.freezeRow}>
        {Array.from({ length: maxFreezes }).map((_, i) => {
          const owned = i < freezes;
          return (
            <Text key={i} style={[styles.freezeIcon, !owned && styles.freezeIconEmpty]}>
              {owned ? '🧊' : '·'}
            </Text>
          );
        })}
        <Text style={styles.freezeLabel}>
          {freezes > 0
            ? `${freezes} streak freeze${freezes === 1 ? '' : 's'} — auto-saves a missed day`
            : 'Earn a freeze every 7 days — auto-saves a missed day'}
        </Text>
      </View>

      {/* Coach voice line */}
      <Text style={styles.subline}>{status.subline}</Text>

      {/* Milestone progress bar (only when not at milestone) */}
      {!status.atMilestone && (
        <View style={styles.milestoneRow}>
          <View style={styles.milestoneTrack}>
            {/* Progress = days from previous-or-zero milestone to next */}
            <View
              style={[
                styles.milestoneFill,
                {
                  backgroundColor: persona.accent,
                  width: `${milestoneProgressPct(status.days, status.nextMilestone)}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.milestoneMeta}>
            {status.daysToMilestone} to {status.milestoneLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Linear % from previous milestone (or 0) to next, capped 0..100. */
function milestoneProgressPct(days: number, next: number): number {
  // Previous milestone = the one just before `next` (or 0 for fresh streaks)
  const MILES = [0, 3, 7, 14, 21, 30, 60, 100, 200, 365];
  let prev = 0;
  for (const m of MILES) if (m < next) prev = m;
  if (next === prev) return 100;
  const pct = Math.max(0, Math.min(100, Math.round(((days - prev) / (next - prev)) * 100)));
  return pct;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 8,
    padding: 16, marginBottom: 14,
  },
  cardEmpty: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginBottom: 6 },
  emptyHeadline: { fontFamily: Fonts.display, fontSize: 24, color: Colors.text, marginTop: 2, marginBottom: 8, letterSpacing: -0.4 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  flame: { lineHeight: 60 },
  numberStack: { flex: 1 },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  number: { fontFamily: Fonts.display, fontSize: 44, letterSpacing: -1.2, lineHeight: 44 },
  unit: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary, letterSpacing: 1.4 },
  tier: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginTop: 2 },

  milestoneBadge: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 3,
  },
  milestoneBadgeText: { fontFamily: Fonts.display, fontSize: 10, letterSpacing: 0.8 },

  // Freeze inventory row (between top + subline)
  freezeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 6,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  freezeIcon:      { fontSize: 16 },
  freezeIconEmpty: { fontSize: 16, color: Colors.textTertiary, opacity: 0.4 },
  freezeLabel: {
    flex: 1, fontFamily: Fonts.mono, fontSize: 9,
    color: Colors.textSecondary, letterSpacing: 0.8, marginLeft: 4,
  },

  subline: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.text,
    lineHeight: 19, marginBottom: 12,
  },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneTrack: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  milestoneFill: { height: '100%', borderRadius: 2 },
  milestoneMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.8 },
});
