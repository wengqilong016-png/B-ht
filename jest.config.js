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
    '**/*.{ts,tsx}',
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
  coverageThreshold: {
    global: {
      branches: 22,
      functions: 19,
      lines: 30,
      statements: 28,
    },
  },
};