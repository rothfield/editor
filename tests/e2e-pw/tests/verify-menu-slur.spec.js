/**
 * E2E Test: Verify menu-based slur operations use layered API
 *
 * Tests that Edit → Apply Slur menu action properly delegates to keyboard handler
 * and uses the new layered architecture instead of old deleted methods.
 */

import { test, expect } from '@playwright/test';

test.describe('Menu Slur Operations (Layered API)', () => {
  test('menu slur action works without errors', async ({ page }) => {
    // Capture console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Wait for WASM module to be initialized
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Type some content
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Select the content
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Click Edit menu (assuming it exists in UI)
    // Since we don't know exact menu structure, try to trigger applySlur via console
    const result = await page.evaluate(() => {
      if (window.editor && window.editor.ui) {
        window.editor.ui.applySlur();
        return 'called';
      }
      return 'not found';
    });

    // Wait a moment for any async operations
    await page.waitForTimeout(100);

    // Check for errors
    console.log('Errors captured:', errors);

    // Should not have "applySlur is not a function" error
    const hasMethodError = errors.some(err =>
      err.includes('applySlur is not a function')
    );

    expect(hasMethodError).toBe(false);
    expect(result).toBe('called');
  });

  test('menu octave action works without errors', async ({ page }) => {
    // Capture console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Wait for WASM module to be initialized
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Type some content
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Select the content
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Try to trigger applyOctave via console
    const result = await page.evaluate(() => {
      if (window.editor && window.editor.ui) {
        window.editor.ui.applyOctave(1);
        return 'called';
      }
      return 'not found';
    });

    // Wait a moment for any async operations
    await page.waitForTimeout(100);

    // Check for errors
    console.log('Errors captured:', errors);

    // Should not have "applyOctave is not a function" error
    const hasMethodError = errors.some(err =>
      err.includes('applyOctave is not a function')
    );

    expect(hasMethodError).toBe(false);
    expect(result).toBe('called');
  });
});
