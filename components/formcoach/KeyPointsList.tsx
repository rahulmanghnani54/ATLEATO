/**
 * KeyPointsList — the 3–5 imperative lines under a technique clip.
 *
 * Tick rows, not bullets or numbers: the lines are things to DO, and the
 * same tick vocabulary already means "included / covered" on the paywall
 * (paywall.tsx renderFeature), so it carries no new meaning to learn. The
 * accent is spent on the ticks alone; the copy stays in page ink so it reads
 * as instruction rather than decoration.
 *
 * Rows are separated by a hairline, never boxed — a card per point would
 * turn four short sentences into four competing surfaces.
 */
import { type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Fonts } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

export interface KeyPointsListProps {
  points: string[];
  /** Persona accent — used for the ticks only. */
  accent: string;
}

const FONT_SIZE = 15;
const LINE_HEIGHT = FONT_SIZE * 1.5;
const TICK = 15;

export function KeyPointsList({ points, accent }: KeyPointsListProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);
  if (points.length === 0) return null;

  return (
    <View accessibilityRole="list">
      {points.map((point, i) => (
        // Index in the key: two entries can legitimately share text and must
        // still both render.
        <View key={`${i}:${point}`} style={[styles.row, i > 0 && styles.rowRule]}>
          {/* Wrapped so the tick sits on the FIRST line's centre when a point
              wraps, instead of floating to the middle of a two-line row. */}
          <View style={styles.tick}>
            <Check size={TICK} color={accent} strokeWidth={2.6} />
          </View>
          <Text style={styles.text}>{point}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 11,
    },
    rowRule: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    tick: {
      height: LINE_HEIGHT,
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      fontFamily: Fonts.body,
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      letterSpacing: -0.1,
      color: t.text,
    },
  });
