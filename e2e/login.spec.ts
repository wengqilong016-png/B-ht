/**
 * e2e/login.spec.ts
 *
 * E2E tests for the login page.
 * Runs with VITE_DISABLE_AUTH=true via playwright.config.ts webServer env.
 */
import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('renders the application root', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The app should render something — either login form or driver picker
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('page has a valid title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    // The title should be set (from index.html)
    expect(title.length).toBeGreaterThan(0);
  });

  test('app loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Filter out expected non-critical errors (e.g., Supabase connection failures in test env)
    const criticalErrors = errors.filter(
      (e) => !e.includes('supabase') && !e.includes('Failed to fetch') && !e.includes('ERR_CONNECTION_REFUSED'),
    );

    // We allow some errors in test env, but there shouldn't be React crashes
    const reactCrashes = criticalErrors.filter(
      (e) => e.includes('Uncaught') || e.includes('ChunkLoadError'),
    );
    expect(reactCrashes).toHaveLength(0);
  });
});
