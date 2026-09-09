import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fonts, Spacing } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

const DISMISSED_KEY = 'physique_privacy_dismissed';

export function PhysiquePrivacyCard() {
  const [visible, setVisible] = useState(false);
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  const dismiss = async () => {
    await AsyncStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🔒</Text>
      <View style={styles.body}>
        <Text style={styles.title}>HOW YOUR PHOTOS ARE HANDLED</Text>
        {/* This card is the consent basis for the whole feature, so it has to
            describe what actually happens. It previously said "Only you can see
            them — not even our servers", which was false: the stored blob really
            is encrypted with a device-held key, but hooks/usePhysiqueCheckins.ts
            also sends the PLAINTEXT jpeg to the analyze-physique function, which
            forwards it to Anthropic for scoring on every check-in. */}
        <Text style={styles.text}>
          Stored encrypted with a key that never leaves this device. To score a check-in,
          the photo is sent once to our AI coach. It is never used to train any model.
        </Text>
      </View>
      <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}>
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      // Was a hand-mixed emerald wash from the retired v0 ramp; accentSoft is
      // the same idea at the tone each scheme actually needs.
      backgroundColor: t.accentSoft,
      borderWidth: 1,
      borderColor: t.accentLine,
      borderRadius: 6,
      padding: Spacing.md,
      marginBottom: 14,
      gap: 10,
    },
    icon: { fontSize: 20, marginTop: 1 },
    body: { flex: 1 },
    title: {
      fontFamily: Fonts.mono,
      fontSize: 9,
      color: t.success,
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    text: {
      fontFamily: Fonts.body,
      fontSize: 12,
      color: t.textSecondary,
      lineHeight: 18,
    },
    dismissBtn: { padding: 2 },
    dismissText: { fontSize: 14, color: t.textTertiary },
  });
