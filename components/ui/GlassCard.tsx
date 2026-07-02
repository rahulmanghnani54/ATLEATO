/**
 * GlassCard — the shared frosted-glass card used across every tab.
 * Single semi-transparent tinted layer over the parent's gradient bg.
 * Avoids expo-blur which has Android Fabric issues.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors } from '../../constants/theme';

export function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.tint} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
  },
  content: { padding: 18 },
});
