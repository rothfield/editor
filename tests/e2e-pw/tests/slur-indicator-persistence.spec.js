/**
 * E2E Test: Slur Indicator Persistence
 *
 * Bug: When applying a slur via Alt+S, the slur_indicator field in the
 * persistent model shows "none" instead of "slur_start"/"slur_end".
 *
 * Steps to reproduce:
 * 1. Type "12"
 * 2. Select both characters with Shift+Left Arrow twice
 * 3. Press Alt+S to apply slur
 * 4. Check persistent model tab - slur_indicator shows "none"
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur Indicator Persistence Bug', () => {
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

  test('Alt+S should set slur_indicator in persistent model', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type: 12 (two adjacent notes)
    await page.keyboard.type('12');
    await page.waitForTimeout(200);

    // Select both characters with Shift+Left Arrow twice
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(100);

    // Apply slur with Alt+S
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Open the persistent model tab (data-testid="tab-docmodel")
    await openTab(page, 'tab-docmodel');
    const persistentModel = await readPaneText(page, 'pane-docmodel');

    console.log('Persistent Model after Alt+S:');
    console.log(persistentModel);

    // The bug: slur_indicator shows "none" for all cells
    // Expected: first cell has slur_start, second cell has slur_end

    // Check that at least one cell has slur_start
    expect(persistentModel).toContain('slur_start');

    // Check that at least one cell has slur_end
    expect(persistentModel).toContain('slur_end');
  });

  test('Slur indicator should persist after save/load cycle', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type: 1 2 3 (three notes with spaces)
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(200);

    // Go to start and select all
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply slur with Alt+S
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Open the persistent model tab
    await openTab(page, 'tab-docmodel');
    const persistentModel = await readPaneText(page, 'pane-docmodel');

    console.log('Persistent Model with spaced notes:');
    console.log(persistentModel);

    // Verify slur indicators are set
    expect(persistentModel).toContain('slur_start');
    expect(persistentModel).toContain('slur_end');
  });
});
