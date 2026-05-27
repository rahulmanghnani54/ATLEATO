/**
 * SectionHeader — Strava-style mono label with persona-accent bar and rule.
 * Used to separate scrollable screens into clear scannable groups.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

export function SectionHeader({
  label,
  accent,
  marginTop = 28,
}: {
  label: string;
  accent: string;
  marginTop?: number;
}) {
  return (
    <View style={[styles.row, { marginTop }]}>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <Text style={[styles.text, { color: accent }]}>{label}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 14,
  },
  bar: { width: 3, height: 12, borderRadius: 1.5 },
  text: {
    fontFamily: Fonts.mono, fontSize: 11,
    letterSpacing: 2.2, fontWeight: '700',
  },
  rule: {
    flex: 1, height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
