/**
 * Test ornament UI workflow with layered annotation architecture
 * Verifies copy/paste via menu and Alt+O keyboard shortcut
 */

import { test, expect } from '@playwright/test';

test.describe('Layered Ornament UI Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('should copy ornament text via menu', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament first
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    // Sync to cells
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    // Position cursor on the cell with ornament (col 0)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // Move to col 1 (cursor after "1")

    // Call copyOrnament via UI
    const copyResult = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.ui.copyOrnament();
    });

    // Check clipboard has ornament text
    const clipboardText = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.clipboard.ornamentNotation;
    });

    console.log('Clipboard ornament text:', clipboardText);
    expect(clipboardText).toBe('4 5');

    console.log('✅ Copy ornament via menu works');
  });

  test('should paste ornament text via menu', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Set clipboard with ornament text
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      app.editor.clipboard.ornamentNotation = '6 7';
    });

    // Position cursor on first note
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // cursor at col 1 (after "1")

    // Call pasteOrnament via UI
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.ui.pasteOrnament();
    });

    // Wait for rendering
    await page.waitForTimeout(500);

    // Verify ornament was applied
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Pasted ornament:', ornament);
    expect(ornament.notation).toBe('6 7');

    console.log('✅ Paste ornament via menu works');
  });

  test('should clear ornament via menu', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    // Verify it exists
    let ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });
    expect(ornament.notation).toBe('4 5');

    // Position cursor on the cell with ornament
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');

    // Call clearOrnament via UI
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.ui.clearOrnament();
    });

    // Wait for rendering
    await page.waitForTimeout(500);

    // Verify ornament was removed
    ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Ornament after clear:', ornament);
    expect(ornament).toBe(null);

    console.log('✅ Clear ornament via menu works');
  });

  test('should paste ornament via Alt+O shortcut', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Set clipboard with ornament text
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      app.editor.clipboard.ornamentNotation = '8 9';
    });

    // Position cursor on first note
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');

    // Press Alt+O to paste ornament
    await page.keyboard.press('Alt+o');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Verify ornament was applied
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Ornament applied via Alt+O:', ornament);
    expect(ornament.notation).toBe('8 9');

    console.log('✅ Alt+O keyboard shortcut works');
  });

  test('should handle ornament copy-paste workflow end-to-end', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3 4"
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // Apply ornament to first note
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '5 6 7', 'before');
    });

    // Sync to cells
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    // Copy ornament from first note
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // cursor at col 1
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.ui.copyOrnament();
    });

    // Move to third note and paste
    await page.keyboard.press('ArrowRight'); // col 2
    await page.keyboard.press('ArrowRight'); // col 3
    await page.keyboard.press('ArrowRight'); // col 4
    await page.keyboard.press('ArrowRight'); // col 5

    await page.keyboard.press('Alt+o'); // paste via keyboard shortcut

    // Wait for rendering
    await page.waitForTimeout(500);

    // Verify ornament was copied to second position
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 4); // Third note is at col 4
    });

    console.log('Copied ornament:', ornament);
    expect(ornament.notation).toBe('5 6 7');

    // Verify we have 2 ornaments on the line
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('All ornaments on line:', ornaments);
    expect(ornaments.length).toBe(2);

    console.log('✅ End-to-end copy-paste workflow works');
  });
});
