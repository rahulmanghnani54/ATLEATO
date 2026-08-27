/**
 * Daily Tip Screen — Scarcity Framing mechanic, Bold Canvas.
 *
 * The crown carries the coach and the live countdown to 9pm expiry as the one
 * hero numeral; the light body holds the tip itself as large reading copy.
 * Countdown turns orange under 3h, red under 1h.
 * "Got it 💪" marks the tip seen and navigates back.
 *
 * Tip is persona-scoped and rotates daily. Expiry maths, the seen check, the
 * 30s tick and the notification schedule are untouched — this file changed
 * shape, not behaviour.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { TOKENS, useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';
import {
  getTodayTip, getMinutesUntilExpiry, hasTipBeenSeen, markTipSeen, scheduleScarcityNotification,
  type PersonaId,
} from '@/lib/scarcityEngine';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'Expired';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Countdown tone. The 3h and the >3h bands have always painted the same amber —
 * that quirk is preserved exactly. The countdown lives on the crown, which is
 * near-black in BOTH schemes, so it resolves against the dark tokens rather
 * than the active ones.
 */
function countdownColor(minutes: number): string {
  const t = TOKENS.dark;
  if (minutes <= 0) return t.textTertiary;
  if (minutes <= 60) return t.danger;
  if (minutes <= 180) return t.warning;
  return t.warning;
}

export default function DailyTipScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { scheme } = useTheme();
  const persona = personaFromProgramId(profile?.selected_program);
  const personaId = (persona.id ?? 'cbum') as PersonaId;
  const pa = personaAccent(persona, scheme);
  // The crown is dark in both schemes, so its tint always comes from the dark triplet.
  const crownPa = personaAccent(persona, 'dark');
  const styles = useThemedStyles(makeStyles);

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
    try {
      await markTipSeen(personaId);
      setAlreadySeen(true);
    } catch {
      // A failed write must not strand the CTA disabled — the tip is still read.
    } finally {
      setSaving(false);
    }
    router.back();
  }, [personaId, router]);

  const timeColor = countdownColor(minutesLeft);
  const countdownLabel = formatCountdown(minutesLeft);

  // Expiry time display e.g. "9:00 PM"
  const expireTimeStr = expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <CanvasScreen tabBar={false} bottomSpace={36}>
      <Crown
        eyebrow="Today's tip"
        title="TIP FROM"
        accentLine={persona.shortName}
        meta="Daily Coach Tip"
        accent={crownPa.accent}
        onBack={() => router.back()}
        right={
          <View style={[styles.avatar, { backgroundColor: crownPa.accent }]}>
            <Text style={[styles.avatarText, { color: crownPa.ink }]}>{persona.initials}</Text>
          </View>
        }
      >
        {/* The hero: a live countdown, so the scarcity is the loudest thing here. */}
        {!isExpired && (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Expires in</Text>
            <Text
              style={[styles.heroNum, { color: timeColor }]}
              numberOfLines={1}
              accessibilityLabel={`Expires in ${countdownLabel}`}
            >
              {countdownLabel}
            </Text>
            <Text style={styles.heroFoot}>Expires at {expireTimeStr} tonight</Text>
          </View>
        )}
      </Crown>

      <SafeAreaView edges={['left', 'right']} style={styles.body}>
        {/* The tip — no card, just reading copy with room around it. */}
        <View style={[styles.tipBlock, (isExpired || alreadySeen) && styles.tipBlockFaded]}>
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
              <Text style={[styles.seenBadge, { color: pa.accentText }]}>✓ SEEN</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </>
          ) : (
            <Text style={styles.tipText}>{tip}</Text>
          )}
        </View>

        <Section label="Why it expires">
          <View style={styles.whyBlock}>
            <Text style={styles.whyBody}>
              A tip you act on today is worth 10x a tip you save for "later."
              Expiry is a forcing function — not a gimmick. Apply it now.
            </Text>
          </View>
        </Section>

        {/* The single accent spend on the light body. */}
        {!isExpired && !alreadySeen && (
          <PressableScale
            onPress={handleGotIt}
            disabled={saving}
            haptic="heavy"
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            accessibilityState={{ disabled: saving }}
            style={[
              styles.cta,
              { backgroundColor: pa.accent, borderColor: pa.accentText },
              saving && styles.ctaBusy,
            ]}
          >
            <Text style={[styles.ctaText, { color: pa.ink }]}>
              Got it 💪
            </Text>
          </PressableScale>
        )}

        {alreadySeen && !isExpired && (
          <View style={[styles.seenPill, { borderColor: pa.accentText }]}>
            <Text style={[styles.seenPillText, { color: pa.accentText }]}>
              ✓ You've applied this tip today
            </Text>
          </View>
        )}

        {isExpired && (
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
            style={styles.backHome}
          >
            <Text style={styles.backHomeText}>← Back to Dashboard</Text>
          </PressableScale>
        )}
      </SafeAreaView>
    </CanvasScreen>
  );
}

const makeStyles = (t: SemanticTokens) => StyleSheet.create({
  body: { paddingHorizontal: BODY_PAD },

  // ── Crown ──────────────────────────────────────────────────────────────────
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  hero: { marginTop: 26 },
  heroLabel: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginBottom: 8,
  },
  heroNum: {
    fontFamily: Fonts.displayBold,
    fontSize: 62,
    lineHeight: 65,
    // -0.045em at 62px.
    letterSpacing: -2.79,
    fontVariant: ['tabular-nums'],
  },
  heroFoot: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: t.crownTextDim,
    marginTop: 10,
  },

  // ── The tip ────────────────────────────────────────────────────────────────
  tipBlock: { marginTop: 34 },
  tipBlockFaded: { opacity: 0.7 },
  tipText: {
    fontFamily: Fonts.body,
    fontSize: 21,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: t.text,
  },
  expiredBadge: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    color: t.danger,
    marginBottom: 14,
  },
  seenBadge: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  expiredNote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    color: t.textTertiary,
    marginTop: 18,
  },

  // ── Why it expires ─────────────────────────────────────────────────────────
  whyBlock: {
    backgroundColor: t.surfaceAlt,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  whyBody: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: t.textSecondary,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  cta: {
    borderRadius: 26,
    // The brand fill is under 3:1 on a light page; the deeper tone at its edge
    // is what makes the control identifiable (SC 1.4.11).
    borderWidth: 1,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 34,
  },
  ctaBusy: { opacity: 0.6 },
  ctaText: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  seenPill: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 17,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 34,
  },
  seenPillText: {
    fontFamily: Fonts.displayBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  backHome: {
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 30,
  },
  backHomeText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    color: t.textSecondary,
  },
});
