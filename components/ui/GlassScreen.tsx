/**
 * GlassScreen — the shared "premium glass" page wrapper used across every
 * top-level tab to keep visual cohesion.
 *
 * Renders:
 *   1. A persona-tinted radial LinearGradient as the page background
 *   2. A secondary emerald glow in the top-right corner
 *   3. SafeAreaView (top edge) wrapping the children
 *
 * Each tab just wraps its scroll/content in <GlassScreen persona={...}>.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { PersonaTheme } from '@/lib/personaTheme';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

export function GlassScreen({
  persona,
  children,
}: {
  persona: PersonaTheme;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      {/* Persona-tinted ambient gradient background. The final stop must be the
          page colour itself, or the gradient ends on a light slab in dark mode. */}
      <LinearGradient
        colors={[
          `${persona.accent}1f`,
          `${persona.accent}08`,
          tokens.bgAlt,
        ]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Secondary emerald glow. 'transparent' is the fade-out stop, not a colour. */}
      <View style={styles.glowSpot} pointerEvents="none">
        <LinearGradient
          colors={[tokens.accentSoft, 'transparent']}
          style={{ flex: 1, borderRadius: 200 }}
        />
      </View>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bgAlt },
    glowSpot: {
      position: 'absolute',
      top: -120, right: -140,
      width: 360, height: 360,
      opacity: 0.7,
    },
  });
