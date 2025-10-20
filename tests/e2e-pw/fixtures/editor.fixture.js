import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixture with editor-specific setup
 */
export const test = base.extend({
  /**
   * Provides an initialized editor page with focus
   */
  editorPage: async ({ page }, use) => {
    // Navigate to editor
    await page.goto('/');

    // Wait for editor initialization
    await page.waitForSelector('#notation-editor', { timeout: 10000 });

    // Wait for music editor global object
    await page.waitForFunction(
      () => typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app() !== null,
      { timeout: 10000 }
    );

    // Focus the editor
    await page.click('#notation-editor');
    await page.waitForFunction(
      () => document.activeElement?.id === 'notation-editor',
      { timeout: 5000 }
    );

    // Clear any existing content
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Use it
    await use(page);
  },

  /**
   * Provides the raw page without editor initialization
   */
  cleanPage: async ({ page }, use) => {
    await page.goto('/');
    await use(page);
  },
});

export { expect };
