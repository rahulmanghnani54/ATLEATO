/**
 * Daily Tip Screen — Scarcity Framing mechanic
 *
 * Shows today's coach tip with a live countdown to 9pm expiry.
 * Countdown turns orange under 3h, red under 1h.
 * "Got it 💪" marks the tip seen and navigates back.
 *
 * Tip is persona-scoped and rotates daily.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  getTodayTip, getMinutesUntilExpiry, hasTipBeenSeen, markTipSeen, scheduleScarcityNotification,
  type PersonaId,
} from '@/lib/scarcityEngine';

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'Expired';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function countdownColor(minutes: number): string {
  if (minutes <= 0) return Colors.textTertiary;
  if (minutes <= 60) return Colors.error;
  if (minutes <= 180) return Colors.warning;
  return Colors.warning;
}

export default function DailyTipScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const personaId = (persona.id ?? 'cbum') as PersonaId;

  const [minutesLeft, setMinutesLeft] = useState(() => getMinutesUntilExpiry(personaId));
  const [alreadySeen, setAlreadySeen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { tip, expiresAt } = getTodayTip(personaId);
  const isExpired = minutesLeft <= 0;

  // Check seen state
  useEffect(() => {
    hasTipBeenSeen(personaId).then(setAlreadySeen);
    // Schedule the 6pm nudge notification
    scheduleScarcityNotification(personaId);
  }, [personaId]);

  // Live countdown — tick every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setMinutesLeft(getMinutesUntilExpiry(personaId));
    }, 30_000);
    return () => clearInterval(id);
  }, [personaId]);

  const handleGotIt = useCallback(async () => {
    setSaving(true);
    await markTipSeen(personaId);
    setAlreadySeen(true);
    setSaving(false);
    router.back();
  }, [personaId, router]);

  const timeColor = countdownColor(minutesLeft);
  const countdownLabel = formatCountdown(minutesLeft);

  // Expiry time display e.g. "9:00 PM"
  const expireTimeStr = expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TODAY'S TIP</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Coach avatar + name */}
        <View style={styles.coachRow}>
          <View style={[styles.coachAvatar, { backgroundColor: persona.accent }]}>
            <Text style={[styles.coachInitials, { color: persona.ink }]}>{persona.initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.coachName, { color: persona.accent }]}>{persona.shortName}</Text>
            <Text style={styles.coachSub}>Daily Coach Tip</Text>
          </View>
        </View>

        {/* Tip card */}
        <View style={[
          styles.tipCard,
          { borderLeftColor: persona.accent },
          (isExpired || alreadySeen) && styles.tipCardFaded,
        ]}>
          {isExpired ? (
            <>
              <Text style={styles.expiredBadge}>TIP EXPIRED</Text>
              <Text style={styles.tipText}>{tip}</Text>
              <Text style={styles.expiredNote}>
                You missed this one. A new tip drops tomorrow.
              </Text>
            </>
          ) : alreadySeen ? (
            <>
              <Text style={[styles.seenBadge, { color: persona.accent }]}>✓ SEEN</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </>
          ) : (
            <Text style={styles.tipText}>{tip}</Text>
          )}
        </View>

        {/* Countdown */}
        {!isExpired && (
          <View style={styles.countdownWrap}>
            <View style={[styles.countdownPill, { borderColor: timeColor + '66' }]}>
              <Text style={[styles.countdownIcon]}>⏱</Text>
              <Text style={[styles.countdownText, { color: timeColor }]}>
                Expires in {countdownLabel}
              </Text>
            </View>
            <Text style={styles.expireAt}>Expires at {expireTimeStr} tonight</Text>
          </View>
        )}

        {/* Scarcity explanation */}
        <View style={styles.whyCard}>
          <Text style={styles.whyTitle}>WHY IT EXPIRES</Text>
          <Text style={styles.whyBody}>
            A tip you act on today is worth 10x a tip you save for "later."
            Expiry is a forcing function — not a gimmick. Apply it now.
          </Text>
        </View>

        {/* CTA */}
        {!isExpired && !alreadySeen && (
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: persona.accent }, saving && { opacity: 0.4 }]}
            onPress={handleGotIt}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaBtnText, { color: persona.ink }]}>
              Got it 💪
            </Text>
          </TouchableOpacity>
        )}

        {alreadySeen && !isExpired && (
          <View style={[styles.seenBtn, { borderColor: persona.accent + '66' }]}>
            <Text style={[styles.seenBtnText, { color: persona.accent }]}>
              ✓ You've applied this tip today
            </Text>
          </View>
        )}

        {isExpired && (
          <TouchableOpacity
            style={styles.backHomeBtn}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.backHomeBtnText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 6, minWidth: 32 },
  backText: { fontSize: 20, color: Colors.text },
  headerTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.text, letterSpacing: 0.6 },

  scroll: { padding: Spacing.md, paddingBottom: 48 },

  coachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  coachAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontFamily: Fonts.display, fontSize: 16 },
  coachName: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: 0.4 },
  coachSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, letterSpacing: 1.2, marginTop: 2 },

  tipCard: {
    backgroundColor: Colors.surface,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  tipCardFaded: { opacity: 0.7 },
  tipText: {
    fontFamily: Fonts.body, fontSize: 17,
    color: Colors.text, lineHeight: 26,
  },
  expiredBadge: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.error,
    letterSpacing: 1.6, marginBottom: 10,
  },
  seenBadge: {
    fontFamily: Fonts.mono, fontSize: 9,
    letterSpacing: 1.6, marginBottom: 10,
  },
  expiredNote: {
    fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary,
    marginTop: 12, lineHeight: 16, fontStyle: 'italic',
  },

  countdownWrap: { alignItems: 'center', marginBottom: 20 },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 10,
    marginBottom: 6,
  },
  countdownIcon: { fontSize: 14 },
  countdownText: { fontFamily: Fonts.display, fontSize: 16, letterSpacing: -0.3 },
  expireAt: {
    fontFamily: Fonts.mono, fontSize: 9,
    color: Colors.textTertiary, letterSpacing: 1,
  },

  whyCard: {
    backgroundColor: Colors.raised, borderRadius: 8,
    padding: 14, marginBottom: 24,
  },
  whyTitle: {
    fontFamily: Fonts.mono, fontSize: 9, color: Colors.textTertiary,
    letterSpacing: 1.6, marginBottom: 8,
  },
  whyBody: {
    fontFamily: Fonts.body, fontSize: 13,
    color: Colors.textSecondary, lineHeight: 19,
  },

  ctaBtn: {
    paddingVertical: 18, borderRadius: 8, alignItems: 'center',
  },
  ctaBtnText: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: 0.6 },

  seenBtn: {
    paddingVertical: 16, borderRadius: 8, alignItems: 'center',
    borderWidth: 1,
  },
  seenBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 0.4 },

  backHomeBtn: {
    paddingVertical: 16, alignItems: 'center',
  },
  backHomeBtnText: {
    fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary,
  },
});
