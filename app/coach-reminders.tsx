/**
 * Coach Reminders screen — Bold Canvas.
 *
 * Lets the user enable two daily notifications styled as incoming calls
 * from their coach:
 *   - 🌅 Wake-up call (default 6:30 AM)
 *   - 💪 Workout reminder (default 6:00 PM)
 *
 * Each can be toggled independently and given its own time.
 * Notification text is in the active coach's voice — see coachCallScheduler.ts.
 *
 * The crown carries the coach; the light body gives each reminder its clock as
 * an oversized numeral. Every scheduling call, permission prompt and channel
 * setup below is byte-for-byte the pre-migration behaviour — this screen drives
 * real alarms, so only its presentation moved.
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, Switch, Platform, Alert, Linking,
} from 'react-native';
import { Bell, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useCoachReminders } from '@/hooks/useCoachReminders';
import { getCallCopy, getNextFiringDate, type CallKind } from '@/lib/coachCallScheduler';
import { personaAccent, styleText } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, Hairline, ListRow, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

function format12h(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm} ${ampm}`;
}

/** Split "6:30 AM" into the numeral and its meridiem so the two can be typeset apart. */
function splitClock(time: string): { clock: string; meridiem: string } {
  const [clock, meridiem = ''] = time.split(' ');
  return { clock, meridiem };
}

