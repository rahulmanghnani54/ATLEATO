/**
 * Coach Reminders screen
 *
 * Lets the user enable two daily notifications styled as incoming calls
 * from their coach:
 *   - 🌅 Wake-up call (default 6:30 AM)
 *   - 💪 Workout reminder (default 6:00 PM)
 *
 * Each can be toggled independently and given its own time.
 * Notification text is in the active coach's voice — see coachCallScheduler.ts.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Platform, Alert, Linking,
} from 'react-native';
import { Bell } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCoachReminders } from '@/hooks/useCoachReminders';
import { getCallCopy, getNextFiringDate, type CallKind } from '@/lib/coachCallScheduler';
import { fireIncomingCall, ensureNotifeePermission } from '@/lib/notifeeCallScheduler';
import { triggerIncomingCall } from '@/lib/wakeupCalls';
import { AuthorizationStatus } from '@notifee/react-native';
import { styleText } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';

function format12h(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm} ${ampm}`;
}

export default function CoachRemindersScreen() {
  const router = useRouter();
  const { prefs, loading, permission, toggleWakeup, toggleWorkout, setTime, persona } = useCoachReminders();
  const [openPicker, setOpenPicker] = useState<CallKind | null>(null);

  const wakeupCopy  = getCallCopy(persona, 'wakeup');
  const workoutCopy = getCallCopy(persona, 'workout');

  const onTimeChange = (kind: CallKind) => (_evt: any, selected?: Date) => {
    // Android's picker fires once and closes; iOS's spinner stays open.
    if (Platform.OS === 'android') setOpenPicker(null);
    if (!selected) return;
    setTime(kind, selected.getHours(), selected.getMinutes());
  };

  const pickerDate = (h: number, m: number): Date => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  const handleEnableWithPermissionCheck = async (kind: CallKind) => {
    const currentlyOn = kind === 'wakeup' ? prefs.wakeupEnabled : prefs.workoutEnabled;
    if (kind === 'wakeup')  toggleWakeup();  else toggleWorkout();
    if (!currentlyOn && permission === 'denied') {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications for Atleato in your phone Settings, then try again.',
      );
    }
  };

  /**
   * Fire a real Notifee-backed CALL notification right now so the user can
   * see/feel the actual incoming-call UI (not just a notification banner).
   *
   * First: explicitly request notification permission — triggers the Android
   * 13+ POST_NOTIFICATIONS popup the very first time, or opens app Settings
   * if previously denied.
   */
  const handleTestCall = async (kind: CallKind) => {
    // 1. Permission request — triggers Android 13 popup OR opens settings
    let status: AuthorizationStatus;
    try {
      status = await ensureNotifeePermission();
    } catch (e: any) {
      Alert.alert('Permission request failed', e?.message ?? String(e));
      return;
    }
    if (status === AuthorizationStatus.DENIED) {
      Alert.alert(
        'Notifications blocked',
        'Opened your phone settings — turn on Notifications for Atleato and try again.',
      );
      return;
    }

    // 2. Fire the incoming call: a full-screen Notifee ring + looping ringtone
    //    (triggerIncomingCall → startPersistentRing). Full volume, vibration,
    //    and a lock-screen takeover via the full-screen intent — what actually
    //    wakes people up. Plain notifications get slept through.
    try {
      await triggerIncomingCall({
        persona: persona.id,
        reason: kind === 'wakeup' ? 'WAKE UP' : 'WORKOUT TIME',
      });
    } catch (e: any) {
      // Fall back to the scheduled-notification path if the ring fails to start.
      if (__DEV__) console.warn('[wakeup] ring fire failed, falling back:', e?.message);
      try {
        await fireIncomingCall({ kind, personaId: persona.id, isTest: true });
      } catch (e2: any) {
        Alert.alert(
          'Could not start call',
          `Reason: ${e2?.message ?? String(e2)}\n\nCheck: Notifications + Battery → Unrestricted for Atleato.`,
        );
        return;
      }
    }

    // Also open the in-app call UI immediately so testing on an unlocked
    // screen still feels like a call.
    router.push({
      pathname: '/incoming-call',
      params: { kind, personaId: persona.id },
    } as any);
  };

  /**
   * Open Android's per-app notification settings so the user can toggle
   * "Allow full screen notifications" — Android 14+ silently downgrades
   * full-screen intent to a banner unless this is on. Deep-links to the
   * exact page (not the generic app info screen).
   */
  const openFullScreenSettings = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Full-screen calls are an Android feature.');
      return;
    }
    Alert.alert(
      'Enable full-screen calls',
      "Opening Android Settings. Look for:\n\n• Allow full screen notifications → ON\n• Notification category 'Coach Incoming Calls' → set to Urgent\n\nThen come back and tap 'Test Call' to verify.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              // Try the exact notification-settings intent first
              await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
                { key: 'android.provider.extra.APP_PACKAGE', value: 'com.madsales.atleato' },
              ]);
            } catch {
              // Fallback: generic app info page
              await Linking.openSettings();
            }
          },
        },
      ],
    );
  };

  /** Format next-fire datetime in user-friendly form. */
  const formatNextFire = (hour: number, minute: number) => {
    const next = getNextFiringDate(hour, minute);
    const isToday = next.toDateString() === new Date().toDateString();
    const dayLabel = isToday ? 'today' : 'tomorrow';
    const timeLabel = format12h(hour, minute);
    return `Next call: ${dayLabel} at ${timeLabel}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>COACH CALLS</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Ringtone shortcut — at the top so it's discoverable */}
        <TouchableOpacity
          style={[styles.ringtoneRow, { borderColor: persona.accent }]}
          onPress={() => router.push('/ringtone-picker' as any)}
          activeOpacity={0.85}
        >
          <Bell size={22} color={persona.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ringtoneLabel, { color: persona.accent }]}>Ringtone</Text>
            <Text style={styles.ringtoneHint}>
              Choose what plays when the coach calls — or import your own.
            </Text>
          </View>
          <Text style={[styles.ringtoneArrow, { color: persona.accent }]}>→</Text>
        </TouchableOpacity>

        {/* Full-screen permission shortcut — needed for true incoming-call UI
            on Android 14+. Without this toggle, the call shows as a banner
            even though everything else is wired correctly. */}
        {Platform.OS === 'android' && (
          <TouchableOpacity
            style={[styles.ringtoneRow, { borderColor: Colors.warning + '88', marginTop: 10 }]}
            onPress={openFullScreenSettings}
            activeOpacity={0.85}
          >
            <Bell size={22} color={Colors.warning} fill={Colors.warning + '40'} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.ringtoneLabel, { color: Colors.warning }]}>Enable full-screen calls</Text>
              <Text style={styles.ringtoneHint}>
                Required on Android 14+. Without this, calls only show as banners.
              </Text>
            </View>
            <Text style={[styles.ringtoneArrow, { color: Colors.warning }]}>→</Text>
          </TouchableOpacity>
        )}

        {/* Persona-aware hero */}
        <View style={[styles.hero, { backgroundColor: persona.accent }]}>
          <Text style={[styles.heroEyebrow, { color: persona.ink, opacity: 0.7 }]}>
            ✦ {styleText(persona, `CALLS FROM ${persona.shortName}`)}
          </Text>
          <Text style={[styles.heroTitle, { color: persona.ink }]}>
            {styleText(persona, "Let your coach\nreach out.")}
          </Text>
          <Text style={[styles.heroSub, { color: persona.ink, opacity: 0.75 }]}>
            Schedule daily wake-up and workout reminders that pop up like an incoming call —
            in {persona.shortName}&apos;s voice.
          </Text>
        </View>

        {loading ? null : (
          <>
            {/* ── WAKE-UP CALL ── */}
            <ReminderCard
              icon="🌅"
              title="WAKE-UP CALL"
              enabled={prefs.wakeupEnabled}
              onToggle={() => handleEnableWithPermissionCheck('wakeup')}
              time={format12h(prefs.wakeupHour, prefs.wakeupMinute)}
              onPressTime={() => setOpenPicker('wakeup')}
              previewTitle={wakeupCopy.title}
              previewBody={wakeupCopy.body}
              accent={persona.accent}
              nextFireLabel={prefs.wakeupEnabled ? formatNextFire(prefs.wakeupHour, prefs.wakeupMinute) : undefined}
              onTestPress={() => handleTestCall('wakeup')}
            />

            {/* ── WORKOUT REMINDER ── */}
            <ReminderCard
              icon="💪"
              title="WORKOUT REMINDER"
              enabled={prefs.workoutEnabled}
              onToggle={() => handleEnableWithPermissionCheck('workout')}
              time={format12h(prefs.workoutHour, prefs.workoutMinute)}
              onPressTime={() => setOpenPicker('workout')}
              previewTitle={workoutCopy.title}
              previewBody={workoutCopy.body}
              accent={persona.accent}
              nextFireLabel={prefs.workoutEnabled ? formatNextFire(prefs.workoutHour, prefs.workoutMinute) : undefined}
              onTestPress={() => handleTestCall('workout')}
            />

            {/* Permission hint */}
            {permission === 'denied' && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  ⚠ Notifications are blocked. Open your phone&apos;s Settings → Apps → Atleato →
                  Notifications to allow them.
                </Text>
              </View>
            )}

            {/* Footer note */}
            <Text style={styles.footnote}>
              Notifications use your phone&apos;s default sound. Times use local time of your device.
              Switching coaches changes the call text automatically.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Time pickers (rendered on top of the screen when open) */}
      {openPicker === 'wakeup' && (
        <DateTimePicker
          mode="time"
          value={pickerDate(prefs.wakeupHour, prefs.wakeupMinute)}
          onChange={onTimeChange('wakeup')}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        />
      )}
      {openPicker === 'workout' && (
        <DateTimePicker
          mode="time"
          value={pickerDate(prefs.workoutHour, prefs.workoutMinute)}
          onChange={onTimeChange('workout')}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reminder card sub-component
// ─────────────────────────────────────────────────────────────────────────────

function ReminderCard({
  icon, title, enabled, onToggle, time, onPressTime, previewTitle, previewBody, accent,
  nextFireLabel, onTestPress,
}: {
  icon: string;
  title: string;
  enabled: boolean;
  onToggle: () => void;
  time: string;
  onPressTime: () => void;
  previewTitle: string;
  previewBody: string;
  accent: string;
  nextFireLabel?: string;
  onTestPress: () => void;
}) {
  return (
    <View style={[styles.card, enabled && { borderColor: accent }]}>
      {/* Top row: icon, title, toggle */}
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>{icon}</Text>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#3a3a3a', true: accent }}
          thumbColor="#fff"
        />
      </View>

      {/* Time row */}
      <TouchableOpacity
        style={[styles.timeRow, !enabled && styles.timeRowDisabled]}
        onPress={onPressTime}
        disabled={!enabled}
        activeOpacity={0.7}
      >
        <Text style={styles.timeRowLabel}>TIME</Text>
        <Text style={[styles.timeRowValue, { color: enabled ? accent : Colors.textTertiary }]}>
          {time}
        </Text>
        <Text style={[styles.timeRowChevron, !enabled && { color: Colors.textTertiary }]}>›</Text>
      </TouchableOpacity>

      {/* Preview of the actual notification */}
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>NOTIFICATION PREVIEW</Text>
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>{previewTitle}</Text>
          <Text style={styles.previewBody}>{previewBody}</Text>
        </View>
      </View>

      {/* Next-fire hint */}
      {nextFireLabel && (
        <Text style={[styles.nextFire, { color: accent }]}>⏰  {nextFireLabel}</Text>
      )}

      {/* TEST NOW button — always available, even when reminder is off */}
      <TouchableOpacity
        style={[styles.testBtn, { borderColor: accent }]}
        onPress={onTestPress}
        activeOpacity={0.7}
      >
        <Text style={[styles.testBtnText, { color: accent }]}>
          ▶  TEST NOW — fires in 5 seconds
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 15, color: Colors.text, letterSpacing: 0.4 },

  scroll: { padding: Spacing.md, paddingBottom: 40 },

  // Ringtone shortcut row (top of the screen)
  ringtoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 14,
  },
  ringtoneEmoji: { fontSize: 22 },
  ringtoneLabel: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  ringtoneHint:  { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },
  ringtoneArrow: { fontFamily: Fonts.display, fontSize: 20 },

  hero: {
    borderRadius: 8, padding: 18, marginBottom: 18,
  },
  heroEyebrow: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.6, marginBottom: 6 },
  heroTitle: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, marginTop: 10, lineHeight: 19 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, marginBottom: 14,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 20 },
  cardTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.text, letterSpacing: 0.4 },

  timeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: Colors.background, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  timeRowDisabled: { opacity: 0.5 },
  timeRowLabel: { flex: 1, fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.4 },
  timeRowValue: { fontFamily: Fonts.display, fontSize: 20, letterSpacing: -0.3 },
  timeRowChevron: { fontSize: 22, color: Colors.textSecondary, marginLeft: 8 },

  preview: { marginTop: 14 },
  previewLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary, letterSpacing: 1.4, marginBottom: 6 },
  previewBox: {
    backgroundColor: Colors.background, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
  },
  previewTitle: { fontFamily: Fonts.bodySemi, fontSize: 13, color: Colors.text, marginBottom: 4 },
  previewBody: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  nextFire: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.8,
    marginTop: 12, textAlign: 'center',
  },
  testBtn: {
    marginTop: 10, paddingVertical: 10, borderWidth: 1, borderRadius: 4,
    alignItems: 'center',
  },
  testBtnText: { fontFamily: Fonts.display, fontSize: 11, letterSpacing: 0.6 },

  warningCard: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 4, padding: 12, marginBottom: 14,
  },
  warningText: { fontFamily: Fonts.body, fontSize: 12, color: '#fca5a5', lineHeight: 17 },

  footnote: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    textAlign: 'center', lineHeight: 14, letterSpacing: 0.4,
    marginTop: 8, fontStyle: 'italic',
  },
});
