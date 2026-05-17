/**
 * Bypasses react-native-reanimated's node-based resolution of react-native-worklets
 * in android/build.gradle line 53, which consistently fails on EAS Build with Gradle 8.14+.
 *
 * Sets REACT_NATIVE_WORKLETS_NODE_MODULES_DIR as a Gradle ext property on the app
 * project so reanimated skips the `node --print require.resolve(...)` call entirely.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const SNIPPET = `
// --- withReanimatedWorkletsPath plugin ---
// Bypass react-native-reanimated node resolution for react-native-worklets
project.ext.set(
  "REACT_NATIVE_WORKLETS_NODE_MODULES_DIR",
  new File(rootProject.projectDir, "../node_modules/react-native-worklets").canonicalPath
)
// --- end withReanimatedWorkletsPath plugin ---
`;

module.exports = function withReanimatedWorkletsPath(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('REACT_NATIVE_WORKLETS_NODE_MODULES_DIR')) {
      // Already patched — skip
      return config;
    }

    // Insert before the first occurrence of 'android {' (no regex needed)
    const insertionPoint = 'android {';
    const idx = config.modResults.contents.indexOf(insertionPoint);

    if (idx !== -1) {
      config.modResults.contents =
        config.modResults.contents.slice(0, idx) +
        SNIPPET +
        config.modResults.contents.slice(idx);
    } else {
      // Fallback: prepend to entire file
      config.modResults.contents = SNIPPET + '\n' + config.modResults.contents;
    }

    return config;
  });
};
