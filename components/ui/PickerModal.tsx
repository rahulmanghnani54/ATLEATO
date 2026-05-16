import { useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, Platform,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

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

const ITEM_HEIGHT = 52;

export function PickerModal({ visible, title, options, selectedValue, onSelect, onClose }: Props) {
  const listRef = useRef<FlatList>(null);
  const selectedIndex = options.findIndex((o) => o.value === selectedValue);

  useEffect(() => {
    if (!visible || selectedIndex < 0) return;
    // Scroll to selected item after modal renders
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: selectedIndex, animated: false, viewPosition: 0.5 });
    }, 100);
    return () => clearTimeout(timer);
  }, [visible, selectedIndex]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={options}
          keyExtractor={(item) => item.value}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
          onScrollToIndexFailed={({ index }) => {
            // Fallback: scroll to offset directly
            listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT - ITEM_HEIGHT * 2, animated: false });
          }}
          renderItem={({ item }) => {
            const isSelected = item.value === selectedValue;
            return (
              <TouchableOpacity
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => { onSelect(item.value); onClose(); }}
              >
                <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                  {item.label}
                </Text>
                {isSelected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          }}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          initialScrollIndex={selectedIndex >= 0 ? selectedIndex : undefined}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { ...Typography.bodyMedium },
  cancel: { fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  done: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.primary },
  list: { flex: 1 },
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemSelected: { backgroundColor: Colors.primaryLight },
  itemText: { flex: 1, fontSize: 17, fontFamily: 'Inter_400Regular', color: Colors.text },
  itemTextSelected: { fontFamily: 'Inter_600SemiBold', color: Colors.primary },
  check: { fontSize: 18, color: Colors.primary },
});
