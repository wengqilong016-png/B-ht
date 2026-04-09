import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Bahati Jackpots E2E tests.
 *
 * Runs against the local Vite dev server with the real auth gate enabled.
 * Individual specs can still mock Supabase responses with Playwright routes.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',

  /* Maximum time one test can run */
  timeout: 30_000,

  /* Run tests in parallel in CI */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI for stability */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* Start the Vite dev server before running tests */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3000',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_DISABLE_AUTH: 'false',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
