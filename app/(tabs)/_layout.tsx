/**
 * Bold Canvas tab bar — a floating, blurred pill.
 *
 * The bar is detached from the screen edge and absolutely positioned, so it no
 * longer reserves layout space of its own. Screens buy that space back with
 * TAB_BAR_SPACE from the canvas kit; the geometry below is arranged so the two
 * agree (see BAR_GAP / BAR_HEIGHT).
 */

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  House, Dumbbell, UtensilsCrossed, MessageCircle, UserRound,
} from 'lucide-react-native';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { TAB_BAR_SPACE } from '@/components/ui/canvas';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';

// Tab bar icons come from Lucide so they match the rest of the app's
// icon language (RowCards, settings rows, etc.) instead of being a
// separate set of one-off custom SVGs.
const ICONS = {
  home:      House,
  train:     Dumbbell,
  eat:       UtensilsCrossed,
  coach:     MessageCircle,
  me:        UserRound,
} as const;
type IconKey = keyof typeof ICONS;

/**
 * Pill geometry. These three must sum to TAB_BAR_SPACE so a screen padded by
 * the kit's constant clears the floating bar with a little air to spare:
 *   BAR_GAP (below the pill) + BAR_HEIGHT (the pill) + clearance (above it).
 */
const BAR_HEIGHT = 64;
const BAR_GAP = 16;          // distance from the safe-area bottom edge
const BAR_INSET = 16;        // distance from the left/right screen edges
const BAR_RADIUS = BAR_HEIGHT / 2;   // fully rounded — a pill, not a card

/**
 * Width of one tab's icon+label slot. The longest labels ("TRAIN", "COACH")
 * are 5 JetBrains Mono glyphs: 5 * (0.6em * 8.5 + 1.36 tracking) = 32.3pt.
 * 46 clears that by ~14pt and still fits the 47.6pt a 320dp screen affords,
 * so the labels survive both the narrowest Android (360dp) and small iPhones.
 */
const LABEL_SLOT = 46;

// 16 + 64 + 16 clearance = 96 = TAB_BAR_SPACE. Referenced (not just noted) so
// the two drift apart loudly at build time rather than silently on screen.
const _GEOMETRY_MATCHES_KIT: 96 = TAB_BAR_SPACE;
void _GEOMETRY_MATCHES_KIT;

