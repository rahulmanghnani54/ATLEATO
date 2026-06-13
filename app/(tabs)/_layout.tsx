import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';

// Minimal SVG tab icons
function HomeIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12L12 3l9 9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function TrainIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 12h12M3 10h2m14 0h2M3 14h2m14 0h2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <Rect x="5" y="9" width="2" height="6" rx="1" stroke={color} strokeWidth="1.6"/>
      <Rect x="17" y="9" width="2" height="6" rx="1" stroke={color} strokeWidth="1.6"/>
    </Svg>
  );
}

function EatIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C7.03 2 3 6.03 3 11h18C21 6.03 16.97 2 12 2z" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <Path d="M3 11v1a9 9 0 0018 0v-1" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <Line x1="12" y1="14" x2="12" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <Line x1="9" y1="20" x2="15" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </Svg>
  );
}

function CoachIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function UserIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8"/>
      <Path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </Svg>
  );
}

function TerritoryIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8"/>
      <Path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </Svg>
  );
}

function TabIcon({
  icon, focused, label, accent,
}: {
  icon: string; focused: boolean; label: string; accent: string;
}) {
  const color = focused ? accent : Colors.textSecondary;
  const iconMap: Record<string, React.ReactElement> = {
    home: <HomeIcon color={color} />,
    train: <TrainIcon color={color} />,
    eat: <EatIcon color={color} />,
    coach: <CoachIcon color={color} />,
    me: <UserIcon color={color} />,
    territory: <TerritoryIcon color={color} />,
  };
  return (
    <View style={styles.tabItem}>
      {/* Active-state pill above the icon — the signature Telegram cue */}
      <View
        style={[
          styles.activePill,
          { backgroundColor: focused ? accent : 'transparent' },
        ]}
      />
      {iconMap[icon]}
      <Text
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
        name="territory"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="territory" focused={focused} label="Run" accent={accent} />,
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
