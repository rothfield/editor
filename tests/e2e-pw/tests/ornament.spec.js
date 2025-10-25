// Ornament Editor - Refactored Implementation E2E Test
//
// Tests the refactored ornament editor that reuses the canvas infrastructure

import { test, expect } from '@playwright/test';

test.describe('Ornament Editor - Refactored', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Wait for editor to initialize
    await page.waitForSelector('#notation-editor', { state: 'visible' });
    await page.waitForTimeout(2000); // Give WASM time to load
  });

  test('should open ornament editor dialog with mini canvas', async ({ page }) => {
    // Type some notes first
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.waitForTimeout(500);

    // Move cursor to first note
    await page.keyboard.press('Home');

    // Open ornament editor via menu
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');

    // Wait for dialog to appear
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });

    // Verify dialog title
    const title = await page.textContent('#ornament-editor-header h3');
    expect(title).toBe('Create Ornament');

    // Verify mini canvas exists
    const miniCanvas = await page.locator('#ornament-mini-canvas');
    await expect(miniCanvas).toBeVisible();

    // Verify placement controls exist and After is default
    const afterPlacement = await page.locator('input[name="placement"][value="After"]');
    await expect(afterPlacement).toBeVisible();
    await expect(afterPlacement).toBeChecked();
  });

  test.skip('should allow typing in mini canvas', async ({ page }) => {
    // Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });

    // Focus mini canvas
    await page.click('#ornament-mini-canvas');
    await page.waitForTimeout(100);

    // Type in mini canvas
    await page.keyboard.type('gr');
    await page.waitForTimeout(500);

    // Check if any content was rendered in mini canvas
    // The cells should be rendered by DOMRenderer
    const miniCanvas = page.locator('#ornament-mini-canvas');
    const hasContent = await miniCanvas.evaluate(el => {
      return el.querySelector('.char-cell') !== null ||
             el.querySelector('.line-container') !== null ||
             el.textContent.trim().length > 0;
    });
    expect(hasContent).toBeTruthy();
  });

  test('should save ornament and close dialog', async ({ page }) => {
    // Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });
    await page.waitForTimeout(300);

    // Type ornament
    await page.click('#ornament-mini-canvas');
    await page.waitForTimeout(200);
    await page.keyboard.type('gr');
    await page.waitForTimeout(500);

    // Save using Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Dialog should be closed
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible({ timeout: 3000 });
  });

  test.skip('should support backspace in mini canvas', async ({ page }) => {
    // Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });

    // Type and delete
    await page.click('#ornament-mini-canvas');
    await page.waitForTimeout(100);
    await page.keyboard.type('grs');
    await page.waitForTimeout(300);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    // Should have 2 cells (gr) - verify by saving and closing
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Dialog should be closed (which means save was successful)
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible({ timeout: 3000 });
  });

  test('should cancel with Escape key', async ({ page }) => {
    // Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });

    // Type something
    await page.click('#ornament-mini-canvas');
    await page.keyboard.type('gr');

    // Cancel with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Dialog should be closed
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible();
  });

  test('should change placement option', async ({ page }) => {
    // Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForSelector('#ornament-editor-dialog', { state: 'visible' });

    // Change placement to Before
    await page.click('input[name="placement"][value="Before"]');

    // Verify it's checked
    const beforePlacement = await page.locator('input[name="placement"][value="Before"]');
    await expect(beforePlacement).toBeChecked();
  });
});