function TabIcon({
  icon, focused, label, accent,
}: {
  icon: IconKey; focused: boolean; label: string; accent: string;
}) {
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const Icon = ICONS[icon];
  const color = focused ? tokens.tabActive : tokens.tabInactive;

  // The persona dot is the bar's single accent moment, so it earns a transition
  // rather than snapping between tabs.
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    const next = focused ? 1 : 0;
    on.value = reduced ? next : withTiming(next, { duration: 170 });
  }, [focused, reduced, on]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.3 + on.value * 0.7 }],
  }));

  return (
    <View style={styles.item}>
      {/* Fixed icon slot so every tab's label sits at exactly the same
          baseline. Without this, Lucide's per-icon visual centers vary
          slightly and the Coach label looked taller than its neighbours. */}
      <View style={styles.iconSlot}>
        <Icon size={21} color={color} strokeWidth={focused ? 2.3 : 1.8} />
      </View>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.label, { color }]}
      >
        {label}
      </Text>
      {/* Slot is always present so the row never reflows when focus moves. */}
      <View style={styles.dotSlot}>
        <Animated.View style={[styles.dot, { backgroundColor: accent }, dotStyle]} />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Persona-aware: the active-tab dot matches the user's selected coach.
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const accent = personaAccent(persona, scheme).accent;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: tokens.tabActive,
        tabBarInactiveTintColor: tokens.tabInactive,
        // A pill floating over a raised keyboard reads as a bug, not a design.
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.iconWrap,
        tabBarBackground: () => (
          <BlurView
            // Android's blur is opt-in and costs frames on a bar that is always
            // mounted, so it stays off there; the tint layer below carries the
            // surface instead and the pill reads as solid tokens.tabBar.
            intensity={Platform.OS === 'ios' ? 64 : 0}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={styles.blur}
          >
            {/* Translucency from the token itself — no hardcoded rgba. */}
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.tint,
                { backgroundColor: tokens.tabBar },
              ]}
            />
            {/* Hairline rim keeps the pill's edge legible over pale content. */}
            <View style={[styles.rim, { borderColor: tokens.border }]} />
          </BlurView>
        ),
        tabBarStyle: [
          styles.bar,
          {
            bottom: insets.bottom + BAR_GAP,
            shadowColor: tokens.crown,
            // Android draws no blur (intensity 0), so the pill cannot depend on
            // the BlurView painting anything. Giving the bar itself the surface
            // colour guarantees an opaque pill even if that layer no-ops; the
            // barClip radius below keeps it pill-shaped. iOS stays transparent
            // so its real blur shows through.
            ...(Platform.OS === 'android' ? { backgroundColor: tokens.tabBar } : null),
          },
          // iOS draws the shadow off the view's bounds, so the bar must not
          // clip; the BlurView rounds itself instead. Android clips here and
          // takes its shadow from elevation, which survives overflow: hidden.
          Platform.OS === 'android' && styles.barClip,
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="home" focused={focused} label="Home" accent={accent} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="train" focused={focused} label="Train" accent={accent} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="eat" focused={focused} label="Eat" accent={accent} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="coach" focused={focused} label="Coach" accent={accent} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="me" focused={focused} label="You" accent={accent} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    // start/end, NOT left/right. BottomTabBar's own base style pins the bar with
    // `start: 0, end: 0` (its styles.bottom), and Yoga resolves the logical
    // start/end AFTER left/right no matter which order the styles are merged in.
    // So `left: BAR_INSET, right: BAR_INSET` here lost to its zeros and the pill
    // rendered edge-to-edge: measured on device at [0,2127]-[1080,2295], full
    // 1080px width instead of the expected 42px inset. Overriding the same two
    // properties it sets is what actually wins. (`height` and `bottom` looked
    // fine throughout precisely because nothing upstream sets those.)
    start: BAR_INSET,
    end: BAR_INSET,
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    // No welded edge: the bar floats, so the top border and the opaque
    // background both go. The blur layer paints the surface.
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    // BottomTabBar applies the safe-area inset as padding; the pill already
    // sits above it via `bottom`, so zero it out or the icons ride high.
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    elevation: 14,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  barClip: { overflow: 'hidden' },
  blur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  // Without a real blur behind it the tint has to carry the surface alone, so on
  // Android it must be FULLY opaque. At 0.98 those 2% let scrolling content read
  // straight through the pill — "Recovery check-in" was legible across the tab
  // labels. iOS keeps 0.58 because there is a genuine blur behind it there.
  tint: { opacity: Platform.OS === 'ios' ? 0.58 : 1 },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // NOTE: tabBarItemStyle lands on BottomTabItem's OUTER View. The vertical
  // alignment (`justifyContent: 'flex-start'`) lives on the INNER pressable and
  // no public prop reaches it — so centering has to happen in iconWrap below,
  // not here.
  tabItem: {
    height: BAR_HEIGHT,
    paddingVertical: 0,
  },
  // react-navigation renders whatever `tabBarIcon` returns inside a slot hard-
  // coded to 31pt wide (TabBarIcon's `wrapperUikit`, sized for a bare UIKit
  // glyph). Our icon carries a label, and "TRAIN"/"COACH" measure 32.3pt — so
  // they ellipsised at that ceiling while the shorter three did not. The slot
  // is the clip, not the tab: each tab gets (360 - 2*16)/5 - 10pt of pressable
  // padding = 55.6pt at Android's narrowest common width, so widening the slot
  // to LABEL_SLOT still leaves air on both sides. Overriding here rather than
  // inside TabIcon keeps the badge, which anchors to this slot, correctly placed.
  // `flex: 1` is what centers the tab contents vertically, and it is load-
  // bearing. TabBarIcon's own wrapper is a FIXED 31x28 box (its wrapperUikit),
  // while our icon+label+dot stack is ~41dp tall — so it overflowed the box and,
  // because the pressable around it lays out `flex-start`, everything sat jammed
  // against the top of the pill: measured on device at content 2127-2236 inside
  // a 2127-2295 item, i.e. 0px of space above and 59px below, with the icon
  // glyph clipped by the pill's rounded top edge. Filling the pressable instead
  // lets `item`'s own centering do the work, and it stays correct whatever
  // padding the pressable applies. Our style is merged AFTER wrapperUikit, which
  // is the only reason the fixed height can be overridden at all.
  iconWrap: { width: LABEL_SLOT, flex: 1, justifyContent: 'center' },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconSlot: {
    width: 24, height: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  // Bold Canvas mono micro-label: 8.5px at 0.16em, uppercase.
  label: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    letterSpacing: 1.36,
    textTransform: 'uppercase',
    lineHeight: 11,
  },
  dotSlot: {
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
