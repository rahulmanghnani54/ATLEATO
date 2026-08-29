/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^expo-.*$': '<rootDir>/stubs/expo-stub.js',
    // Reuses metro's web stub: a proxy that answers any property access, which
    // is all a Node test needs from react-native (Platform, StyleSheet, …).
    '^react-native$': '<rootDir>/stubs/native-web-stub.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
