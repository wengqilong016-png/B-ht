/**
 * e2e/login.spec.ts
 *
 * E2E tests for the login page.
 * Runs with auth enabled and uses Playwright route mocks for the happy path.
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

  test('correct account login fetches profile and enters the authenticated shell without profile errors', async ({ page }) => {
    const authUser = {
      id: 'auth-user-1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'driver@example.com',
      email_confirmed_at: '2026-04-09T00:00:00.000Z',
      phone: '',
      confirmation_sent_at: '2026-04-09T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-04-09T00:00:00.000Z',
      updated_at: '2026-04-09T00:00:00.000Z',
      is_anonymous: false,
    };

    await page.addInitScript((user) => {
      const originalFetch = window.fetch.bind(window);

      const jsonResponse = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'content-type': 'application/json',
            ...extraHeaders,
          },
        });

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = request.url;

        if (url.includes('/auth/v1/health')) {
          return jsonResponse(503, { healthy: false });
        }

        if (url.includes('/auth/v1/token')) {
          return jsonResponse(200, {
            access_token: 'mock-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: 1_900_000_000,
            refresh_token: 'mock-refresh-token',
            user,
          });
        }

        if (url.includes('/auth/v1/user')) {
          const authHeader = request.headers.get('authorization');
          return authHeader === 'Bearer mock-access-token'
            ? jsonResponse(200, user)
            : jsonResponse(401, { message: 'JWT missing' });
        }

        if (url.includes('/rest/v1/profiles')) {
          return jsonResponse(
            200,
            {
              role: 'driver',
              display_name: 'Driver One',
              driver_id: 'drv-1',
              must_change_password: false,
            },
            { 'content-range': '0-0/1' },
          );
        }

        return originalFetch(input, init);
      };
    }, authUser);

    await page.goto('/');
    await page.locator('#email-input').fill('driver@example.com');
    await page.locator('#password-input').fill('correct-password');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('authenticated-app-shell')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Profile not found');
    await expect(page.locator('body')).not.toContainText('Invalid role');
    await expect(page.locator('body')).not.toContainText('账号存在但未配置权限');
    await expect(page.locator('body')).not.toContainText('账号角色配置错误');
  });
});
