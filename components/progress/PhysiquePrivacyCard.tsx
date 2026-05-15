import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const DISMISSED_KEY = 'physique_privacy_dismissed';

export function PhysiquePrivacyCard() {
  const [visible, setVisible] = useState(false);

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
        <Text style={styles.title}>YOUR PHOTOS ARE PRIVATE</Text>
        <Text style={styles.text}>
          Photos are encrypted on your device before upload. Only you can see them — not even our servers.
        </Text>
      </View>
      <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}>
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(57,224,138,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(57,224,138,0.2)',
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
    color: Colors.success,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  text: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  dismissBtn: { padding: 2 },
  dismissText: { fontSize: 14, color: Colors.textTertiary },
});
