/**
 * CanvasScreen — the Bold Canvas page wrapper.
 *
 * Full-bleed to the TOP by default: key screens open with <Crown>, which is a
 * dark block that must run under the status bar and paints its own inset. A
 * screen with no crown passes `topInset` to get that padding back.
 *
 * The bottom reserve is the tab bar's own height PLUS the device's home-indicator
 * inset — the tab bar is configured with a fixed height that does not include the
 * safe area, so content would otherwise sit under it on gesture-nav devices.
 */

import { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/**
 * Room a scrolling screen must leave below its last element so nothing hides
 * behind the tab bar. Screens that build their own scroll container should pad
 * by this too, rather than guessing.
 */
export const TAB_BAR_SPACE = 96;

export interface CanvasScreenProps {
  children: ReactNode;
  /** Wrap children in a ScrollView. Default true. */
  scroll?: boolean;
  /** Pad the top by the status-bar inset. Leave false when the screen opens with <Crown>. */
  topInset?: boolean;
  /** Reserve TAB_BAR_SPACE at the bottom. Set false on pushed/modal screens with no tab bar. */
  tabBar?: boolean;
  /** Extra bottom padding on top of the reserved space. */
  bottomSpace?: number;
  refreshControl?: ScrollViewProps['refreshControl'];
  /** Applied to the scroll content (or to the inner View when scroll={false}). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Applied to the outer container. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CanvasScreen({
  children,
  scroll = true,
  topInset = false,
  tabBar = true,
  bottomSpace = 0,
  refreshControl,
  contentStyle,
  style,
  testID,
}: CanvasScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = topInset ? insets.top : 0;
  const paddingBottom =
    (tabBar ? TAB_BAR_SPACE + insets.bottom : insets.bottom) + bottomSpace;

  const container: ViewStyle = { flex: 1, backgroundColor: tokens.bg };
  const inner: ViewStyle = { paddingTop, paddingBottom };

  if (!scroll) {
    return (
      <View testID={testID} style={[container, style]}>
        <View style={[styles.fill, inner, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={[container, style]}
      contentContainerStyle={[inner, contentStyle]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
