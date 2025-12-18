/**
 * E2E Test: Dash categorization bug
 *
 * Bug: "1-1" causes the dash to be categorized as Symbol instead of UnpitchedElement
 * But typing "-" alone is correctly categorized as UnpitchedElement
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Dash categorization', () => {
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

  test('dash in "1-1" should be UnpitchedElement not Symbol', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "1-1"
    await page.keyboard.type('1-1');
    await page.waitForTimeout(100);

    // Open persistent model tab
    await openTab(page, 'tab-persistent');
    const persistentText = await readPaneText(page, 'pane-persistent');
    console.log('Persistent model for "1-1":', persistentText);

    // Check that the dash is UnpitchedElement (value 2), not Symbol (value 12)
    expect(persistentText).not.toContain('symbol');
    expect(persistentText).toContain('unpitched_element');
  });

  test('dash alone should be UnpitchedElement', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type just "-"
    await page.keyboard.type('-');
    await page.waitForTimeout(100);

    // Open persistent model tab
    await openTab(page, 'tab-persistent');
    const persistentText = await readPaneText(page, 'pane-persistent');
    console.log('Persistent model for "-":', persistentText);

    // Check that the dash is UnpitchedElement
    expect(persistentText).toContain('unpitched_element');
    expect(persistentText).not.toContain('symbol');
  });
});
