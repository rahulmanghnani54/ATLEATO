/**
 * /squads — Community Squads MVP.
 *
 * Shows 5 coach-persona squads, user's squad auto-set from their active coach.
 * Weekly challenge + simulated leaderboard per squad.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing, Radius } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
interface LeaderboardEntry {
  name: string;
  volume: number; // kg lifted this week
}

interface Squad {
  id: string;
  name: string;
  coach: string;
  accent: string;
  members: number;
  challenge: string;
  leaderboard: LeaderboardEntry[];
}

const SQUADS: Squad[] = [
  {
    id: 'cbum_evolved',
    name: 'Team THE SCULPTOR',
    coach: 'The Sculptor',
    accent: '#dfff1f',
    members: 1247,
    challenge: '5 PPL sessions this week. No shortcuts.',
    leaderboard: [
      { name: 'AkshatF', volume: 14_820 },
      { name: 'RyanK', volume: 13_550 },
      { name: 'DevanshM', volume: 12_990 },
      { name: 'ParthS', volume: 11_340 },
      { name: 'NikitaV', volume: 10_800 },
    ],
  },
  {
    id: 'arnold_blueprint',
    name: 'Team The Monument',
    coach: 'The Monument',
    accent: '#ffb13a',
    members: 892,
    challenge: '6 training days. Double split Monday.',
    leaderboard: [
      { name: 'SaarthakP', volume: 17_200 },
      { name: 'LucasM', volume: 16_450 },
      { name: 'ArjunD', volume: 15_100 },
      { name: 'TomR', volume: 13_800 },
      { name: 'MayaS', volume: 12_600 },
    ],
  },
  {
    id: 'nippard_fundamentals',
    name: 'Team The Analyst',
    coach: 'The Analyst',
    accent: '#5b8cff',
    members: 634,
    challenge: '4 sessions, track every rep. Science wins.',
    leaderboard: [
      { name: 'KaranB', volume: 11_430 },
      { name: 'PriyaC', volume: 10_890 },
      { name: 'JakeT', volume: 10_200 },
      { name: 'AnnikaR', volume: 9_740 },
      { name: 'VinayG', volume: 9_100 },
    ],
  },
  {
    id: 'ct_strength',
    name: 'Team CT',
    coach: 'The Commander',
    accent: '#ff5b3a',
    members: 478,
    challenge: '5 days of heavy iron. No excuses.',
    leaderboard: [
      { name: 'DeshawnM', volume: 21_000 },
      { name: 'MohanL', volume: 19_800 },
      { name: 'TarunK', volume: 18_200 },
      { name: 'CraigB', volume: 16_900 },
      { name: 'SidhantN', volume: 15_500 },
    ],
  },
  {
    id: 'dr_mike_mav',
    name: 'Team The Architect',
    coach: 'The Architect',
    accent: '#00e0a4',
    members: 891,
    challenge: 'MEV to MAV progression. Deload Friday.',
    leaderboard: [
      { name: 'AdityaP', volume: 12_300 },
      { name: 'SaraB', volume: 11_700 },
      { name: 'RishiC', volume: 11_100 },
      { name: 'NaomiF', volume: 10_600 },
      { name: 'KiranR', volume: 9_900 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k kg`;
  return `${v} kg`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LeaderboardRow({
  rank, entry, accent,
}: { rank: number; entry: LeaderboardEntry; accent: string }) {
  const isTop = rank === 1;
  return (
    <View style={lbStyles.row}>
      <Text style={[lbStyles.rank, isTop && { color: accent }]}>#{rank}</Text>
      <Text style={lbStyles.name}>{entry.name}</Text>
      <Text style={[lbStyles.volume, isTop && { color: accent }]}>{formatVolume(entry.volume)}</Text>
    </View>
  );
}

const lbStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  rank: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, width: 26, letterSpacing: 0.5 },
  name: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text, flex: 1 },
  volume: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SquadsScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const userSquadId = profile?.selected_program ?? 'cbum_evolved';

  const [expandedId, setExpandedId] = useState<string | null>(userSquadId);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>COMMUNITY SQUADS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Train with your squad. Complete weekly challenges. Climb the leaderboard.
        </Text>

        {SQUADS.map((squad) => {
          const isMySquad = squad.id === userSquadId;
          const isExpanded = expandedId === squad.id;

          return (
            <TouchableOpacity
              key={squad.id}
              activeOpacity={0.8}
              onPress={() => toggleExpand(squad.id)}
              style={[
                styles.squadCard,
                isMySquad && { borderColor: squad.accent, borderWidth: 2 },
              ]}
            >
              {/* Squad header */}
              <View style={styles.squadHeader}>
                {/* Accent pip */}
                <View style={[styles.accentPip, { backgroundColor: squad.accent }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.squadNameRow}>
                    <Text style={[styles.squadName, isMySquad && { color: squad.accent }]}>
                      {squad.name}
                    </Text>
                    {isMySquad && (
                      <View style={[styles.mySquadTag, { borderColor: squad.accent }]}>
                        <Text style={[styles.mySquadTagText, { color: squad.accent }]}>YOUR SQUAD</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.squadCoach}>{squad.coach}</Text>
                </View>
                <View style={styles.squadMeta}>
                  <Text style={[styles.memberCount, { color: squad.accent }]}>
                    {squad.members.toLocaleString()}
                  </Text>
                  <Text style={styles.memberLabel}>members</Text>
                  <Text style={styles.expandChevron}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
              </View>

              {/* Weekly challenge */}
              <View style={[styles.challengeRow, { borderLeftColor: squad.accent }]}>
                <Text style={[styles.challengeLabel, { color: squad.accent }]}>THIS WEEK</Text>
                <Text style={styles.challengeText}>{squad.challenge}</Text>
              </View>

              {/* Leaderboard (expandable) */}
              {isExpanded && (
                <View style={styles.leaderboardSection}>
                  <View style={styles.lbDivider} />
                  <Text style={styles.lbTitle}>WEEKLY LEADERBOARD</Text>
                  {squad.leaderboard.map((entry, idx) => (
                    <LeaderboardRow
                      key={entry.name}
                      rank={idx + 1}
                      entry={entry}
                      accent={squad.accent}
                    />
                  ))}
                  <View style={styles.lbDivider} />
                  <Text style={styles.lbFootnote}>Volume resets every Monday 00:00 UTC</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontSize: 22, color: Colors.text, width: 32 },
  title: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.8 },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  intro: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary,
    lineHeight: 19, marginBottom: 4,
  },

  squadCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },

  squadHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.md,
  },
  accentPip: { width: 4, height: 44, borderRadius: Radius.full, flexShrink: 0 },
  squadNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  squadName: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text, letterSpacing: -0.2 },
  mySquadTag: {
    borderWidth: 1, borderRadius: Radius.xs,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  mySquadTagText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1 },
  squadCoach: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: 2 },
  squadMeta: { alignItems: 'flex-end', gap: 2 },
  memberCount: { fontFamily: Fonts.display, fontSize: 18 },
  memberLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.8 },
  expandChevron: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 4 },

  challengeRow: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    paddingLeft: 10, borderLeftWidth: 3, gap: 2,
  },
  challengeLabel: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.4 },
  challengeText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.text, lineHeight: 18 },

  leaderboardSection: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  lbDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  lbTitle: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.8, marginBottom: 6,
  },
  lbFootnote: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.textTertiary, letterSpacing: 0.5, marginTop: 4 },
});
