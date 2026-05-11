import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import {
  Button, Card, Tag, CalorieRing, MacroBar,
  DateNavigator, SkeletonLoader, RecoveryBadge, BottomSheet,
} from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function DesignTest() {
  const [date, setDate] = useState(new Date());
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={Typography.h1}>Design System</Text>

        <Text style={styles.section}>Buttons</Text>
        <Button label="Primary" onPress={() => {}} />
        <Button label="Secondary" onPress={() => {}} variant="secondary" style={styles.gap} />
        <Button label="Ghost" onPress={() => {}} variant="ghost" style={styles.gap} />
        <Button label="Danger" onPress={() => {}} variant="danger" style={styles.gap} />
        <Button label="Loading" onPress={() => {}} loading style={styles.gap} />
        <Button label="Disabled" onPress={() => {}} disabled style={styles.gap} />

        <Text style={styles.section}>Tags</Text>
        <View style={styles.row}>
          <Tag label="Protein" color="#3b82f6" bgColor="#eff6ff" />
          <Tag label="Carbs" color="#f59e0b" bgColor="#fffbeb" style={{ marginLeft: 8 }} />
          <Tag label="Fat" color="#ef4444" bgColor="#fef2f2" style={{ marginLeft: 8 }} />
        </View>

        <Text style={styles.section}>Calorie Ring</Text>
        <CalorieRing consumed={1430} goal={2200} />

        <Text style={styles.section}>Macro Bars</Text>
        <Card>
          <MacroBar label="Protein" consumed={120} goal={180} color="#3b82f6" />
          <MacroBar label="Carbs" consumed={200} goal={250} color="#f59e0b" />
          <MacroBar label="Fat" consumed={55} goal={73} color="#ef4444" />
        </Card>

        <Text style={styles.section}>Date Navigator</Text>
        <DateNavigator date={date} onDateChange={setDate} />

        <Text style={styles.section}>Skeleton Loaders</Text>
        <SkeletonLoader height={20} style={styles.gap} />
        <SkeletonLoader height={14} width="60%" style={styles.gap} />

        <Text style={styles.section}>Recovery Badges</Text>
        <View style={styles.row}>
          <RecoveryBadge score={88} size="lg" />
          <RecoveryBadge score={72} size="lg" style={{ marginLeft: 12 }} />
          <RecoveryBadge score={52} size="lg" style={{ marginLeft: 12 }} />
          <RecoveryBadge score={38} size="lg" style={{ marginLeft: 12 }} />
          <RecoveryBadge score={20} size="lg" style={{ marginLeft: 12 }} />
        </View>

        <Text style={styles.section}>Bottom Sheet</Text>
        <Button label="Open Bottom Sheet" onPress={() => setSheetOpen(true)} />
        <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Test Sheet">
          <Text style={Typography.body}>This is the bottom sheet content.</Text>
          <Button label="Close" onPress={() => setSheetOpen(false)} style={{ marginTop: 16 }} />
        </BottomSheet>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.lg, gap: Spacing.sm },
  section: { ...Typography.h3, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  gap: { marginTop: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
