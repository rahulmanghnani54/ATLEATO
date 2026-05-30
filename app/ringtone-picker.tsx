/**
 * /ringtone-picker — Choose what plays when the coach calls.
 *
 * Shows 5 bundled ringtone variants + an "Import from your phone" row.
 * Each row has a preview ▶ button that plays the sound for ~3 seconds.
 * The currently selected option gets a persona-accent ring + check.
 *
 * Selection persists immediately via AsyncStorage — no separate Save button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import {
  BUNDLED_RINGTONES, getRingtonePref, setRingtonePref,
  type RingtonePref,
} from '@/lib/ringtonePreference';
import { useAuthStore } from '@/stores/authStore';
import { personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Colors, Fonts } from '@/constants/theme';

export default function RingtonePicker() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);

  const [pref,    setPref]    = useState<RingtonePref | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const previewRef = useRef<Audio.Sound | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved preference
  useFocusEffect(useCallback(() => {
    (async () => setPref(await getRingtonePref()))();
  }, []));

  // Stop preview on unmount
  useEffect(() => () => {
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewRef.current?.unloadAsync().catch(() => {});
  }, []);

  const stopPreview = async () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (previewRef.current) {
      try { await previewRef.current.stopAsync(); } catch { /* ignore */ }
      try { await previewRef.current.unloadAsync(); } catch { /* ignore */ }
      previewRef.current = null;
    }
    setPlaying(null);
  };

  const playPreview = async (id: string, source: Parameters<typeof Audio.Sound.createAsync>[0]) => {
    await stopPreview();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(source, { volume: 0.8, isLooping: false });
      previewRef.current = sound;
      setPlaying(id);
      await sound.playAsync();
      // Auto-stop after ~3.5 seconds to keep previews short
      previewTimeoutRef.current = setTimeout(stopPreview, 3500);
    } catch (e: any) {
      Alert.alert('Preview failed', e?.message ?? 'Could not play this sound.');
      setPlaying(null);
    }
  };

  const choose = async (next: RingtonePref) => {
    setPref(next);
    await setRingtonePref(next);
  };

  const importFromDevice = async () => {
    // expo-document-picker is autolinked but needs a native rebuild to be
    // usable. Until the user rebuilds the APK we surface a clean message
    // instead of crashing the JS bundle. After rebuild, swap the body of
    // this function back to the DocumentPicker.getDocumentAsync flow.
    Alert.alert(
      'Rebuild required',
      'To import a custom ringtone, rebuild the app:\n\n' +
      '  npx expo prebuild --clean\n' +
      '  npx expo run:android\n\n' +
      'After install, this button will let you pick any audio file from your phone.',
    );
  };

  const isSelected = (id: string): boolean => {
    if (!pref) return false;
    if (id === 'file') return pref.kind === 'file';
    return pref.kind === 'bundle' && pref.bundle === id;
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={async () => { await stopPreview(); router.back(); }}>
          <Text style={styles.close}>← back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: persona.accent }]}>
          {styleText(persona, 'RINGTONE')}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>
          What plays when your coach calls. Tap ▶ to preview. Selection saves automatically.
        </Text>

        {/* ── Bundled options ─────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: persona.accent }]}>BUILT-IN RINGTONES</Text>
        {BUNDLED_RINGTONES.map((r) => {
          const selected = isSelected(r.key);
          const isPlaying = playing === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[
                styles.row,
                selected && { borderColor: persona.accent, backgroundColor: persona.accentSoft },
              ]}
              onPress={() => choose({ kind: 'bundle', bundle: r.key })}
              activeOpacity={0.8}
            >
              <Text style={styles.rowEmoji}>{r.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, selected && { color: persona.accent }]}>
                  {r.label}
                </Text>
                <Text style={styles.rowTagline}>{r.tagline}</Text>
              </View>
              <TouchableOpacity
                style={[styles.previewBtn, { borderColor: persona.accent }]}
                onPress={(e) => { e.stopPropagation(); isPlaying ? stopPreview() : playPreview(r.key, r.asset); }}
                hitSlop={10}
              >
                {isPlaying
                  ? <ActivityIndicator size="small" color={persona.accent} />
                  : <Text style={[styles.previewBtnText, { color: persona.accent }]}>▶</Text>}
              </TouchableOpacity>
              {selected && (
                <Text style={[styles.check, { color: persona.accent }]}>✓</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* ── Import from device ──────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: persona.accent, marginTop: 24 }]}>
          YOUR OWN
        </Text>
        <TouchableOpacity
          style={[
            styles.row,
            isSelected('file') && { borderColor: persona.accent, backgroundColor: persona.accentSoft },
          ]}
          onPress={importFromDevice}
          activeOpacity={0.8}
        >
          <Text style={styles.rowEmoji}>📁</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, isSelected('file') && { color: persona.accent }]}>
              {pref?.kind === 'file' ? (pref.filename ?? 'Imported file') : 'Pick from your phone'}
            </Text>
            <Text style={styles.rowTagline}>
              {pref?.kind === 'file'
                ? 'Tap to swap to a different file.'
                : 'Choose any audio file from your storage (MP3, WAV, M4A).'}
            </Text>
          </View>
          {isSelected('file') && (
            <Text style={[styles.check, { color: persona.accent }]}>✓</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          ⓘ Imported files play at full volume even when your phone is on silent
          (same as the bundled ringtones).
        </Text>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  close: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 16, letterSpacing: 1 },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  sub: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary,
    lineHeight: 19, marginBottom: 22,
  },
  sectionLabel: {
    fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.8,
    fontWeight: '700', marginBottom: 10,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
  },
  rowEmoji: { fontSize: 26 },
  rowLabel: {
    fontFamily: Fonts.display, fontWeight: '700', fontSize: 15, color: Colors.text,
    letterSpacing: -0.2,
  },
  rowTagline: {
    fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary,
    marginTop: 3, lineHeight: 15,
  },

  previewBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  previewBtnText: { fontFamily: Fonts.display, fontSize: 14 },

  check: {
    fontFamily: Fonts.display, fontWeight: '800', fontSize: 20,
    marginLeft: 4,
  },

  footnote: {
    fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary,
    letterSpacing: 0.4, marginTop: 18, lineHeight: 16,
  },
});
