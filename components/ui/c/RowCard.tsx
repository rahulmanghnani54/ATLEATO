/**
 * <RowCard> — Direction C row tile
 *
 * Icon + title + meta. No "// mono kicker" prefix. No emoji icon. Lucide SVG
 * via lucide-react-native. Tappable; rounded; consistent across all rows.
 *
 * Usage:
 *   import { Dumbbell } from 'lucide-react-native';
 *   <RowCard
 *     icon={<Dumbbell size={22} color="#ff6b35" />}
 *     title="Today's Workout"
 *     meta="Push · 55 min · 6 exercises"
 *     onPress={() => router.push('/workout-lobby')}
 *   />
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

interface Props {
  icon: React.ReactNode;            // already-sized Lucide icon (size=22, persona color)
  title: string;
  meta: string;
  onPress?: () => void;
  /** Tints the icon backdrop with persona accent at 15%. Default true. */
  iconTinted?: boolean;
  iconTintColor?: string;
}

export function RowCard({ icon, title, meta, onPress, iconTinted = true, iconTintColor = Colors.primary }: Props) {
  const inner = (
    <>
      <View
        style={[
          styles.iconWrap,
          iconTinted && { backgroundColor: hexAlpha(iconTintColor, 0.14) },
        ]}
      >
        {icon}
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{inner}</View>;
  }
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {inner}
    </TouchableOpacity>
  );
}

// Convert hex + alpha to rgba string. Robust to short and long hex.
function hexAlpha(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    padding: Spacing.md - 2,                       // off-ladder 14
    marginBottom: Spacing.sm + 2,                  // off-ladder 10
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.cardGap + 1,                      // off-ladder 14 (declared 13 elsewhere)
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: Radius.md + 2,                   // off-ladder 12
    backgroundColor: 'rgba(255,107,53,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1, minWidth: 0 },
  title: { ...Typography.cardTitle, marginBottom: Spacing.xxs },
  meta: { ...Typography.cardMeta },
});
