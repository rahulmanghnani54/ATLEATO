import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import {
  House, Dumbbell, UtensilsCrossed, MessageCircle, UserRound,
} from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';

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

function TabIcon({
  icon, focused, label, accent,
}: {
  icon: IconKey; focused: boolean; label: string; accent: string;
}) {
  const color = focused ? accent : Colors.textSecondary;
  const Icon = ICONS[icon];
  return (
    <View style={styles.tabItem}>
      {/* Active-state pill above the icon — the signature Telegram cue */}
      <View
        style={[
          styles.activePill,
          { backgroundColor: focused ? accent : 'transparent' },
        ]}
      />
      {/* Fixed icon slot so every tab's label sits at exactly the same
          baseline. Without this, Lucide's per-icon visual centers vary
          slightly and the Coach label looked taller than its neighbours. */}
      <View style={styles.iconSlot}>
        <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} />
      </View>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[
          styles.tabLabel,
          { color },
          focused && { fontFamily: Fonts.bodyBold },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  // Persona-aware: the active-tab accent matches the user's selected coach.
  // When no profile is loaded yet, fall back to brand orange.
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const accent = persona?.accent ?? Colors.primary;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: accent,
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
  // Direction C tab bar:
  //   - slightly shorter than v0 (78 vs 86)
  //   - softer top border (alpha 0.04 instead of 0.07)
  //   - background slightly warmer than the v0 cold near-black
  tabBar: {
    backgroundColor: 'rgba(13,10,10,0.96)',
    borderTopColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: 1,
    height: 78,
    paddingTop: 10,
    paddingBottom: 22,
  },
  tabItem: {
    alignItems: 'center',
    gap: 4,
    position: 'relative',
    minWidth: 56,
  },
  iconSlot: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  // Tiny persona-colored pill that appears above the active tab icon —
  // the Telegram/Notion convention. Replaces the v0 "all labels are tiny
  // mono caps" indicator pattern.
  activePill: {
    position: 'absolute',
    top: -10,
    width: 22,
    height: 3,
    borderRadius: 2,
  },
  // Direction C label: mixed-case Inter (NOT mono caps).
  tabLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
});
