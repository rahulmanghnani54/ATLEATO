#!/usr/bin/env node
/**
 * Patches react-native-reanimated/android/build.gradle to replace the
 * `providers.exec` node call (which fails on EAS Build / Gradle 8.14+)
 * with a direct File path resolution.
 *
 * Run this script BEFORE expo prebuild via eas.json `prebuildCommand`.
 * Safe to run multiple times — idempotent.
 */

const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-reanimated',
  'android',
  'build.gradle'
);

if (!fs.existsSync(buildGradlePath)) {
  console.error('[patch-reanimated] ERROR: build.gradle not found at:', buildGradlePath);
  process.exit(1);
}

let content = fs.readFileSync(buildGradlePath, 'utf-8');

// Check if the problematic block is present (idempotency check)
const PROBLEM_MARKER = "require.resolve('react-native-worklets/package.json')";
if (!content.includes(PROBLEM_MARKER)) {
  console.log('[patch-reanimated] providers.exec worklets block not found — already patched or upstream fix applied. Skipping.');
  process.exit(0);
}

// Match the providers.exec block for worklets resolution
// Original block (react-native-reanimated v4.x):
//   // Fallback to node resolver for custom directory structures like monorepos.
//   def reactNativeWorkletsPackage = file(
//       providers.exec {
//           workingDir(rootDir)
//           commandLine("node", "--print", "require.resolve('react-native-worklets/package.json')")
//       }.standardOutput.asText.get().trim()
//   )
//   if (reactNativeWorkletsPackage.exists()) {
//       return reactNativeWorkletsPackage.parentFile
//   }
const execBlockRegex = /\/\/ Fallback to node resolver[^\n]*\n\s*def reactNativeWorkletsPackage = file\(\s*providers\.exec \{[\s\S]*?return reactNativeWorkletsPackage\.parentFile\s*\n\s*\}/;

const replacement = `// Patched by scripts/patch-reanimated.js: direct File resolution (no node exec)
    // providers.exec fails on EAS Build with Gradle 8.14+
    def reactNativeWorkletsDir = new File(rootDir, "../node_modules/react-native-worklets")
    if (reactNativeWorkletsDir.exists()) {
        return reactNativeWorkletsDir
    }`;

if (execBlockRegex.test(content)) {
  content = content.replace(execBlockRegex, replacement);
  fs.writeFileSync(buildGradlePath, content, 'utf-8');
  console.log('[patch-reanimated] ✓ Successfully patched react-native-reanimated build.gradle');
} else {
  // The PROBLEM_MARKER was found but our regex didn't match — different whitespace or formatting.
  // Try a more permissive approach: find and replace just the providers.exec call itself.
  console.warn('[patch-reanimated] Primary regex did not match — attempting targeted replacement...');

  const targetedRegex = /providers\.exec \{\s*\n\s*workingDir\(rootDir\)\s*\n\s*commandLine\("node", "--print", "require\.resolve\('react-native-worklets\/package\.json'\)"\)\s*\n\s*\}\.standardOutput\.asText\.get\(\)\.trim\(\)/;

  if (targetedRegex.test(content)) {
    // Replace the broader wrapping expression
    const wrapperRegex = /def reactNativeWorkletsPackage = file\(\s*providers\.exec \{[\s\S]*?\.standardOutput\.asText\.get\(\)\.trim\(\)\s*\)\s*\n\s*if \(reactNativeWorkletsPackage\.exists\(\)\) \{\s*\n\s*return reactNativeWorkletsPackage\.parentFile\s*\n\s*\}/;
    if (wrapperRegex.test(content)) {
      content = content.replace(wrapperRegex, `def reactNativeWorkletsDir = new File(rootDir, "../node_modules/react-native-worklets")
    if (reactNativeWorkletsDir.exists()) {
        return reactNativeWorkletsDir
    }`);
      fs.writeFileSync(buildGradlePath, content, 'utf-8');
      console.log('[patch-reanimated] ✓ Applied targeted patch to react-native-reanimated build.gradle');
    } else {
      console.error('[patch-reanimated] ERROR: Could not apply targeted patch either.');
      process.exit(1);
    }
  } else {
    console.error('[patch-reanimated] ERROR: Could not locate providers.exec block with any regex pattern.');
    console.error('[patch-reanimated] Manual intervention required.');
    process.exit(1);
  }
}
