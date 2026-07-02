/**
 * RewardChestModal — variable-reward post-workout reveal.
 *
 * Lifecycle:
 *   1. Modal opens with a tappable closed chest (🎁) + "Tap to open" hint
 *   2. User taps → rolls a tier via openChest() + animates the reveal
 *   3. Drop is displayed (tier color, emoji, title, body)
 *   4. User taps "CONTINUE" → onClose() fires
 *
 * The reward is rolled ONLY after the user taps the chest (intent matters
 * for Skinner-box effect). If they dismiss without tapping, no drop is rolled.
 */
import { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { openChest, tierStyle, type Drop } from '@/lib/rewardChest';
import type { PersonaTheme } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export function RewardChestModal({
  visible,
  persona,
  onClose,
}: {
  visible: boolean;
  persona: PersonaTheme;
  onClose: () => void;
}) {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [rolling, setRolling] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  const handleOpen = async () => {
    if (rolling || drop) return;
    setRolling(true);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.3, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.back(2)),
      }),
      Animated.timing(scale, {
        toValue: 0.8, duration: 180, useNativeDriver: true,
      }),
    ]).start();

    const d = await openChest(persona);
    setDrop(d);
    setRolling(false);
    Animated.timing(fade, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();
  };

  const handleContinue = () => {
    // Reset for next time
    setDrop(null);
    setRolling(false);
    scale.setValue(1);
    fade.setValue(0);
    onClose();
  };

  const ts = drop ? tierStyle(drop.tier) : null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, ts && { borderColor: ts.accent, shadowColor: ts.glow }]}>
          {!drop ? (
            <>
              <Text style={[styles.label, { color: persona.accent }]}>
                ✦ REWARD CHEST · TAP TO OPEN
              </Text>
              <TouchableOpacity onPress={handleOpen} activeOpacity={0.7} disabled={rolling}>
                <Animated.Text style={[styles.chestEmoji, { transform: [{ scale }] }]}>
                  🎁
                </Animated.Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                {rolling ? 'rolling…' : `${persona.shortName} stashed something for you.`}
              </Text>
            </>
          ) : (
            <Animated.View style={[{ opacity: fade, alignItems: 'center' }]}>
              <Text style={[styles.tierLabel, { color: ts!.color }]}>{ts!.label}</Text>
              <Text style={styles.dropEmoji}>{drop.emoji}</Text>
              <Text style={[styles.dropTitle, { color: ts!.color }]}>{drop.title}</Text>
              <Text style={styles.dropBody}>{drop.body}</Text>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: ts!.accent }]}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <Text style={[styles.continueText, { color: Colors.text }]}>
                  CONTINUE
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.borderStrong,
    borderRadius: 12, padding: 28, alignItems: 'center', width: '100%',
    shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  label: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginBottom: 18 },
  chestEmoji: { fontSize: 96, textAlign: 'center', marginBottom: 14 },
  hint: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  tierLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 2, marginBottom: 12 },
  dropEmoji: { fontSize: 72, marginBottom: 12 },
  dropTitle: { fontFamily: Fonts.display, fontSize: 22, letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  dropBody:  { fontFamily: Fonts.body, fontSize: 13, color: Colors.text, lineHeight: 19, textAlign: 'center', marginBottom: 22, paddingHorizontal: 4 },

  continueBtn: {
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: 4,
  },
  continueText: { fontFamily: Fonts.display, fontSize: 12, letterSpacing: 1.2 },
});
