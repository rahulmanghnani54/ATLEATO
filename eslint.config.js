// Flat ESLint config (ESLint 9). NOTE: ESLint 9 uses this file and ignores the
// legacy .eslintrc.js. Built on Expo's recommended rules (which include the
// TypeScript + React Native / React Hooks rules that catch real bugs — bad hook
// deps, unsafe patterns, etc.). We keep it bug-focused, not style-noise.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // Don't lint generated / native / server-side dirs.
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'dist/**',
      'supabase/functions/**', // Deno runtime — separate toolchain
      'scripts/**',            // build-time Node scripts (EAS), not app code
      'plugins/**',            // Expo config plugins (build-time Node), not app code
      'docs/**',               // marketing/landing site (vendored JS), not app code
      'babel.config.js',
      'metro.config.js',
      'eslint.config.js',
    ],
  },
  {
    // Silence cosmetic/style rules so lint stays a BUG signal, not noise.
    // (react-hooks/* and other correctness rules from Expo's config stay ON.)
    rules: {
      'react/no-unescaped-entities': 'off',  // apostrophes/quotes in JSX text — cosmetic
      'import/first': 'off',
      'import/no-duplicates': 'warn',
      // no-undef misfires on TypeScript (TS itself catches undefined vars via
      // tsc); typescript-eslint officially recommends disabling it. Off prevents
      // 138 false-positive "errors" on globals/types.
      'no-undef': 'off',
      'no-var': 'warn',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',     // signal, don't block
      '@typescript-eslint/array-type': 'off',          // T[] vs Array<T> — style
      '@typescript-eslint/no-require-imports': 'off',   // require() for RN assets is normal
    },
  },
];
