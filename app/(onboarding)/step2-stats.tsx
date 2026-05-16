import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { OnboardingProgress } from '@/components/ui/OnboardingProgress';
import { Button } from '@/components/ui';
import { PickerModal, type PickerOption } from '@/components/ui/PickerModal';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

type Gender = 'male' | 'female';
type Unit = 'metric' | 'imperial';

function range(from: number, to: number, step = 1): number[] {
  const arr: number[] = [];
  for (let v = from; v <= to; v += step) arr.push(parseFloat(v.toFixed(1)));
  return arr;
}

const metricHeights: PickerOption[] = range(100, 250).map((v) => ({ label: `${v} cm`, value: String(v) }));
const metricWeights: PickerOption[] = range(30, 300, 0.5).map((v) => ({ label: `${v} kg`, value: String(v) }));
const imperialFt: PickerOption[] = range(4, 7).map((v) => ({ label: `${v} ft`, value: String(v) }));
const imperialIn: PickerOption[] = range(0, 11).map((v) => ({ label: `${v} in`, value: String(v) }));
const imperialWeights: PickerOption[] = range(66, 660).map((v) => ({ label: `${v} lbs`, value: String(v) }));

const MIN_AGE = 13;
const MAX_AGE = 100;
const maxDob = new Date();
maxDob.setFullYear(maxDob.getFullYear() - MIN_AGE);
const minDob = new Date();
minDob.setFullYear(minDob.getFullYear() - MAX_AGE);
const defaultDob = new Date(maxDob);
defaultDob.setFullYear(defaultDob.getFullYear() - 7); // default ~20 years old

