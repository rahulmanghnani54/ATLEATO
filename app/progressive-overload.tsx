import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';

type SetLog = { w: number; r: number; rpe: number };
type Session = { date: string; sets: SetLog[]; avgRpe: number };

export default function ProgressiveOverload() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    exercise?: string;
    currentWeight?: string;
    nextWeight?: string;
    targetReps?: string;
    stopRpe?: string;
    coachId?: string;
  }>();

  const exercise      = params.exercise      ?? 'Incline DB Press';
  const currentWeight = parseFloat(params.currentWeight ?? '32.5');
  const nextWeight    = parseFloat(params.nextWeight    ?? '35');
  const targetReps    = params.targetReps    ?? '8–10';
  const stopRpe       = parseInt(params.stopRpe         ?? '9');
  const coachId       = params.coachId       ?? 'cbum';

  const delta    = +(nextWeight - currentWeight).toFixed(1);
  const deltaPct = ((delta / currentWeight) * 100).toFixed(1);

  const history: Session[] = [
    { date: 'TUE · 3 WEEKS AGO', sets: [{ w: currentWeight - 2.5, r: 10, rpe: 8 }, { w: currentWeight - 2.5, r: 9, rpe: 8 }, { w: currentWeight - 2.5, r: 8, rpe: 9 }], avgRpe: 8.3 },
    { date: 'FRI · 2 WEEKS AGO', sets: [{ w: currentWeight - 2.5, r: 10, rpe: 7 }, { w: currentWeight - 2.5, r: 10, rpe: 8 }, { w: currentWeight - 2.5, r: 9, rpe: 8 }], avgRpe: 7.7 },
    { date: 'TUE · LAST WEEK',   sets: [{ w: currentWeight, r: 10, rpe: 7 }, { w: currentWeight, r: 9, rpe: 8 }, { w: currentWeight, r: 8, rpe: 9 }], avgRpe: 8.0 },
  ];

  const reasons = [
    '3 sessions in a row hitting top of rep range',
    `Avg RPE dropped ${history[0].avgRpe} → ${history[2].avgRpe} at same load`,
    'Recovery score 82 today — green light to load',
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.topBar}>
          <View style={styles.engineTag}>
            <View style={styles.tagDot} />
            <Text style={styles.tagText}>OVERLOAD ENGINE</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Headline */}
        <View style={styles.headlineWrap}>
          <Text style={styles.exerciseName}>{exercise.toUpperCase()}</Text>
          <Text style={styles.headline}>TIME TO{'\n'}GO UP.</Text>
          <Text style={styles.headlineSub}>
            You hit your target reps at{' '}
            <Text style={styles.highlight}>RPE ≤ {stopRpe - 1}</Text> on last set — engine says load it.
          </Text>
        </View>

        {/* Recommendation card */}
        <View style={styles.recCard}>
          <Text style={styles.recLabel}>NEXT WORKING SET</Text>
          <View style={styles.recMain}>
            <View style={styles.recLeft}>
              <Text style={styles.recNum}>{nextWeight}</Text>
              <Text style={styles.recUnit}>kg</Text>
            </View>
            <View style={styles.recRight}>
              <Text style={styles.recDeltaLabel}>VS LAST</Text>
              <Text style={styles.recDelta}>+{delta} kg</Text>
              <Text style={styles.recDeltaPct}>↑ {deltaPct}%</Text>
            </View>
          </View>
          <View style={styles.recMeta}>
            <View style={styles.recMetaItem}>
              <Text style={styles.recMetaLabel}>TARGET</Text>
              <Text style={styles.recMetaValue}>{targetReps} reps</Text>
            </View>
            <View style={styles.recMetaItem}>
              <Text style={styles.recMetaLabel}>STOP AT</Text>
              <Text style={styles.recMetaValue}>RPE {stopRpe}</Text>
            </View>
            <View style={styles.recMetaItem}>
              <Text style={styles.recMetaLabel}>SETS</Text>
              <Text style={styles.recMetaValue}>4 working</Text>
            </View>
          </View>
        </View>

        {/* Last 3 sessions */}
        <Text style={styles.sectionLabel}>LAST 3 SESSIONS</Text>
        <View style={styles.historyCard}>
          {history.map((h, i) => (
            <View key={i} style={[styles.historyRow, i < history.length - 1 && styles.historyRowBorder]}>
              <View style={styles.historyMeta}>
                <Text style={styles.historyDate}>{h.date}</Text>
                <Text style={styles.historyRpe}>AVG RPE <Text style={styles.historyRpeBold}>{h.avgRpe}</Text></Text>
              </View>
              <View style={styles.setGrid}>
                {h.sets.map((s, j) => (
                  <View key={j} style={styles.setCell}>
                    <Text style={styles.setCellWeight}>{s.w}<Text style={styles.setCellUnit}>kg</Text></Text>
                    <Text style={styles.setCellDetail}>{s.r}r · @{s.rpe}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Reasoning */}
        <View style={styles.reasonCard}>
          <Text style={styles.sectionLabel}>WHY +{delta} KG?</Text>
          {reasons.map((r, i) => (
            <View key={i} style={styles.reasonRow}>
              <Text style={styles.reasonArrow}>→</Text>
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.ctaPrimary} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.ctaPrimaryText}>LOAD {nextWeight} KG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaSecondary} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.ctaSecondaryText}>STAY AT {currentWeight}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 14, paddingBottom: 48 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  engineTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.primary}1a`, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  tagText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.primary, letterSpacing: 1.4 },
  closeBtn: { color: Colors.textSecondary, fontSize: 18 },

  headlineWrap: { marginBottom: 22 },
  exerciseName: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 1.4 },
  headline: {
    fontFamily: Fonts.display, fontSize: 38, color: Colors.text,
    lineHeight: 36, letterSpacing: -1, marginTop: 6,
  },
  headlineSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 10, lineHeight: 20 },
  highlight: { color: Colors.text, fontFamily: Fonts.bodySemi },

  // Recommendation card
  recCard: {
    backgroundColor: Colors.primary, borderRadius: 8, padding: 20, marginBottom: 22, overflow: 'hidden',
  },
  recLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accentInk, letterSpacing: 1.4, opacity: 0.7 },
  recMain: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 },
  recLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  recNum: { fontFamily: Fonts.display, fontSize: 84, color: Colors.accentInk, letterSpacing: -3, lineHeight: 80 },
  recUnit: { fontFamily: Fonts.display, fontSize: 24, color: Colors.accentInk },
  recRight: { alignItems: 'flex-end' },
  recDeltaLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accentInk, letterSpacing: 1.2, opacity: 0.7 },
  recDelta: { fontFamily: Fonts.display, fontSize: 18, color: Colors.accentInk, marginTop: 4 },
  recDeltaPct: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accentInk, marginTop: 2 },
  recMeta: {
    flexDirection: 'row', gap: 14, marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderColor: 'rgba(10,11,13,0.15)',
  },
  recMetaItem: {},
  recMetaLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accentInk, opacity: 0.7, letterSpacing: 1.2 },
  recMetaValue: { fontFamily: Fonts.display, fontSize: 18, color: Colors.accentInk, marginTop: 2 },

  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.6, marginBottom: 8 },

  // History
  historyCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, marginBottom: 14,
  },
  historyRow: { padding: 14 },
  historyRowBorder: { borderBottomWidth: 1, borderColor: Colors.border },
  historyMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  historyDate: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.2 },
  historyRpe: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  historyRpeBold: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text },
  setGrid: { flexDirection: 'row', gap: 6 },
  setCell: {
    flex: 1, padding: 10, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 3,
  },
  setCellWeight: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text, lineHeight: 18 },
  setCellUnit: { fontSize: 9, color: Colors.textTertiary, fontFamily: Fonts.mono },
  setCellDetail: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, marginTop: 4 },

  // Reasoning
  reasonCard: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, padding: 14, marginBottom: 20,
  },
  reasonRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  reasonArrow: { color: Colors.primary, fontFamily: Fonts.body, fontSize: 13 },
  reasonText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, flex: 1, lineHeight: 20 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: 8 },
  ctaPrimary: {
    flex: 1, height: 54, backgroundColor: Colors.primary, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaPrimaryText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accentInk, letterSpacing: 0.6 },
  ctaSecondary: {
    flex: 1, height: 54, borderRadius: 4, borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaSecondaryText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 0.6 },
});
