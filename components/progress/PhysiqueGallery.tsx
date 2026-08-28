import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePhysiqueCheckins, decryptStorageBlob, type PhysiqueCheckin } from '@/hooks/usePhysiqueCheckins';
import { useAuthStore } from '@/stores/authStore';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

function dueDateLabel(lastDate: string, cadence: 'weekly' | 'biweekly' | 'monthly'): string {
  const days = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
  const due = new Date(lastDate);
  due.setDate(due.getDate() + days);
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'Check-in overdue';
  if (diff === 1) return 'Check-in due tomorrow';
  return `Next check-in in ${diff} days`;
}

function ThumbnailCell({
  checkin,
  selected,
  onPress,
}: {
  checkin: PhysiqueCheckin;
  selected: boolean;
  onPress: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [uri, setUri] = useState<string | null>(null);
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (!user) return;
    let active = true;
    decryptStorageBlob(user.id, checkin.front_thumb)
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
  }, [checkin.front_thumb, user?.id]);

  return (
    <TouchableOpacity
      style={[styles.cell, selected && styles.cellSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <ActivityIndicator color={tokens.accent} style={styles.thumbnail} />
      )}
      <View style={styles.cellFooter}>
        <Text style={styles.cellDate}>
          {new Date(checkin.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
        {checkin.pose_count > 1 && (
          <Text style={styles.poseBadge}>{checkin.pose_count} poses</Text>
        )}
      </View>
      {selected && <View style={styles.selectedOverlay} />}
    </TouchableOpacity>
  );
}

type GalleryItem = { type: 'new' } | { type: 'checkin'; data: PhysiqueCheckin };

export function PhysiqueGallery() {
  const router = useRouter();
  const { data: checkins = [], isLoading } = usePhysiqueCheckins();
  const [selected, setSelected] = useState<string[]>([]);
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const handleCompare = () => {
    if (selected.length !== 2) return;
    router.push({
      pathname: '/physique-compare',
      params: { checkinAId: selected[0], checkinBId: selected[1] },
    } as any);
  };

  const latestCheckin = checkins[0];

  if (isLoading) {
    return <ActivityIndicator color={tokens.accent} style={{ marginTop: 40 }} />;
  }

  return (
    <View style={styles.container}>
      {/* Due date banner */}
      {latestCheckin && (
        <View style={styles.dueBanner}>
          <Text style={styles.dueText}>
            {dueDateLabel(latestCheckin.date, latestCheckin.cadence)}
          </Text>
        </View>
      )}

      {/* Photo grid */}
      <FlatList
        data={[
          { type: 'new' } as GalleryItem,
          ...checkins.map((c) => ({ type: 'checkin' as const, data: c })),
        ]}
        keyExtractor={(item: GalleryItem) => item.type === 'new' ? 'new' : item.data.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        scrollEnabled={false}
        renderItem={({ item }: { item: GalleryItem }) => {
          if (item.type === 'new') {
            return (
              <TouchableOpacity
                style={[styles.cell, styles.newCheckinCell]}
                onPress={() => router.push('/physique-checkin' as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.newCheckinPlus}>＋</Text>
                <Text style={styles.newCheckinLabel}>NEW CHECK-IN</Text>
              </TouchableOpacity>
            );
          }
          return (
            <ThumbnailCell
              checkin={item.data}
              selected={selected.includes(item.data.id)}
              onPress={() => toggleSelect(item.data.id)}
            />
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No check-ins yet. Tap ＋ to start your physique timeline.</Text>
        }
      />

      {/* Compare button */}
      {selected.length === 2 && (
        <TouchableOpacity style={styles.compareBtn} onPress={handleCompare} activeOpacity={0.85}>
          <Text style={styles.compareBtnText}>COMPARE SELECTED →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const CELL_SIZE = 160;

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    container: { flex: 1 },
    dueBanner: {
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accentLine,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
    },
    // Emerald AS TEXT needs the AA-safe deep tone; the fill emerald is 2.54:1
    // on light and would fail here and on the two labels below.
    dueText: { fontFamily: Fonts.mono, fontSize: 10, color: t.accentText, letterSpacing: 1 },
    row: { gap: 10, marginBottom: 10 },
    cell: {
      flex: 1,
      height: CELL_SIZE,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      overflow: 'hidden',
    },
    cellSelected: { borderColor: t.accent, borderWidth: 2 },
    thumbnail: { flex: 1, width: '100%' },
    cellFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      // This bar sits ON the photo, not on the page, so it uses the scrim/crown
      // pair — dark ground with light ink — in both schemes.
      backgroundColor: t.scrim,
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    cellDate: { fontFamily: Fonts.mono, fontSize: 9, color: t.crownText, letterSpacing: 0.5 },
    // Sits on the photo scrim, not the page, so it takes the crown accent.
    poseBadge: { fontFamily: Fonts.mono, fontSize: 8, color: t.crownAccent },
    selectedOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderWidth: 2,
      borderColor: t.accent,
      borderRadius: 5,
    },
    newCheckinCell: {
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    newCheckinPlus: { fontFamily: Fonts.display, fontSize: 32, color: t.accentText, marginBottom: 6 },
    newCheckinLabel: { fontFamily: Fonts.mono, fontSize: 9, color: t.textTertiary, letterSpacing: 1.4 },
    emptyText: {
      fontFamily: Fonts.body,
      fontSize: 13,
      color: t.textTertiary,
      textAlign: 'center',
      marginTop: 24,
      lineHeight: 20,
    },
    compareBtn: {
      backgroundColor: t.accent,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    compareBtnText: { fontFamily: Fonts.display, fontSize: 13, color: t.accentInk, letterSpacing: 1 },
  });
