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

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/**
 * A <Crown> rendered INSIDE a scroller registers here, which hands the status
 * bar to that scroller: only it knows whether the dark crown is still under the
 * bar. A crown pinned OUTSIDE a scroller (onboarding, workout-session) reads
 * null and keeps the bar itself — it never moves.
 */
const CrownSlotContext = createContext<((height: number) => void) | null>(null);

/** Wrap a hand-rolled scroller in this to opt into `useCrownStatusBar`. */
export const CrownSlot = CrownSlotContext.Provider;

export function useCrownSlot() {
  return useContext(CrownSlotContext);
}

/**
 * Keeps the status-bar icons legible over a crown that scrolls.
 *
 * The crown paints its own ink under the bar and needs light icons while it is
 * up there — but once it scrolls away the LIGHT body is what sits behind the
 * bar, and white-on-white leaves the clock and battery invisible.
 *
 * One owner on purpose: two components pushing entries onto RN's StatusBar
 * stack resolve by mount order, and refocusing a scrolled-down tab remounts the
 * crown's entry on top of the scroller's.
 */
export function useCrownStatusBar() {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const [crownHeight, setCrownHeight] = useState(0);
  const [crownGone, setCrownGone] = useState(false);

  const registerCrown = useCallback((height: number) => {
    setCrownHeight((prev) => (prev === height ? prev : height));
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (crownHeight <= 0) return;
      const next = e.nativeEvent.contentOffset.y > crownHeight - insets.top;
      setCrownGone((prev) => (prev === next ? prev : next));
    },
    [crownHeight, insets.top],
  );

  // Scoped to FOCUS, not mount: a crowned tab stays mounted underneath a pushed
  // light screen (profile, add-food), and an unconditional entry on the
  // StatusBar stack would leave that screen with white-on-white icons.
  //
  // Gated on a registered crown so an uncrowned screen — which owns no status
  // bar and has nothing to toggle — is not re-rendered on every focus change.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      if (crownHeight <= 0) return;
      setFocused(true);
      return () => setFocused(false);
    }, [crownHeight]),
  );

  const statusBar =
    crownHeight > 0 && focused ? (
      <StatusBar
        barStyle={crownGone && scheme === 'light' ? 'dark-content' : 'light-content'}
      />
    ) : null;

  return { registerCrown, onScroll, statusBar };
}

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
  const { registerCrown, onScroll, statusBar } = useCrownStatusBar();

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
    <CrownSlot value={registerCrown}>
      {statusBar}
      <ScrollView
        testID={testID}
        style={[container, style]}
        contentContainerStyle={[inner, contentStyle]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
    </CrownSlot>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
