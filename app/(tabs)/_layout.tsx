import { Tabs } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/theme';

function TabIcon({ focused, icon, label }: { focused: boolean; icon: string; label: string }) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.icon, { opacity: focused ? 1 : 0.45 }]}>{icon}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Inter_500Medium',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🏠" label="Home" />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="💪" label="Workouts" />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🥗" label="Nutrition" />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'AI Coach',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🤖" label="AI Coach" />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="📈" label="Progress" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
});
