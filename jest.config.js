export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['<rootDir>/jest.vite-transform.cjs'],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library/react|@testing-library/jest-dom|@testing-library/user-event|@tanstack/react-query|leaflet|react-leaflet|@vercel/analytics)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'services/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'utils/**/*.{ts,tsx}',
    'repositories/**/*.{ts,tsx}',
    'types/**/*.{ts,tsx}',
    'driver/hooks/**/*.{ts,tsx}',
    'offlineQueue.ts',
    'supabaseClient.ts',
    'i18n/index.ts',
    '!hooks/useSupabaseData.ts',
    '!hooks/useAdminAI.ts',
    '!hooks/useOfflineSyncLoop.ts',
    '!hooks/useSupabaseMutations.ts',
    '!driver/hooks/useGpsCapture.ts',
    '!services/financeAuditService.ts',
    '!**/*.d.ts',
    '!vite-env.d.ts',
    '!node_modules/**',
    '!dist/**',
    '!driver-app/**',
    '!supabase/**',
    '!android/**',
    '!e2e/**',
    '!playwright.config.ts',
  ],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/*.(spec|test).[jt]s?(x)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '__tests__/helpers/',
  ],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
};
