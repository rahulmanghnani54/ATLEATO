import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  usePhysiqueCheckins,
  usePhysiqueAnalysis,
  decryptStorageBlob,
  type PhysiqueCheckin,
} from '@/hooks/usePhysiqueCheckins';
import { PhysiqueScoreCard } from '@/components/progress/PhysiqueScoreCard';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { EXPERT_PROGRAMS } from '@/constants/experts';

type Pose = 'front' | 'side' | 'back';

function decryptedImageUri(userId: string, path: string | null, setUri: (u: string) => void): () => void {
  if (!path) return () => {};
  let active = true;
  decryptStorageBlob(userId, path)
    .then((bytes) => {
      if (!active) return;
      const CHUNK = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      setUri(`data:image/jpeg;base64,${btoa(binary)}`);
    })
    .catch(() => {});
  return () => { active = false; };
}

export default function PhysiqueCompare() {
  const router = useRouter();
  const { checkinAId, checkinBId } = useLocalSearchParams<{ checkinAId: string; checkinBId: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { data: allCheckins = [] } = usePhysiqueCheckins();

  const selectedProgram = profile?.selected_program ?? null;
  const programId = selectedProgram ? (EXPERT_PROGRAMS[selectedProgram]?.id ?? 'cbum_evolved') : 'cbum_evolved';
  // Derive persona prefix from program id (e.g. 'cbum_evolved' -> 'cbum', 'dr_mike_mav' -> 'dr_mike')
  const persona = programId.replace(/_(?:evolved|blueprint|fundamentals|strength|mav)$/, '');

  const PERSONA_LABELS: Record<string, string> = {
    cbum: 'THE SCULPTOR SAYS', arnold: 'THE GOVERNOR SAYS', nippard: 'THE SCIENTIST SAYS',
    ct: 'THE COMMANDER SAYS', ct_fletcher: 'THE COMMANDER SAYS', dr_mike: 'DR. GROWTH SAYS',
  };

  const checkinA = allCheckins.find((c) => c.id === checkinAId) ?? null;
  const checkinB = allCheckins.find((c) => c.id === checkinBId) ?? null;

  const [activePose, setActivePose] = useState<Pose>('front');
  const [uriA, setUriA] = useState<string>('');
  const [uriB, setUriB] = useState<string>('');

  // Available poses = poses captured in BOTH check-ins
  const availablePoses: Pose[] = (['front', 'side', 'back'] as Pose[]).filter(
    (p) => checkinA && checkinB && checkinA[`${p}_path` as keyof PhysiqueCheckin] && checkinB[`${p}_path` as keyof PhysiqueCheckin]
  );

  // Decrypt images when pose or checkins change
  useEffect(() => {
    if (!user || !checkinA || !checkinB) return;
    setUriA('');
    setUriB('');
    const pathA = checkinA[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    const pathB = checkinB[`${activePose}_path` as keyof PhysiqueCheckin] as string | null;
    const cleanupA = decryptedImageUri(user.id, pathA, setUriA);
    const cleanupB = decryptedImageUri(user.id, pathB, setUriB);
    return () => { cleanupA(); cleanupB(); };
  }, [activePose, checkinA?.id, checkinB?.id, user?.id]);

  const {
    data: analysis,
    isLoading: analysisLoading,
  } = usePhysiqueAnalysis(
    checkinAId ?? null,
    checkinBId ?? null,
    persona,
  );

  if (!checkinA || !checkinB) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {formatDate(checkinA.date)} vs {formatDate(checkinB.date)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Pose switcher */}
        {availablePoses.length > 1 && (
          <View style={styles.poseSwitcher}>
            {availablePoses.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.posePill, activePose === p && styles.posePillActive]}
                onPress={() => setActivePose(p)}
              >
                <Text style={[styles.posePillText, activePose === p && styles.posePillTextActive]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Side-by-side photos */}
        <View style={styles.photosRow}>
          <View style={styles.photoCol}>
            {uriA ? (
              <Image source={{ uri: uriA }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoLoading]}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
            <Text style={styles.photoDate}>{formatDate(checkinA.date)}</Text>
          </View>
          <View style={styles.photoCol}>
            {uriB ? (
              <Image source={{ uri: uriB }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoLoading]}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}
            <Text style={styles.photoDate}>{formatDate(checkinB.date)}</Text>
          </View>
        </View>

        {/* Score chips */}
        <View style={styles.scoreRow}>
          <PhysiqueScoreCard
            label="FULLNESS"
            scoreA={analysis?.fullness_a ?? checkinA.fullness_score}
            scoreB={analysis?.fullness_b ?? checkinB.fullness_score}
          />
          <PhysiqueScoreCard
            label="LEANNESS"
            scoreA={analysis?.leanness_a ?? checkinA.leanness_score}
            scoreB={analysis?.leanness_b ?? checkinB.leanness_score}
          />
          <PhysiqueScoreCard
            label="SYMMETRY"
            scoreA={analysis?.symmetry_a ?? checkinA.symmetry_score}
            scoreB={analysis?.symmetry_b ?? checkinB.symmetry_score}
          />
        </View>

        {/* AI narrative */}
        {analysisLoading ? (
          <View style={styles.analysingCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.analysingText}>Getting AI analysis…</Text>
          </View>
        ) : analysis ? (
          <View style={styles.narrativeCard}>
            <Text style={styles.narrativeLabel}>✦ {PERSONA_LABELS[persona] ?? 'COACH SAYS'}</Text>
            <Text style={styles.narrativeText}>{analysis.narrative}</Text>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.8, flex: 1 },
  scroll: { padding: Spacing.md },
  poseSwitcher: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  posePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  posePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  posePillText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 1 },
  posePillTextActive: { color: Colors.accentInk },
  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  photoCol: { flex: 1, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 0.75, borderRadius: 6, backgroundColor: Colors.surface },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  photoDate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, marginTop: 6, letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  analysingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  analysingText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary },
  narrativeCard: {
    backgroundColor: 'rgba(91,140,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(91,140,255,0.2)',
    borderRadius: 6,
    padding: 16,
  },
  narrativeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.info, letterSpacing: 1.4, marginBottom: 10 },
  narrativeText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },
});
