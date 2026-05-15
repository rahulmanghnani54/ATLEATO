/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tensorflow-models/pose-detection$': '<rootDir>/stubs/pose-detection-stub.js',
    '^@tensorflow/tfjs$': '<rootDir>/stubs/mediapipe-stub.js',
    '^expo-.*$': '<rootDir>/stubs/mediapipe-stub.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
};
