import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

const DIETS = [
  { key: 'standard', icon: '🍽️', title: 'Standard', description: 'Balanced diet with all food groups' },
  { key: 'vegetarian', icon: '🥗', title: 'Vegetarian', description: 'No meat, includes dairy and eggs' },
  { key: 'vegan', icon: '🌱', title: 'Vegan', description: 'Plant-based only' },
  { key: 'keto', icon: '🥑', title: 'Keto', description: 'Very low carb, high fat' },
  { key: 'paleo', icon: '🥩', title: 'Paleo', description: 'Whole foods, no grains or dairy' },
];

export default function Step4Diet() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <OnboardingProgress current={4} total={5} />
        <Text style={styles.headline}>Diet preference</Text>
        <Text style={styles.sub}>This shapes your meal plan suggestions</Text>

        <View style={styles.cards}>
          {DIETS.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.card, selected === d.key && styles.cardSelected]}
              onPress={() => setSelected(d.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{d.icon}</Text>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, selected === d.key && styles.cardTitleSelected]}>{d.title}</Text>
                <Text style={styles.cardDesc}>{d.description}</Text>
              </View>
              {selected === d.key && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue"
          onPress={() => router.push({ pathname: '/(onboarding)/step5-program', params: { ...params, diet: selected! } })}
          disabled={!selected}
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xl },
  headline: { ...Typography.h1, marginBottom: 8 },
  sub: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  cards: { gap: Spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 2, borderColor: 'transparent', gap: Spacing.md,
  },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  icon: { fontSize: 24 },
  cardText: { flex: 1 },
  cardTitle: { ...Typography.bodyMedium },
  cardTitleSelected: { color: Colors.primary },
  cardDesc: { ...Typography.caption, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
});
