/**
 * Two-part fix for react-native-reanimated v4 on EAS Build with Gradle 8.14+:
 *
 * Part 1 (withDangerousMod): Patches node_modules/react-native-reanimated/android/build.gradle
 *   to replace the `providers.exec node --print require.resolve(...)` call (which fails on
 *   EAS Build / Gradle 8.14+) with a direct File path resolution.
 *
 * Part 2 (withSettingsGradle): Manually registers react-native-worklets as a Gradle
 *   sub-project in android/settings.gradle, since the package has no react-native.config.js
 *   and is not picked up by Expo/RN autolinking.
 */
const { withDangerousMod, withSettingsGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── Part 1: patch reanimated build.gradle ────────────────────────────────────

const OLD_EXEC_BLOCK = `    // Fallback to node resolver for custom directory structures like monorepos.
    def reactNativeWorkletsPackage = file(
        providers.exec {
            workingDir(rootDir)
            commandLine("node", "--print", "require.resolve('react-native-worklets/package.json')")
        }.standardOutput.asText.get().trim()
    )
    if (reactNativeWorkletsPackage.exists()) {
        return reactNativeWorkletsPackage.parentFile
    }`;

const NEW_EXEC_BLOCK = `    // Patched by withReanimatedWorkletsPath: direct File resolution (no node exec)
    def reactNativeWorkletsDir = new File(rootDir, "../node_modules/react-native-worklets")
    if (reactNativeWorkletsDir.exists()) {
        return reactNativeWorkletsDir
    }`;

function patchReanimatedBuildGradle(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const buildGradlePath = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        'react-native-reanimated',
        'android',
        'build.gradle'
      );

      if (!fs.existsSync(buildGradlePath)) {
        console.warn('[withReanimatedWorkletsPath] build.gradle not found:', buildGradlePath);
        return config;
      }

      let contents = fs.readFileSync(buildGradlePath, 'utf-8');

      if (contents.includes('Patched by withReanimatedWorkletsPath')) {
        return config; // already patched
      }

      if (contents.includes(OLD_EXEC_BLOCK)) {
        contents = contents.replace(OLD_EXEC_BLOCK, NEW_EXEC_BLOCK);
        fs.writeFileSync(buildGradlePath, contents, 'utf-8');
        console.log('[withReanimatedWorkletsPath] ✓ Patched reanimated build.gradle (removed node exec)');
      } else {
        console.warn('[withReanimatedWorkletsPath] providers.exec block not found — skipping build.gradle patch');
      }

      return config;
    },
  ]);
}

// ─── Part 2: register react-native-worklets in settings.gradle ────────────────

const WORKLETS_SETTINGS_SNIPPET = `
// Added by withReanimatedWorkletsPath: register react-native-worklets sub-project
// (package has no react-native.config.js so autolinking skips it)
include ':react-native-worklets'
project(':react-native-worklets').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-worklets/android')
`;

function addWorkletsToSettings(config) {
  return withSettingsGradle(config, (config) => {
    if (config.modResults.contents.includes('react-native-worklets')) {
      return config; // already added
    }
    config.modResults.contents += WORKLETS_SETTINGS_SNIPPET;
    console.log('[withReanimatedWorkletsPath] ✓ Added react-native-worklets to settings.gradle');
    return config;
  });
}

// ─── Export combined plugin ───────────────────────────────────────────────────

module.exports = function withReanimatedWorkletsPath(config) {
  config = patchReanimatedBuildGradle(config);
  config = addWorkletsToSettings(config);
  return config;
};
