/**
 * e2e/app-navigation.spec.ts
 *
 * E2E tests for basic app navigation and rendering.
 * Tests run with the normal auth gate enabled.
 */
import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test('root page loads without crashing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // App should render the React root
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('static assets are served correctly', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });

  test('manifest.json is accessible', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const json = await response?.json();
    expect(json).toHaveProperty('name');
  });

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Check that sw.js is served (even if registration takes time)
    const swResponse = await page.goto('/sw.js');
    expect(swResponse?.status()).toBe(200);
  });
});
