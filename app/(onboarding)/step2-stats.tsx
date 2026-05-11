import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button } from '@/components/ui';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

type Gender = 'male' | 'female';
type Unit = 'metric' | 'imperial';

export default function Step2Stats() {
  const router = useRouter();
  const { goal } = useLocalSearchParams<{ goal: string }>();

  const [gender, setGender] = useState<Gender>('male');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [unit, setUnit] = useState<Unit>('metric');
  const [height, setHeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');

  const handleContinue = () => {
    const heightMissing = unit === 'metric' ? !height : (!heightFt && !heightIn);
    if (!dob || heightMissing || !weight) { setError('Please fill in all fields.'); return; }
    const [y, m, d] = dob.split('-').map(Number);
    const dobDate = new Date(y, m - 1, d);
    if (isNaN(dobDate.getTime())) { setError('Enter date as YYYY-MM-DD (e.g. 1995-06-15)'); return; }

    const age = Math.floor((Date.now() - dobDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 13 || age > 100) {
      setError('Please enter a valid date of birth (age must be between 13 and 100).');
      return;
    }

    const heightCm = unit === 'metric'
      ? parseFloat(height)
      : (parseFloat(heightFt || '0') * 12 + parseFloat(heightIn || '0')) * 2.54;
    const weightKg = unit === 'metric' ? parseFloat(weight) : parseFloat(weight) * 0.453592;

    if (heightCm < 100 || heightCm > 250 || weightKg < 30 || weightKg > 300) {
      setError('Please enter realistic height and weight values.');
      return;
    }

    setError('');
    router.push({
      pathname: '/(onboarding)/step3-activity',
      params: { goal, gender, dob, heightCm: heightCm.toFixed(1), weightKg: weightKg.toFixed(2) },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OnboardingProgress current={2} total={5} />
        <Text style={styles.headline}>Your stats</Text>
        <Text style={styles.sub}>We need this to calculate your nutrition targets</Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* Gender toggle */}
        <Text style={styles.label}>Gender</Text>
        <View style={styles.toggle}>
          {(['male', 'female'] as Gender[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.toggleBtn, gender === g && styles.toggleBtnActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.toggleText, gender === g && styles.toggleTextActive]}>
                {g === 'male' ? '♂ Male' : '♀ Female'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date of birth */}
        <Text style={styles.label}>Date of Birth</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD (e.g. 1995-06-15)"
          placeholderTextColor={Colors.textTertiary}
          value={dob}
          onChangeText={setDob}
          keyboardType="numbers-and-punctuation"
        />

        {/* Unit toggle */}
        <View style={styles.unitRow}>
          <Text style={styles.label}>Height & Weight</Text>
          <View style={styles.unitToggle}>
            {(['metric', 'imperial'] as Unit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                onPress={() => { setUnit(u); setHeight(''); setHeightFt(''); setHeightIn(''); setWeight(''); }}
              >
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                  {u === 'metric' ? 'kg/cm' : 'lb/in'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          {unit === 'metric' ? (
            <View style={styles.halfField}>
              <Text style={styles.sublabel}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                placeholder="175"
                placeholderTextColor={Colors.textTertiary}
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
              />
            </View>
          ) : (
            <>
              <View style={styles.halfField}>
                <Text style={styles.sublabel}>Feet</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor={Colors.textTertiary}
                  value={heightFt}
                  onChangeText={setHeightFt}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.sublabel}>Inches</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9"
                  placeholderTextColor={Colors.textTertiary}
                  value={heightIn}
                  onChangeText={setHeightIn}
                  keyboardType="decimal-pad"
                />
              </View>
            </>
          )}
          <View style={styles.halfField}>
            <Text style={styles.sublabel}>Weight ({unit === 'metric' ? 'kg' : 'lbs'})</Text>
            <TextInput
              style={styles.input}
              placeholder={unit === 'metric' ? '80' : '176'}
              placeholderTextColor={Colors.textTertiary}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Continue" onPress={handleContinue} fullWidth />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xl },
  headline: { ...Typography.h1, marginBottom: 8 },
  sub: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { color: Colors.error, fontSize: 14, fontFamily: 'Inter_400Regular' },
  label: { ...Typography.label, marginBottom: 8, marginTop: Spacing.md },
  sublabel: { ...Typography.label, marginBottom: 6 },
  input: {
    height: 52, backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text,
  },
  toggle: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: {
    flex: 1, height: 48, borderRadius: Radius.md, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  toggleBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  toggleText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.primary },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: Radius.md, padding: 3 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.sm },
  unitBtnActive: { backgroundColor: Colors.surface },
  unitText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  unitTextActive: { color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.md },
  halfField: { flex: 1 },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
});
