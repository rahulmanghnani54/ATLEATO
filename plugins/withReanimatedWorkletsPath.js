/**
 * Config plugin that sets REACT_NATIVE_WORKLETS_NODE_MODULES_DIR as a Gradle
 * ext property on the app project, bypassing react-native-reanimated's
 * node-based resolution in build.gradle line 53 which fails on EAS Build.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withReanimatedWorkletsPath(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('REACT_NATIVE_WORKLETS_NODE_MODULES_DIR')) {
      // Already patched
      return config;
    }

    const snippet = [
      '// Bypass react-native-reanimated node resolution for react-native-worklets',
      'project.ext.set(',
      '  "REACT_NATIVE_WORKLETS_NODE_MODULES_DIR",',
      '  new File(rootProject.projectDir, "../node_modules/react-native-worklets").canonicalPath',
      ')',
      '',
    ].join('\n');

    // Inject before the first 'android {' block
    config.modResults.contents = config.modResults.contents.replace(
      /^(android\s*\{)/m,
      `${snippet}$1`
    );

    return config;
  });
};