export default function CoachRemindersScreen() {
  const router = useRouter();
  const { prefs, loading, permission, toggleWakeup, toggleWorkout, setTime, persona } = useCoachReminders();
  const [openPicker, setOpenPicker] = useState<CallKind | null>(null);
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so its tint always resolves against
  // the dark triplet — the light accent would sink into the ink.
  const crownTint = personaAccent(persona, 'dark').accent;

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
        'Enable notifications for Evulto in your phone Settings, then try again.',
      );
    }
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

  // Held back until the prefs load, so the crown never advertises the defaults
  // as if they were the user's saved schedule.
  const pills = loading
    ? undefined
    : [
        `Wake-up ${prefs.wakeupEnabled ? format12h(prefs.wakeupHour, prefs.wakeupMinute) : 'off'}`,
        `Workout ${prefs.workoutEnabled ? format12h(prefs.workoutHour, prefs.workoutMinute) : 'off'}`,
      ];

  return (
    <View style={styles.root}>
      <CanvasScreen tabBar={false} bottomSpace={28}>
        <Crown
          eyebrow={styleText(persona, `✦ Coach calls · ${persona.shortName}`)}
          title={styleText(persona, 'Let your coach')}
          accentLine={styleText(persona, 'reach out.')}
          meta={`Schedule daily wake-up and workout reminders that pop up like an incoming call — in ${persona.shortName}'s voice.`}
          pills={pills}
          accent={crownTint}
          onBack={() => router.back()}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          {/* Ringtone + full-screen shortcuts stay at the very top of the body so
              they remain the first thing discovered, as before. */}
          <Section label="Sound & delivery" style={styles.firstSection}>
            <ListRow
              title="Ringtone"
              subtitle="Choose what plays when the coach calls — or import your own."
              onPress={() => router.push('/ringtone-picker' as any)}
              last={Platform.OS !== 'android'}
              right={
                <View style={styles.rowTrail}>
                  <Bell size={18} color={pa.accentText} />
                  <ChevronRight size={16} color={tokens.textTertiary} />
                </View>
              }
            />

            {/* Full-screen permission shortcut — needed for true incoming-call UI
                on Android 14+. Without this toggle, the call shows as a banner
                even though everything else is wired correctly. */}
            {Platform.OS === 'android' && (
              <ListRow
                title="Enable full-screen calls"
                subtitle="Required on Android 14+. Without this, calls only show as banners."
                onPress={openFullScreenSettings}
                last
                right={
                  <View style={styles.rowTrail}>
                    <Bell size={18} color={tokens.warning} fill={tokens.warning} />
                    <ChevronRight size={16} color={tokens.textTertiary} />
                  </View>
                }
              />
            )}
          </Section>

          {loading ? (
            <Section label="Daily calls" contentStyle={styles.blockStack}>
              <Skeleton height={238} radius={26} />
              <Skeleton height={238} radius={26} />
            </Section>
          ) : (
            <>
              <Section label="Daily calls" contentStyle={styles.blockStack}>
                {/* ── WAKE-UP CALL ── */}
                <ReminderBlock
                  icon="🌅"
                  title="WAKE-UP CALL"
                  enabled={prefs.wakeupEnabled}
                  onToggle={() => handleEnableWithPermissionCheck('wakeup')}
                  time={format12h(prefs.wakeupHour, prefs.wakeupMinute)}
                  onPressTime={() => setOpenPicker('wakeup')}
                  previewTitle={wakeupCopy.title}
                  previewBody={wakeupCopy.body}
                  accent={pa.accent}
                  accentText={pa.accentText}
                  nextFireLabel={prefs.wakeupEnabled ? formatNextFire(prefs.wakeupHour, prefs.wakeupMinute) : undefined}
                />

                <Hairline />

                {/* ── WORKOUT REMINDER ── */}
                <ReminderBlock
                  icon="💪"
                  title="WORKOUT REMINDER"
                  enabled={prefs.workoutEnabled}
                  onToggle={() => handleEnableWithPermissionCheck('workout')}
                  time={format12h(prefs.workoutHour, prefs.workoutMinute)}
                  onPressTime={() => setOpenPicker('workout')}
                  previewTitle={workoutCopy.title}
                  previewBody={workoutCopy.body}
                  accent={pa.accent}
                  accentText={pa.accentText}
                  nextFireLabel={prefs.workoutEnabled ? formatNextFire(prefs.workoutHour, prefs.workoutMinute) : undefined}
                />
              </Section>

              {/* Permission hint */}
              {permission === 'denied' && (
                <View style={styles.notice}>
                  <Text style={styles.noticeLabel}>Notifications blocked</Text>
                  <Text style={styles.noticeText}>
                    {'⚠ Notifications are blocked. Open your phone’s Settings → Apps → Evulto → Notifications to allow them.'}
                  </Text>
                </View>
              )}

              {/* Footer note */}
              <Text style={styles.footnote}>
                {'Notifications use your phone’s default sound. Times use local time of your device. Switching coaches changes the call text automatically.'}
              </Text>
            </>
          )}
        </SafeAreaView>
      </CanvasScreen>

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
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reminder block sub-component
// ─────────────────────────────────────────────────────────────────────────────

function ReminderBlock({
  icon, title, enabled, onToggle, time, onPressTime, previewTitle, previewBody,
  accent, accentText, nextFireLabel,
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
  accentText: string;
  nextFireLabel?: string;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { clock, meridiem } = splitClock(time);
  // The clock is the block's hero, so it takes full ink rather than the accent —
  // that keeps the persona colour spent on the toggle, the next-fire line and
  // the test CTA. Disabled still reads as disabled via the tertiary ink.
  const clockInk = enabled ? tokens.text : tokens.textTertiary;

  return (
    <View style={styles.block}>
      {/* Top row: icon, title, toggle */}
      <View style={styles.blockHead}>
        <Text style={styles.blockLabel} numberOfLines={1}>
          {icon}  {title}
        </Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: tokens.borderStrong, true: accent }}
          // crownText is pure white in BOTH schemes — the thumb has to stay light
          // on the coloured track, so it cannot follow the page's surface token.
          thumbColor={tokens.crownText}
        />
      </View>

      {/* The hero of the block: the clock itself. */}
      <PressableScale
        onPress={onPressTime}
        disabled={!enabled}
        haptic="light"
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={`${title} time, ${time}. Change time.`}
        accessibilityState={{ disabled: !enabled }}
        style={styles.timePress}
      >
        <View style={styles.timeRow}>
          <Text style={[styles.clock, { color: clockInk }]} numberOfLines={1}>
            {clock}
          </Text>
          <Text style={styles.meridiem}>{meridiem}</Text>
        </View>
        <Text style={styles.timeCaption} numberOfLines={1}>Time · tap to change</Text>
      </PressableScale>

      {/* Next-fire hint */}
      {nextFireLabel && (
        <Text style={[styles.nextFire, { color: accentText }]} numberOfLines={1}>
          ⏰  {nextFireLabel}
        </Text>
      )}

      {/* Preview of the actual notification */}
      <Text style={styles.previewLabel} numberOfLines={1}>Notification preview</Text>
      <View style={styles.previewBox}>
        <Text style={styles.previewTitle}>{previewTitle}</Text>
        <Text style={styles.previewBody}>{previewBody}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  body: { paddingHorizontal: BODY_PAD },

  // Section's own top margin is tuned for a mid-page break; the first one sits
  // right under the crown and needs less.
  firstSection: { marginTop: 22 },

  rowTrail: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  blockStack: { gap: 22 },

  // ── Reminder block ─────────────────────────────────────────────────────────
  block: { paddingVertical: 6 },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  blockLabel: {
    flex: 1,
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  timePress: { alignSelf: 'flex-start' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  clock: {
    fontFamily: Fonts.displayBold,
    fontSize: 58,
    lineHeight: 60,
    // -0.045em at 58px.
    letterSpacing: -2.61,
    fontVariant: ['tabular-nums'],
  },
  meridiem: {
    fontFamily: Fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.4,
    color: t.textTertiary,
    // Lifts the meridiem off the numeral's baseline so it reads as a suffix.
    paddingBottom: 10,
  },
  timeCaption: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 6,
  },

  nextFire: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 16,
  },

  previewLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: t.textTertiary,
    marginTop: 20,
    marginBottom: 9,
  },
  previewBox: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  previewTitle: {
    fontFamily: Fonts.bodySemi,
    fontSize: 14,
    letterSpacing: -0.2,
    color: t.text,
    marginBottom: 5,
  },
  previewBody: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.textSecondary,
  },

  // ── Permission notice ──────────────────────────────────────────────────────
  notice: {
    marginTop: 30,
    backgroundColor: t.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  noticeLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.danger,
    marginBottom: 7,
  },
  noticeText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: t.textSecondary,
  },

  footnote: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    lineHeight: 15,
    letterSpacing: 0.9,
    color: t.textTertiary,
    textAlign: 'center',
    marginTop: 30,
  },
});