export default function Step2Stats() {
  const router = useRouter();
  const { goal } = useLocalSearchParams<{ goal: string }>();

  const [gender, setGender] = useState<Gender>('male');
  const [dob, setDob] = useState<Date>(defaultDob);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [unit, setUnit] = useState<Unit>('metric');
  const [heightCmVal, setHeightCmVal] = useState('170');
  const [heightFtVal, setHeightFtVal] = useState('5');
  const [heightInVal, setHeightInVal] = useState('9');
  const [weightVal, setWeightVal] = useState(unit === 'metric' ? '70' : '154');

  const [openPicker, setOpenPicker] = useState<'heightCm' | 'heightFt' | 'heightIn' | 'weight' | null>(null);

  const [error, setError] = useState('');

  const dobLabel = useMemo(() => {
    return dob.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [dob]);

  const weightOptions = unit === 'metric' ? metricWeights : imperialWeights;

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setDob(date);
  };

  const switchUnit = (u: Unit) => {
    setUnit(u);
    setWeightVal(u === 'metric' ? '70' : '154');
    setHeightCmVal('170');
    setHeightFtVal('5');
    setHeightInVal('9');
  };

  const handleContinue = () => {
    const heightCm = unit === 'metric'
      ? parseFloat(heightCmVal)
      : (parseFloat(heightFtVal) * 12 + parseFloat(heightInVal)) * 2.54;
    const weightKg = unit === 'metric'
      ? parseFloat(weightVal)
      : parseFloat(weightVal) * 0.453592;

    if (heightCm < 100 || heightCm > 250 || weightKg < 30 || weightKg > 300) {
      setError('Please enter realistic height and weight values.');
      return;
    }

    setError('');
    const dobStr = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
    router.push({
      pathname: '/(onboarding)/step3-activity',
      params: { goal, gender, dob: dobStr, heightCm: heightCm.toFixed(1), weightKg: weightKg.toFixed(2) },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OnboardingProgress current={2} total={5} />
        <Text style={styles.headline}>Your stats</Text>
        <Text style={styles.sub}>We need this to calculate your nutrition targets</Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* Gender */}
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
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.pickerBtnIcon}>📅</Text>
          <Text style={styles.pickerBtnText}>{dobLabel}</Text>
          <Text style={styles.pickerChevron}>›</Text>
        </TouchableOpacity>

        {/* iOS inline calendar */}
        {showDatePicker && Platform.OS === 'ios' && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <TouchableOpacity style={styles.dateBackdrop} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
            <View style={styles.dateSheet}>
              <View style={styles.dateHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.dateTitle}>Date of Birth</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dob}
                mode="date"
                display="spinner"
                maximumDate={maxDob}
                minimumDate={minDob}
                onChange={handleDateChange}
                textColor={Colors.text}
              />
            </View>
          </Modal>
        )}

        {/* Android date picker (shows native dialog) */}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={dob}
            mode="date"
            display="calendar"
            maximumDate={maxDob}
            minimumDate={minDob}
            onChange={handleDateChange}
          />
        )}

        {/* Unit toggle */}
        <View style={styles.unitRow}>
          <Text style={styles.label}>Height & Weight</Text>
          <View style={styles.unitToggle}>
            {(['metric', 'imperial'] as Unit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                onPress={() => switchUnit(u)}
              >
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                  {u === 'metric' ? 'kg/cm' : 'lb/in'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Height pickers */}
        <View style={styles.row}>
          {unit === 'metric' ? (
            <View style={styles.halfField}>
              <Text style={styles.sublabel}>Height</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpenPicker('heightCm')}>
                <Text style={styles.pickerBtnText}>{heightCmVal} cm</Text>
                <Text style={styles.pickerChevron}>›</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.halfField}>
                <Text style={styles.sublabel}>Feet</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpenPicker('heightFt')}>
                  <Text style={styles.pickerBtnText}>{heightFtVal} ft</Text>
                  <Text style={styles.pickerChevron}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.halfField}>
                <Text style={styles.sublabel}>Inches</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpenPicker('heightIn')}>
                  <Text style={styles.pickerBtnText}>{heightInVal} in</Text>
                  <Text style={styles.pickerChevron}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          <View style={styles.halfField}>
            <Text style={styles.sublabel}>Weight</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpenPicker('weight')}>
              <Text style={styles.pickerBtnText}>{weightVal} {unit === 'metric' ? 'kg' : 'lbs'}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Continue" onPress={handleContinue} fullWidth />
      </View>

      {/* Height cm picker */}
      <PickerModal
        visible={openPicker === 'heightCm'}
        title="Height (cm)"
        options={metricHeights}
        selectedValue={heightCmVal}
        onSelect={setHeightCmVal}
        onClose={() => setOpenPicker(null)}
      />

      {/* Height ft picker */}
      <PickerModal
        visible={openPicker === 'heightFt'}
        title="Feet"
        options={imperialFt}
        selectedValue={heightFtVal}
        onSelect={setHeightFtVal}
        onClose={() => setOpenPicker(null)}
      />

      {/* Height in picker */}
      <PickerModal
        visible={openPicker === 'heightIn'}
        title="Inches"
        options={imperialIn}
        selectedValue={heightInVal}
        onSelect={setHeightInVal}
        onClose={() => setOpenPicker(null)}
      />

      {/* Weight picker */}
      <PickerModal
        visible={openPicker === 'weight'}
        title={`Weight (${unit === 'metric' ? 'kg' : 'lbs'})`}
        options={weightOptions}
        selectedValue={weightVal}
        onSelect={setWeightVal}
        onClose={() => setOpenPicker(null)}
      />
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
  toggle: { flexDirection: 'row', gap: Spacing.sm },
  toggleBtn: {
    flex: 1, height: 48, borderRadius: Radius.md, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  toggleBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  toggleText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.primary },
  pickerBtn: {
    height: 52, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: Spacing.md,
  },
  pickerBtnIcon: { fontSize: 18, marginRight: 8 },
  pickerBtnText: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },
  pickerChevron: { fontSize: 20, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitToggle: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: Radius.md, padding: 3 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.sm },
  unitBtnActive: { backgroundColor: Colors.surface },
  unitText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  unitTextActive: { color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.md },
  halfField: { flex: 1 },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  dateBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  dateSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dateTitle: { ...Typography.bodyMedium },
  dateCancel: { fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  dateDone: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.primary },
});
