/**
 * <RowCard> — Direction C row tile
 *
 * Icon + title + meta. No "// mono kicker" prefix. No emoji icon. Lucide SVG
 * via lucide-react-native. Tappable; rounded; consistent across all rows.
 *
 * Usage:
 *   import { Dumbbell } from 'lucide-react-native';
 *   <RowCard
 *     icon={<Dumbbell size={22} color={tokens.accentText} />}
 *     title="Today's Workout"
 *     meta="Push · 55 min · 6 exercises"
 *     onPress={() => router.push('/workout-lobby')}
 *   />
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Spacing, Radius, Typography } from '@/constants/theme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

interface Props {
  icon: React.ReactNode;            // already-sized Lucide icon (size=22, persona color)
  title: string;
  meta: string;
  onPress?: () => void;
  /** Tints the icon backdrop with persona accent at 15%. Default true. */
  iconTinted?: boolean;
  iconTintColor?: string;
}

export function RowCard({ icon, title, meta, onPress, iconTinted = true, iconTintColor }: Props) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tint = iconTintColor ?? tokens.accent;
  const inner = (
    <>
      <View
        style={[
          styles.iconWrap,
          iconTinted && { backgroundColor: hexAlpha(tint, 0.14) },
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
// Tokens can also arrive as rgba() strings, which have no hex to parse — those
// already carry their own alpha, so they pass through untouched.
function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  let h = color.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
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
      // Untinted fallback only — the tinted case overrides this at render with
      // the caller's accent.
      backgroundColor: t.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: { flex: 1, minWidth: 0 },
    // Typography presets carry the frozen LIGHT colour, so each is re-stated
    // from the active scheme.
    title: { ...Typography.cardTitle, color: t.text, marginBottom: Spacing.xxs },
    meta: { ...Typography.cardMeta, color: t.textSecondary },
  });
