/**
 * Jest configuration for Drive Smart
 * Uses jest-expo preset for React Native / Expo SDK 54 compatibility.
 * Testing stack: jest-expo + @testing-library/react-native
 */
module.exports = {
  preset: 'jest-expo',
  // Run service-layer tests in Node environment
  testEnvironment: 'node',
  // Transform all source files through babel-jest using the project's babel config.
  // Allow transformation of all Expo/React Native packages.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated)',
  ],
  // Map @/ alias to project root (matches tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Mock native modules that do not run in Node/Jest
    '^react-native-gesture-handler$': '<rootDir>/tests/__mocks__/react-native-gesture-handler.js',
    '^react-native-reanimated$': '<rootDir>/tests/__mocks__/react-native-reanimated.js',
    '^expo-haptics$': '<rootDir>/tests/__mocks__/expo-haptics.js',
    '^expo-secure-store$': '<rootDir>/tests/__mocks__/expo-secure-store.js',
    '^expo-local-authentication$': '<rootDir>/tests/__mocks__/expo-local-authentication.js',
    '^expo-notifications$': '<rootDir>/tests/__mocks__/expo-notifications.js',
    '^expo-updates$': '<rootDir>/tests/__mocks__/expo-updates.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/tests/__mocks__/@react-native-async-storage/async-storage.js',
  },
  // Test file locations
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/tests/**/*.spec.tsx',
  ],
  // Collect coverage from source files only
  collectCoverageFrom: [
    'services/**/*.ts',
    'hooks/**/*.ts',
    'contexts/**/*.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/supabase/**',
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  // Test timeout — allow async operations to complete
  testTimeout: 15000,
  // Verbose output for CI
  verbose: true,
  // Pass even when no tests exist yet (prevents CI failure on new repos)
  passWithNoTests: true,
};
