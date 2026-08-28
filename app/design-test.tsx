import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, Tag, CalorieRing, MacroBar,
  DateNavigator, SkeletonLoader, RecoveryBadge, BottomSheet,
} from '@/components/ui';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { Fonts } from '@/constants/theme';
import { useTheme, useThemedStyles } from '@/lib/theme';

export default function DesignTest() {
  const [date, setDate] = useState(new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const { tokens } = useTheme();
  const styles = useThemedStyles((t) =>
    StyleSheet.create({
      // The crown is full-bleed, so the page inset lives on the body wrapper
      // rather than on CanvasScreen's contentStyle.
      body: { paddingHorizontal: 22 },
      gap: { marginTop: 8 },
      row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
      sheetBody: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, color: t.text },
    }),
  );

  return (
    <CanvasScreen tabBar={false}>
      <Crown
        eyebrow="Internal"
        title="Design"
        accentLine="System"
        meta="Every shared component, one scroll."
      />

      <View style={styles.body}>
        <Section label="Buttons">
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" onPress={() => {}} variant="secondary" style={styles.gap} />
          <Button label="Ghost" onPress={() => {}} variant="ghost" style={styles.gap} />
          <Button label="Danger" onPress={() => {}} variant="danger" style={styles.gap} />
          <Button label="Loading" onPress={() => {}} loading style={styles.gap} />
          <Button label="Disabled" onPress={() => {}} disabled style={styles.gap} />
        </Section>

        <Section label="Tags">
          <View style={styles.row}>
            <Tag label="Protein" color={tokens.macroProtein} bgColor={tokens.surfaceAlt} />
            <Tag label="Carbs" color={tokens.macroCarbs} bgColor={tokens.surfaceAlt} />
            <Tag label="Fat" color={tokens.macroFat} bgColor={tokens.surfaceAlt} />
          </View>
        </Section>

        <Section label="Calorie Ring">
          <CalorieRing consumed={1430} goal={2200} />
        </Section>

        <Section label="Macro Bars">
          <Card>
            <MacroBar label="Protein" consumed={120} goal={180} color={tokens.macroProtein} />
            <MacroBar label="Carbs" consumed={200} goal={250} color={tokens.macroCarbs} />
            <MacroBar label="Fat" consumed={55} goal={73} color={tokens.macroFat} />
          </Card>
        </Section>

        <Section label="Date Navigator">
          <DateNavigator date={date} onDateChange={setDate} />
        </Section>

        <Section label="Skeleton Loaders">
          <SkeletonLoader height={20} />
          <SkeletonLoader height={14} width="60%" style={styles.gap} />
        </Section>

        <Section label="Recovery Badges">
          <View style={styles.row}>
            <RecoveryBadge score={88} size="lg" />
            <RecoveryBadge score={72} size="lg" />
            <RecoveryBadge score={52} size="lg" />
            <RecoveryBadge score={38} size="lg" />
            <RecoveryBadge score={20} size="lg" />
          </View>
        </Section>

        <Section label="Bottom Sheet">
          <Button label="Open Bottom Sheet" onPress={() => setSheetOpen(true)} />
          <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Test Sheet">
            <Text style={styles.sheetBody}>This is the bottom sheet content.</Text>
            <Button label="Close" onPress={() => setSheetOpen(false)} style={{ marginTop: 16 }} />
          </BottomSheet>
        </Section>
      </View>
    </CanvasScreen>
  );
}
