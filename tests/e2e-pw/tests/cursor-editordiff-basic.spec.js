/**
 * Test EditorDiff integration - verify cursor updates from WASM
 *
 * This test verifies that the new EditorDiff return type works correctly
 * for basic operations: typing, backspace, and Enter.
 */

import { test, expect } from '@playwright/test';

test.describe('EditorDiff Cursor Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('typing updates cursor position from WASM EditorDiff', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    // Type some text
    await editor.type('123');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Check that cells were created
    const cells = page.locator('.char-cell');
    await expect(cells).toHaveCount(3);

    // Check cursor position in HUD
    const cursorPosition = page.locator('#editor-cursor-position');
    const cursorText = await cursorPosition.textContent();

    // Cursor should be at column 3 (after typing 3 characters)
    expect(cursorText).toContain('Col: 3');
  });

  test('backspace updates cursor position from WASM EditorDiff', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    // Type text
    await editor.type('123');
    await page.waitForTimeout(100);

    // Backspace once
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Check cells (should be 2 left)
    const cells = page.locator('.char-cell');
    await expect(cells).toHaveCount(2);

    // Check cursor position
    const cursorPosition = page.locator('#editor-cursor-position');
    const cursorText = await cursorPosition.textContent();

    // Cursor should be at column 2 (after deleting 1 character)
    expect(cursorText).toContain('Col: 2');
  });

  test('Enter key creates new line and updates cursor from WASM EditorDiff', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    // Type on first line
    await editor.type('12');
    await page.waitForTimeout(100);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Check cursor moved to line 1 (second line), column 0
    const cursorPosition = page.locator('#editor-cursor-position');
    const cursorText = await cursorPosition.textContent();

    expect(cursorText).toContain('Line: 1');
    expect(cursorText).toContain('Col: 0');

    // Type on second line
    await editor.type('34');
    await page.waitForTimeout(100);

    // Should have 4 cells total (2 on each line)
    const cells = page.locator('.char-cell');
    await expect(cells).toHaveCount(4);
  });

  test('cursor state comes from WASM (EditorDiff.caret)', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    // Listen to console logs to verify WASM is returning EditorDiff
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('insertText result from WASM')) {
        logs.push(text);
      }
    });

    // Type text
    await editor.type('1');
    await page.waitForTimeout(200);

    // Verify that we got a log (WASM was called)
    expect(logs.length).toBeGreaterThan(0);

    // Note: Can't easily inspect EditorDiff structure from browser,
    // but if cursor works, EditorDiff is working
  });
});
