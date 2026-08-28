import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, Platform,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { Spacing } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

export interface PickerOption {
  label: string;
  value: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

// iOS-style rolling wheel. An odd number of visible rows; the CENTER row is the
// selection. Scrolling snaps to each row; the value under the center band is
// committed on "Done" (or when you tap a row).
const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;                       // must be odd
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const CENTER_OFFSET = Math.floor(VISIBLE_ROWS / 2); // rows above center
const PAD = ITEM_HEIGHT * CENTER_OFFSET;      // lets first/last row reach the centre

export function PickerModal({ visible, title, options, selectedValue, onSelect, onClose }: Props) {
  const listRef = useRef<FlatList<PickerOption>>(null);
  const initialIndex = Math.max(0, options.findIndex((o) => o.value === selectedValue));
  const [centerIndex, setCenterIndex] = useState(initialIndex);
  const styles = useThemedStyles(makeStyles);

  // Jump to the current value each time the wheel opens.
  useEffect(() => {
    if (!visible) return;
    setCenterIndex(initialIndex);
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: initialIndex * ITEM_HEIGHT, animated: false });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const indexFromOffset = (y: number) =>
    Math.max(0, Math.min(options.length - 1, Math.round(y / ITEM_HEIGHT)));

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    setCenterIndex((prev) => (prev === idx ? prev : idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCenterIndex(indexFromOffset(e.nativeEvent.contentOffset.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length]);

  const confirm = () => {
    const opt = options[centerIndex];
    if (opt) onSelect(opt.value);
    onClose();
  };

  const tapRow = (index: number) => {
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: true });
    setCenterIndex(index);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={confirm} hitSlop={10}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.wheelWrap}>
          {/* Centre selection band (fixed, behind the rows) */}
          <View style={styles.centerBand} pointerEvents="none" />

          <FlatList
            ref={listRef}
            data={options}
            keyExtractor={(item) => item.value}
            extraData={centerIndex}
            getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
            initialScrollIndex={initialIndex}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={onMomentumEnd}
            contentContainerStyle={{ paddingVertical: PAD }}
            renderItem={({ item, index }) => {
              const dist = Math.abs(index - centerIndex);
              const selected = dist === 0;
              return (
                <TouchableOpacity activeOpacity={0.7} style={styles.item} onPress={() => tapRow(index)}>
                  <Text
                    style={[
                      styles.itemText,
                      selected && styles.itemTextSelected,
                      dist === 1 && styles.itemTextNear,
                      dist >= 2 && styles.itemTextFar,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.overlay },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    title: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: t.text },
    cancel: { fontSize: 16, fontFamily: 'Inter_400Regular', color: t.textSecondary },
    // 16px emerald as text needs the AA-safe deep tone, not the fill emerald.
    done: { fontSize: 16, fontFamily: 'Inter_700Bold', color: t.accentText },

    wheelWrap: { height: WHEEL_HEIGHT, position: 'relative' },
    centerBand: {
      position: 'absolute',
      left: 12, right: 12,
      top: PAD,
      height: ITEM_HEIGHT,
      borderRadius: 10,
      backgroundColor: t.accentSoft,
      borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: t.borderStrong,
    },
    item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    itemText: { fontSize: 20, fontFamily: 'Inter_500Medium', color: t.textSecondary },
    itemTextSelected: { fontSize: 22, fontFamily: 'Inter_700Bold', color: t.accentText },
    itemTextNear: { color: t.text, opacity: 0.9 },
    itemTextFar: { color: t.textTertiary, opacity: 0.55 },
  });
