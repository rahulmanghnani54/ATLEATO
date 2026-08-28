/**
 * /ringtone-picker — Choose what plays when the coach calls. Bold Canvas.
 *
 * Shows 5 bundled ringtone variants + an "Import from your phone" row.
 * Each row has a preview ▶ button that plays the sound for ~3 seconds.
 * The currently selected option is the screen's single accent moment.
 *
 * Selection persists immediately via AsyncStorage — no separate Save button.
 *
 * Every preview/playback call, the paywall gate, the lazy DocumentPicker
 * require() and its Alerts are byte-for-byte the pre-migration behaviour; only
 * the presentation moved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import { Check, Play, Square } from 'lucide-react-native';
import {
  BUNDLED_RINGTONES, getRingtonePref, setRingtonePref,
  type RingtonePref,
} from '@/lib/ringtonePreference';
import { useAuthStore } from '@/stores/authStore';
import { personaAccent, personaFromProgramId, styleText } from '@/lib/personaTheme';
import { Fonts } from '@/constants/theme';
import { canAccess } from '@/lib/featureGates';
import { CanvasScreen, Crown, Hairline, Section } from '@/components/ui/canvas';
import { PressableScale } from '@/components/ui/motion';
import { useTheme, useThemedStyles, type SemanticTokens } from '@/lib/theme';

// Matches Crown's own horizontal inset so the body lines up under the hero.
const BODY_PAD = 22;
// How far the selected row's tinted plate bleeds past the body padding.
const PLATE_BLEED = 12;

export default function RingtonePicker() {
  const router  = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const persona = personaFromProgramId(profile?.selected_program);
  const { scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const pa = personaAccent(persona, scheme);
  // The crown is near-black in BOTH schemes, so its tint always resolves against
  // the dark triplet — the light accent would sink into the ink.
  const crownTint = personaAccent(persona, 'dark').accent;

  const [pref,    setPref]    = useState<RingtonePref | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const previewRef = useRef<Audio.Sound | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canAccess('custom_ringtone')) {
      router.replace('/paywall?feature=custom_ringtone' as any);
    }
  }, []);

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
    // Lazy-require: keeps module load off the route-evaluation path so
    // stale APKs without the native module fall back to the alert below
    // instead of white-screening the picker.
    let DocumentPicker: typeof import('expo-document-picker') | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      DocumentPicker = require('expo-document-picker');
    } catch {
      Alert.alert(
        'Rebuild required',
        'To import a custom ringtone, rebuild the app:\n  npx expo prebuild --clean\n  npx expo run:android',
      );
      return;
    }

    try {
      const res = await DocumentPicker!.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      await choose({ kind: 'file', uri: file.uri, filename: file.name });
      Alert.alert('Saved', `Using "${file.name}" as your wake-up ringtone.`);
    } catch (e: any) {
      Alert.alert('Could not import', e?.message ?? 'Try a different file.');
    }
  };

  const isSelected = (id: string): boolean => {
    if (!pref) return false;
    if (id === 'file') return pref.kind === 'file';
    return pref.kind === 'bundle' && pref.bundle === id;
  };

  const importLabel = pref?.kind === 'file'
    ? (pref.filename ?? 'Imported file')
    : 'Pick from your phone';

  // Crown pills are laid out in a wrap row with no shrink, and the crown clips
  // its overflow — an imported filename past ~30 mono characters would be cut
  // mid-word at 360dp rather than ellipsised, so trim before it gets there.
  const pillName = (s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s);

  // Held back until the preference loads, so the crown never advertises the
  // default as if it were the user's saved choice.
  const pills = pref
    ? [
        `Now · ${pillName(
          pref.kind === 'file'
            ? (pref.filename ?? 'Imported file')
            : (BUNDLED_RINGTONES.find((b) => b.key === pref.bundle)?.label ?? 'Built-in'),
        )}`,
        'Saves instantly',
      ]
    : undefined;

  return (
    <View style={styles.root}>
      <CanvasScreen tabBar={false} bottomSpace={28}>
        <Crown
          eyebrow={styleText(persona, `✦ Coach calls · ${persona.shortName}`)}
          title={styleText(persona, 'Pick what')}
          accentLine={styleText(persona, 'wakes you.')}
          meta="What plays when your coach calls. Tap ▶ to preview. Selection saves automatically."
          pills={pills}
          accent={crownTint}
          onBack={async () => { await stopPreview(); router.back(); }}
        />

        <SafeAreaView edges={['left', 'right']} style={styles.body}>
          <Section label="Built-in ringtones" style={styles.firstSection}>
            {BUNDLED_RINGTONES.map((r, i) => {
              const selected = isSelected(r.key);
              const isPlaying = playing === r.key;
              return (
                <RingtoneRow
                  key={r.key}
                  emoji={r.emoji}
                  title={r.label}
                  subtitle={r.tagline}
                  selected={selected}
                  accentSoft={pa.accentSoft}
                  accentText={pa.accentText}
                  onPress={() => choose({ kind: 'bundle', bundle: r.key })}
                  playing={isPlaying}
                  onPreview={(e) => {
                    e.stopPropagation();
                    isPlaying ? stopPreview() : playPreview(r.key, r.asset);
                  }}
                  last={i === BUNDLED_RINGTONES.length - 1}
                />
              );
            })}
          </Section>

          <Section label="Your own">
            <RingtoneRow
              emoji="📁"
              title={importLabel}
              subtitle={
                pref?.kind === 'file'
                  ? 'Tap to swap to a different file.'
                  : 'Choose any audio file from your storage (MP3, WAV, M4A).'
              }
              selected={isSelected('file')}
              accentSoft={pa.accentSoft}
              accentText={pa.accentText}
              onPress={importFromDevice}
              last
            />
          </Section>

          <Text style={styles.footnote}>
            {'ⓘ Imported files play at full volume even when your phone is on silent (same as the bundled ringtones).'}
          </Text>
        </SafeAreaView>
      </CanvasScreen>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row — borderless, hairline-separated. The selected one is the accent moment.
// ─────────────────────────────────────────────────────────────────────────────

function RingtoneRow({
  emoji, title, subtitle, selected, accentSoft, accentText,
  onPress, onPreview, playing = false, last = false,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  selected: boolean;
  accentSoft: string;
  accentText: string;
  onPress: () => void;
  /** Omitted on the import row, which has nothing bundled to preview. */
  onPreview?: (e: any) => void;
  playing?: boolean;
  last?: boolean;
}) {
  const { tokens } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Playing is deliberately NOT the accent: the accent is reserved for the one
  // selected row, so playback reads in full ink instead of competing with it.
  const previewInk = playing ? tokens.text : tokens.textSecondary;

  return (
    <View>
      <PressableScale
        onPress={onPress}
        haptic="light"
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title}, ${subtitle}`}
        style={[styles.row, selected && { backgroundColor: accentSoft }]}
      >
        <View style={[styles.glyph, { backgroundColor: selected ? tokens.surface : tokens.surfaceAlt }]}>
          <Text style={styles.glyphText}>{emoji}</Text>
        </View>

        <View style={styles.rowText}>
          <Text
            style={[styles.rowTitle, selected && { color: accentText }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text>
        </View>

        {onPreview ? (
          <PressableScale
            onPress={onPreview}
            haptic="light"
            scaleTo={0.9}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={playing ? `Stop preview of ${title}` : `Preview ${title}`}
            style={[styles.preview, { borderColor: previewInk }]}
          >
            {playing
              ? <Square size={12} color={previewInk} fill={previewInk} />
              : <Play size={14} color={previewInk} fill={previewInk} />}
          </PressableScale>
        ) : null}

        {selected ? <Check size={19} color={accentText} strokeWidth={3} /> : null}
      </PressableScale>

      {last ? null : <Hairline />}
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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    // The tinted plate on the selected row bleeds past the body padding so the
    // text keeps its column while the fill reads as full-width.
    paddingHorizontal: PLATE_BLEED,
    marginHorizontal: -PLATE_BLEED,
    borderRadius: 24,
  },
  glyph: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { fontSize: 24 },

  rowText: { flex: 1, gap: 3 },
  rowTitle: {
    fontFamily: Fonts.bodySemi,
    fontSize: 15,
    letterSpacing: -0.2,
    color: t.text,
  },
  rowSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: t.textSecondary,
  },

  preview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
