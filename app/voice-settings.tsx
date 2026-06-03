/**
 * Voice Settings Screen — LEGEND tier
 *
 * Lets users adjust their active coach's voice pitch and speed.
 * Overrides are persisted to AsyncStorage and applied when previewing.
 * Gate-checked on mount: non-LEGEND users are redirected to paywall.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  GestureResponderEvent, LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { canAccess } from '@/lib/featureGates';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId } from '@/lib/personaTheme';
import type { PersonaId } from '@/lib/personaTheme';
import { Colors, Fonts, Spacing } from '@/constants/theme';

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

// ─── Custom slider component ────────────────────────────────────────────────

function CustomSlider({
  value,
  onValueChange,
  accentColor,
}: {
  value: number;
  onValueChange: (v: number) => void;
  accentColor: string;
}) {
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
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleTouch}
      onStartShouldSetResponder={() => true}
      onResponderMove={(e) => handleTouch(e)}
    >
      <View style={sliderStyles.track} onLayout={handleLayout}>
        <View style={[sliderStyles.fill, { width: `${pct * 100}%`, backgroundColor: accentColor }]} />
        <View style={[sliderStyles.thumb, { left: `${pct * 100}%`, borderColor: accentColor }]} />
      </View>
    </TouchableOpacity>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 8, marginBottom: 20,
  },
  fill: { height: 4, borderRadius: 2, position: 'absolute', top: 0, left: 0 },
  thumb: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.surface, borderWidth: 2,
    position: 'absolute', top: -7, marginLeft: -9,
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();

  const persona = personaFromProgramId(profile?.selected_program);
  const personaId = persona.id;
  const defaults = PERSONA_DEFAULTS[personaId] ?? { pitch: 1.0, rate: 1.0 };
  const accentColor = persona.accent ?? Colors.primary;

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
    });
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

  if (!loaded) return null;

  const pitchLabel = pitch.toFixed(2);
  const rateLabel  = rate.toFixed(2);

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>COACH VOICE</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.body}>

        {/* Persona badge */}
        <View style={[styles.personaBadge, { borderColor: accentColor }]}>
          <Text style={[styles.personaInitials, { color: accentColor }]}>
            {persona.initials}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.personaName}>{persona.fullName}</Text>
            <Text style={styles.personaEra}>{persona.era}</Text>
          </View>
          <View style={[styles.legendBadge, { backgroundColor: accentColor }]}>
            <Text style={[styles.legendBadgeText, { color: persona.ink ?? Colors.bg }]}>
              LEGEND
            </Text>
          </View>
        </View>

        {/* Pitch slider */}
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>PITCH</Text>
            <Text style={[styles.sliderValue, { color: accentColor }]}>{pitchLabel}</Text>
          </View>
          <Text style={styles.sliderHint}>0.5 = deep · 1.0 = natural · 2.0 = high</Text>
          <CustomSlider
            value={pitch}
            onValueChange={handlePitchChange}
            accentColor={accentColor}
          />
        </View>

        {/* Speed slider */}
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>SPEED</Text>
            <Text style={[styles.sliderValue, { color: accentColor }]}>{rateLabel}</Text>
          </View>
          <Text style={styles.sliderHint}>0.5 = slow · 1.0 = natural · 2.0 = fast</Text>
          <CustomSlider
            value={rate}
            onValueChange={handleRateChange}
            accentColor={accentColor}
          />
        </View>

        {/* Preview button */}
        <TouchableOpacity
          style={[styles.previewBtn, { backgroundColor: speaking ? Colors.surface : accentColor, borderColor: accentColor }]}
          onPress={handlePreview}
          activeOpacity={0.8}
        >
          <Text style={[styles.previewBtnText, { color: speaking ? accentColor : (persona.ink ?? Colors.bg) }]}>
            {speaking ? '■  STOP PREVIEW' : '▶  PREVIEW VOICE'}
          </Text>
        </TouchableOpacity>

        {/* Sample line shown so user knows what will be spoken */}
        <Text style={styles.previewLine} numberOfLines={2}>
          "{PREVIEW_LINES[personaId]}"
        </Text>

        {/* Reset button */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.7}>
          <Text style={styles.resetBtnText}>RESET TO DEFAULT</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn: { width: 32 },
  backText: { fontSize: 22, color: Colors.text },
  headerTitle: {
    fontFamily: Fonts.mono, fontSize: 10, color: 'rgba(245,245,244,0.38)',
    letterSpacing: 1.6,
  },

  body: { padding: Spacing.md },

  personaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderRadius: 10,
    padding: 14, marginBottom: 28,
  },
  personaInitials: { fontFamily: Fonts.display, fontSize: 28 },
  personaName: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text, letterSpacing: -0.3 },
  personaEra:  { fontFamily: Fonts.mono, fontSize: 9, color: 'rgba(245,245,244,0.38)', letterSpacing: 0.5, marginTop: 2 },
  legendBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  legendBadgeText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 1.4 },

  sliderSection: { marginBottom: 8 },
  sliderHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderLabel:   { fontFamily: Fonts.mono, fontSize: 9, color: 'rgba(245,245,244,0.38)', letterSpacing: 1.8 },
  sliderValue:   { fontFamily: Fonts.display, fontSize: 18 },
  sliderHint:    { fontFamily: Fonts.mono, fontSize: 9, color: 'rgba(245,245,244,0.28)', letterSpacing: 0.4, marginTop: 2 },

  previewBtn: {
    borderWidth: 1.5, borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginTop: 28,
  },
  previewBtnText: { fontFamily: Fonts.display, fontSize: 13, letterSpacing: 1 },

  previewLine: {
    fontFamily: Fonts.mono, fontSize: 10, color: 'rgba(245,245,244,0.38)',
    textAlign: 'center', marginTop: 10, marginBottom: 24,
    letterSpacing: 0.3, lineHeight: 16,
  },

  resetBtn: {
    alignItems: 'center', paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 8,
  },
  resetBtnText: {
    fontFamily: Fonts.mono, fontSize: 9, color: 'rgba(245,245,244,0.38)', letterSpacing: 1.6,
  },
});
