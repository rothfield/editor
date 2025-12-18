/**
 * E2E Test: Focus returns to textarea after edit menu actions
 *
 * After using edit menu actions (like Apply Slur), focus should
 * return to the textarea so the user can continue typing.
 */

import { test, expect } from '@playwright/test';

test.describe('Edit menu focus return', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('focus returns to textarea after Apply Slur menu action', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(100);

    // Get the textarea that should be focused
    const textarea = page.locator('#notation-editor textarea').first();

    // Verify textarea is focused before menu action
    await expect(textarea).toBeFocused();

    // Open Edit menu and click "Slur Selection"
    await page.click('#edit-menu-button');
    await page.waitForTimeout(100);

    // Click the slur selection menu item
    await page.click('[data-action="slur-selection"]');
    await page.waitForTimeout(200);

    // Verify textarea is focused after menu action
    await expect(textarea).toBeFocused();

    // Verify selection overlay is removed (native selection should show instead)
    const overlay = page.locator('.textarea-selection-overlay');
    await expect(overlay).toHaveCount(0);
  });

  test('focus returns to textarea after Copy menu action', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(100);

    const textarea = page.locator('#notation-editor textarea').first();
    await expect(textarea).toBeFocused();

    // Open Edit menu and click "Copy"
    await page.click('#edit-menu-button');
    await page.waitForTimeout(100);
    await page.click('[data-action="copy"]');
    await page.waitForTimeout(200);

    // Verify textarea is focused after menu action
    await expect(textarea).toBeFocused();

    // Verify selection overlay is removed
    const overlay = page.locator('.textarea-selection-overlay');
    await expect(overlay).toHaveCount(0);
  });
});
