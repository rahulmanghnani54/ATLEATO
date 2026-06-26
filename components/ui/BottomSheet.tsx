import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
  KeyboardAvoidingView, Platform,
 useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(screenHeight);
  const opacity = useSharedValue(0);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      // V2 bug-fix: previously this used withTiming(1, ...) which could
      // fail to reach opacity 1 on some Android devices, leaving the list
      // behind the sheet visible (the 'floating' bug screenshot). Now we
      // set the backdrop opaque immediately when the modal mounts.
      opacity.value = 1;
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    } else {
      translateY.value = withTiming(screenHeight, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setModalVisible)(false);
      });
    }
  }, [visible, screenHeight]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <Modal transparent animationType="none" visible={modalVisible} onRequestClose={onClose}>
      {/* Backdrop — opaque solid layer, covers entire screen, tap to close.
          Solid (not animated) so the underlying list NEVER shows through. */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* KeyboardAvoidingView wraps ONLY the sheet so it slides up with the keyboard */}
      <KeyboardAvoidingView
        style={styles.sheetContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View style={[
          styles.sheet,
          sheetStyle,
          { maxHeight: screenHeight * 0.9, paddingBottom: Spacing.xxl + insets.bottom },
        ]}>
          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fully OPAQUE backdrop (solid app bg) — not a dim overlay. Sheets in this app
  // can stack (e.g. food-search sheet → add-serving sheet), and a translucent
  // backdrop let the list behind bleed through, which read as a "floating" popup.
  // Solid bg makes every sheet a clean, focused surface with nothing showing through.
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.bg },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: -0.2 },
  closeBtn: { fontSize: 18, color: Colors.textSecondary },
});
