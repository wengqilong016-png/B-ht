/**
 * e2e/pages/BasePage.ts
 *
 * Page Object Model base class with common navigation and utility methods.
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to the app root. */
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Wait for the app to finish loading (loading spinner disappears). */
  async waitForAppReady(): Promise<void> {
    // Wait for React to mount — look for common root elements
    await this.page.waitForSelector('[data-testid="app-root"], #root', {
      state: 'attached',
      timeout: 15_000,
    }).catch(() => {
      // Selector not found — proceed to network idle check below
    });
    await this.page.waitForLoadState('networkidle').catch(() => {
      // Network idle may not apply in offline/local mode — proceed anyway
    });
  }

  /** Get the current visible page title or heading. */
  async getHeading(): Promise<string> {
    const h1 = this.page.locator('h1').first();
    return await h1.textContent() ?? '';
  }

  /** Check if an element with the given text is visible. */
  async hasText(text: string): Promise<boolean> {
    const loc = this.page.getByText(text).first();
    return await loc.isVisible().catch(() => false);
  }
}
