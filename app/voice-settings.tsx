/**
 * Voice Settings Screen — LEGEND tier, Bold Canvas.
 *
 * Lets users adjust their active coach's voice pitch and speed.
 * Overrides are persisted to AsyncStorage and applied when previewing.
 * Gate-checked on mount: non-LEGEND users are redirected to paywall.
 *
 * The crown carries the coach identity; the light body gives each control its
 * value as an oversized numeral sitting on a tiny mono label. Every gate check,
 * storage read/write and Speech call below is byte-for-byte the pre-migration
 * behaviour — only presentation moved.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet,
  GestureResponderEvent, LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { canAccess } from '@/lib/featureGates';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import type { PersonaId } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { CanvasScreen, Crown, Section } from '@/components/ui/canvas';
import { PressableScale, Skeleton } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// ─── Storage key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'voice_overrides:v1';

interface VoiceOverrides {
  pitch: number;
  rate:  number;
}

// ─── Per-persona defaults (mirrors voiceCues.ts VOICE_BY_PERSONA) ────────────

const PERSONA_DEFAULTS: Record<PersonaId, VoiceOverrides> = {
  cbum:        { pitch: 1.00, rate: 0.95 },
  arnold:      { pitch: 0.82, rate: 0.88 },
  nippard:     { pitch: 1.05, rate: 1.05 },
  ct_fletcher: { pitch: 0.92, rate: 1.10 },
  dr_mike:     { pitch: 1.00, rate: 1.10 },
};

const PREVIEW_LINES: Record<PersonaId, string> = {
  cbum:        "Let's get to work. Quality reps only.",
  arnold:      "Welcome back, champion. The iron awaits.",
  nippard:     "Session start. Execute the plan.",
  ct_fletcher: "GET YOUR ASS ON THAT BAR! LET'S GO!",
  dr_mike:     "Mesocycle session, on the clock. Begin.",
};

const SLIDER_MIN = 0.5;
const SLIDER_MAX = 2.0;

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;

// ─── Custom slider component ────────────────────────────────────────────────

function CustomSlider({
  value,
  onValueChange,
  accentColor,
  edgeColor,
  label,
}: {
  value: number;
  onValueChange: (v: number) => void;
  accentColor: string;
  /** Boundary hairline for the fill — see makeStyles for why a fill needs one. */
  edgeColor: string;
  label: string;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const trackWidth = useRef(0);

  const pct = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const handleTouch = (e: GestureResponderEvent) => {
    if (trackWidth.current === 0) return;
    const x = e.nativeEvent.locationX;
    const clamped = Math.max(0, Math.min(1, x / trackWidth.current));
    const raw = SLIDER_MIN + clamped * (SLIDER_MAX - SLIDER_MIN);
    // Round to 2 decimals
    onValueChange(Math.round(raw * 100) / 100);
  };

  return (
    <View
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={(e: GestureResponderEvent) => handleTouch(e)}
      // Vertical padding only: locationX is measured on THIS view, so any
      // horizontal inset here would desync the touch from the track below it.
      style={styles.sliderHit}
      // Deliberately NOT role="adjustable": there are no increment/decrement
      // actions wired, and claiming an operable slider a screen reader cannot
      // drive is worse than the plain readout this gives.
      accessibilityLabel={`${label}, ${value.toFixed(2)}`}
    >
      <View style={[styles.track, { backgroundColor: tokens.surfaceAlt }]} onLayout={handleLayout}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: accentColor, borderColor: edgeColor },
          ]}
        />
        <View
          style={[
            styles.thumb,
            { left: `${pct * 100}%`, backgroundColor: accentColor, borderColor: edgeColor },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { tokens, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const persona = personaFromProgramId(profile?.selected_program);
  const personaId = persona.id;
  const defaults = PERSONA_DEFAULTS[personaId] ?? { pitch: 1.0, rate: 1.0 };
  const pa = personaAccent(persona, scheme);
  const accentColor = pa.accent;
  // The crown is near-black in BOTH schemes, so its tint always resolves against
  // the dark triplet — the light accent would sink into the ink.
  const crownTint = personaAccent(persona, 'dark').accent;

  const [pitch, setPitch] = useState(defaults.pitch);
  const [rate,  setRate]  = useState(defaults.rate);
  const [speaking, setSpeaking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Gate check & load saved overrides ────────────────────────────────────
  useEffect(() => {
    if (!canAccess('voice_customization')) {
      router.replace('/paywall' as any);
      return;
    }

    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const all = JSON.parse(raw) as Record<string, VoiceOverrides>;
          const saved = all[personaId];
          if (saved) {
            if (typeof saved.pitch === 'number') setPitch(saved.pitch);
            if (typeof saved.rate  === 'number') setRate(saved.rate);
          }
        } catch {
          // corrupt data — ignore and use defaults
        }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true)); // storage read failed — render with defaults

    // Stop any preview TTS still speaking when the user navigates away.
    return () => { try { Speech.stop(); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist on every change ───────────────────────────────────────────────
  const saveOverrides = async (newPitch: number, newRate: number) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const all: Record<string, VoiceOverrides> = raw ? JSON.parse(raw) : {};
      all[personaId] = { pitch: newPitch, rate: newRate };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // non-critical
    }
  };

  const handlePitchChange = (v: number) => {
    setPitch(v);
    saveOverrides(v, rate);
  };

  const handleRateChange = (v: number) => {
    setRate(v);
    saveOverrides(pitch, v);
  };

  // ── Preview ───────────────────────────────────────────────────────────────
  const handlePreview = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = PREVIEW_LINES[personaId] ?? "Let's get to work.";
    setSpeaking(true);
    try {
      Speech.speak(text, {
        language: 'en-US',
        pitch,
        rate,
        volume: 1.0,
        onDone: () => setSpeaking(false),
        onError: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
      });
    } catch {
      setSpeaking(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPitch(defaults.pitch);
    setRate(defaults.rate);
    saveOverrides(defaults.pitch, defaults.rate);
  };

  const pitchLabel = pitch.toFixed(2);
  const rateLabel  = rate.toFixed(2);

  // The persona monogram rides the crown's top-right slot — it is the identity
  // mark, so it carries the tint the crown's accent line already spends.
  const monogram = (
    <View style={[styles.monogram, { borderColor: tokens.crownLine }]}>
      <Text style={[styles.monogramText, { color: crownTint }]} numberOfLines={1}>
        {persona.initials}
      </Text>
    </View>
  );

  const crown = (
    <Crown
      eyebrow={styleText(persona, `✦ Coach voice · ${persona.shortName}`)}
      title={styleText(persona, 'Tune how')}
      accentLine={styleText(persona, 'they sound.')}
      meta={`${persona.fullName} · ${persona.era}`}
      // Held back until the overrides load, so the crown never advertises the
      // defaults as if they were the user's saved settings.
      pills={loaded ? ['LEGEND', `Pitch ${pitchLabel}`, `Speed ${rateLabel}`] : undefined}
      accent={crownTint}
      right={monogram}
      onBack={() => router.back()}
    />
  );

  // Storage read still in flight (or the gate is mid-redirect): the page keeps
  // its shape instead of flashing blank, and reveals nothing gated.
  if (!loaded) {
    return (
      <View style={styles.root}>
        <CanvasScreen tabBar={false} bottomSpace={28}>
          {crown}
          <SafeAreaView edges={['left', 'right']} style={styles.body}>
            <View style={styles.loadingStack}>
              <Skeleton width={72} height={9} radius={2} />
              <Skeleton width={148} height={46} radius={6} />
              <Skeleton height={6} radius={3} />
              <Skeleton width={210} height={8} radius={2} />
            </View>
            <View style={styles.loadingStack}>
              <Skeleton width={72} height={9} radius={2} />
              <Skeleton width={148} height={46} radius={6} />
              <Skeleton height={6} radius={3} />
              <Skeleton width={210} height={8} radius={2} />
            </View>
            <Skeleton height={52} radius={26} style={styles.loadingCta} />
          </SafeAreaView>
        </CanvasScreen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CanvasScreen tabBar={false} bottomSpace={28}>
        {crown}

        <SafeAreaView edges={['left', 'right']} style={styles.body}>

          {/* ── PITCH ── */}
          <Section label="Pitch" style={styles.firstSection}>
            <Text style={styles.value} numberOfLines={1}>{pitchLabel}</Text>
            <CustomSlider
              value={pitch}
              onValueChange={handlePitchChange}
              accentColor={accentColor}
              edgeColor={pa.accentText}
              label="Voice pitch"
            />
            <Text style={styles.hint}>0.5 = deep · 1.0 = natural · 2.0 = high</Text>
          </Section>

          {/* ── SPEED ── */}
          <Section label="Speed">
            <Text style={styles.value} numberOfLines={1}>{rateLabel}</Text>
            <CustomSlider
              value={rate}
              onValueChange={handleRateChange}
              accentColor={accentColor}
              edgeColor={pa.accentText}
              label="Voice speed"
            />
            <Text style={styles.hint}>0.5 = slow · 1.0 = natural · 2.0 = fast</Text>
          </Section>

          {/* Preview button — the one filled control on the page. */}
          <PressableScale
            onPress={handlePreview}
            haptic="heavy"
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Stop preview' : 'Preview voice'}
            style={[
              styles.previewBtn,
              speaking
                ? { backgroundColor: tokens.surfaceAlt, borderColor: pa.accentText }
                : { backgroundColor: accentColor, borderColor: pa.accentText },
            ]}
          >
            <Text
              style={[styles.previewBtnText, { color: speaking ? pa.accentText : pa.ink }]}
              numberOfLines={1}
            >
              {speaking ? '■  STOP PREVIEW' : '▶  PREVIEW VOICE'}
            </Text>
          </PressableScale>

          {/* Sample line shown so user knows what will be spoken */}
          <Text style={styles.previewLine} numberOfLines={2}>
            "{PREVIEW_LINES[personaId]}"
          </Text>

          {/* Reset — borderless, so it stays subordinate to the preview CTA. */}
          <PressableScale
            onPress={handleReset}
            haptic="light"
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel="Reset to default"
            style={styles.resetBtn}
          >
            <Text style={styles.resetBtnText} numberOfLines={1}>RESET TO DEFAULT</Text>
          </PressableScale>

        </SafeAreaView>
      </CanvasScreen>
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

  loadingStack: { marginTop: 30, gap: 14 },
  loadingCta: { marginTop: 40 },

  // ── Crown monogram ─────────────────────────────────────────────────────────
  monogram: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    letterSpacing: -0.4,
  },

  // ── The value numeral: the drama of each control ───────────────────────────
  // Full ink, not the accent — the persona colour is spent on the slider and the
  // preview CTA, and a coloured numeral would make three accents on one page.
  value: {
    fontFamily: Fonts.displayBold,
    fontSize: 46,
    lineHeight: 48,
    // -0.045em at 46px.
    letterSpacing: -2.07,
    fontVariant: ['tabular-nums'],
    color: t.text,
  },

  // ── Slider ─────────────────────────────────────────────────────────────────
  sliderHit: { paddingVertical: 14 },
  track: {
    height: 6,
    borderRadius: 3,
  },
  // The brand fill is only ~2.5:1 against a light page, below the 3:1 SC 1.4.11
  // owes a control's boundary, so the fill and the thumb both carry a hairline
  // in the persona's text-safe tone. Hue-matched rather than tokens.accentLine,
  // which is emerald and would clash with a gold or crimson coach.
  fill: {
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    position: 'absolute',
    top: -8,
    marginLeft: -11,
  },

  hint: {
    fontFamily: Fonts.legacyMono,
    fontSize: 8.5,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.textTertiary,
  },

  // ── Preview CTA ────────────────────────────────────────────────────────────
  previewBtn: {
    marginTop: 40,
    paddingVertical: 17,
    borderWidth: 1,
    borderRadius: 26,
    alignItems: 'center',
  },
  previewBtnText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 13,
    letterSpacing: 0.8,
  },

  previewLine: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: t.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },

  resetBtn: {
    marginTop: 34,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resetBtnText: {
    fontFamily: Fonts.legacyMono,
    fontSize: 9,
    letterSpacing: 1.7,
    color: t.textSecondary,
  },
});
