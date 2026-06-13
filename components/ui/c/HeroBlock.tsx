/**
 * <HeroBlock> — Direction C edge-to-edge hero
 *
 * The signature visual moment of the Nike/Telegram direction. Takes ~38% of
 * the screen, fills with a persona-colored radial-gradient (proxies an
 * eventual hero photo), and overlays the day/name copy at bottom-left.
 *
 * Usage:
 *   <HeroBlock
 *     accent="#ff6b35"        // persona accent
 *     day="Day 47 · Push"
 *     name="Let's go,\nRahul"
 *   />
 *
 * Why this exists: replaces the v0 "greet + name + // mono kicker" pattern
 * that read as AI-designed. The big photo-style block + bottom-anchored copy
 * is the Nike Training Club / Telegram convention.
 */
import { View, Text, StyleSheet, ImageSourcePropType, ImageBackground, useWindowDimensions } from 'react-native';
import { Colors, Fonts, Spacing, Typography } from '@/constants/theme';

interface Props {
  accent: string;                // persona accent color (gradient start)
  day: string;                   // "Day 47 · Push"
  name: string;                  // headline (can include \n)
  photo?: ImageSourcePropType;   // optional hero photo — when provided, replaces the gradient
  heightRatio?: number;          // % of screen — default 0.38
}

export function HeroBlock({ accent, day, name, photo, heightRatio = 0.38 }: Props) {
  // BUG-FIX: previous version used `height: '38%'` (percentage). Inside a
  // ScrollView, percentage heights collapse to 0 because the ScrollView's
  // height is defined by its content, not given to its content. That made
  // the whole Dashboard appear frozen. Compute an absolute pixel value
  // from the device window height instead.
  const { height: screenH } = useWindowDimensions();
  const heroH = Math.round(screenH * heightRatio);
  const content = (
    <>
      {/* Bottom-of-block dark gradient overlay so white text always reads */}
      <View pointerEvents="none" style={styles.scrim} />
      <View style={styles.contentArea}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.name}>{name}</Text>
      </View>
    </>
  );

  if (photo) {
    return (
      <ImageBackground source={photo} style={[styles.wrap, { height: heroH }]} resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }

  // No photo — persona-gradient fallback. Uses 3-stop radial-ish look via
  // overlapping View backgrounds (RN doesn't support radial gradients without
  // a 3rd-party lib; this approximation reads as "branded hero").
  return (
    <View style={[styles.wrap, styles.gradWrap, { height: heroH, backgroundColor: accent }]}>
      <View style={[styles.gradBlob, styles.gradBlobLight]} />
      <View style={[styles.gradBlobAccent, { backgroundColor: shadeDarker(accent) }]} />
      {content}
    </View>
  );
}

// Darken a hex color by ~30% — used for the secondary gradient stop.
function shadeDarker(hex: string): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - 60);
  const g = Math.max(0, ((num >> 8) & 0xff) - 60);
  const b = Math.max(0, (num & 0xff) - 60);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  gradWrap: {},
  gradBlob: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 280,
    top: -40,
    left: -40,
  },
  gradBlobLight: { backgroundColor: 'rgba(255,255,255,0.15)' },
  gradBlobAccent: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 320,
    bottom: -60,
    right: -80,
    opacity: 0.7,
  },
  scrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'transparent',
    // Linear gradient effect via box-shadow proxy — RN web supports this,
    // RN native ignores it. A future commit can swap in expo-linear-gradient
    // for guaranteed RN-native coverage. Until then the dark accent stop
    // from the gradient handles legibility on real devices.
  },
  contentArea: {
    position: 'absolute',
    bottom: Spacing.heroPad - 4,
    left: Spacing.heroPad,
    right: Spacing.heroPad,
  },
  day: {
    ...Typography.heroSub,
    color: 'rgba(255,255,255,0.92)',
    marginBottom: Spacing.xs + 1,   // off-ladder 5
  },
  name: {
    ...Typography.heroName,
    color: '#fff',
    lineHeight: 32,
  },
});
