/**
 * withFullScreenCall — native config for Level-B incoming calls.
 *
 * The Notifee call notification already sets `fullScreenAction` (see
 * lib/notifeeCallScheduler.ts). But Android will only actually draw the
 * launched Activity OVER the lock screen if the Activity itself declares:
 *
 *     android:showWhenLocked="true"
 *     android:turnScreenOn="true"
 *
 * These can't be set from JS — they're manifest attributes on MainActivity.
 * This plugin injects them at prebuild time so the coach call takes over a
 * locked phone (rings + lights the screen) instead of silently downgrading
 * to a banner.
 *
 * Also ensures the two permissions full-screen intents require are present
 * (idempotent — they're also in app.json, but we guarantee them here so the
 * native behavior never depends on the static config being correct).
 *
 * Refs:
 *   https://developer.android.com/develop/ui/views/notifications/time-sensitive
 *   https://notifee.app/react-native/docs/android/behaviour#full-screen-action
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const REQUIRED_PERMISSIONS = [
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.WAKE_LOCK',
  'android.permission.DISABLE_KEYGUARD',
];

function withMainActivityLockFlags(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) {
      console.warn('[withFullScreenCall] no <application> in manifest — skipping');
      return config;
    }

    const mainActivity = (application.activity ?? []).find(
      (a) => a.$?.['android:name'] === '.MainActivity',
    );
    if (!mainActivity) {
      console.warn('[withFullScreenCall] .MainActivity not found — skipping lock flags');
      return config;
    }

    // These make the activity draw over the lock screen + wake the display
    // when launched by the full-screen intent (API 27+, i.e. effectively all
    // devices). Without them the fullScreenAction is downgraded to a banner.
    mainActivity.$['android:showWhenLocked'] = 'true';
    mainActivity.$['android:turnScreenOn'] = 'true';
    console.log('[withFullScreenCall] ✓ MainActivity showWhenLocked + turnScreenOn');

    return config;
  });
}

function withCallPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const existing = new Set(
      manifest.manifest['uses-permission'].map((p) => p.$?.['android:name']),
    );
    for (const perm of REQUIRED_PERMISSIONS) {
      if (!existing.has(perm)) {
        manifest.manifest['uses-permission'].push({ $: { 'android:name': perm } });
        console.log(`[withFullScreenCall] ✓ added permission ${perm}`);
      }
    }
    return config;
  });
}

module.exports = function withFullScreenCall(config) {
  config = withMainActivityLockFlags(config);
  config = withCallPermissions(config);
  return config;
};
