// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Tests for undo/redo of selection-based mutations (superscript, slur, octave)
 */

test.describe('Undo Selection Mutations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    // Wait for WASM to load
    await expect(page.locator('[data-testid="notation-textarea-0"]')).toBeVisible({ timeout: 10000 });
  });

  test('undo superscript mutation should restore normal notes', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type some content
    await textarea.click();
    await textarea.type('1 2');
    await page.waitForTimeout(100);

    // Get original text
    const originalText = await textarea.inputValue();
    console.log('Original text:', originalText, 'length:', [...originalText].length);

    // Select all (Ctrl+A)
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Apply superscript (Ctrl+ArrowUp)
    await page.keyboard.press('Control+ArrowUp');
    await page.waitForTimeout(100);

    // Get text after superscript
    const superscriptText = await textarea.inputValue();
    console.log('After superscript:', superscriptText, 'length:', [...superscriptText].length);

    // Text should be different after superscript (PUA codepoints change)
    expect(superscriptText).not.toBe(originalText);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Get text after undo
    const afterUndoText = await textarea.inputValue();
    console.log('After undo:', afterUndoText, 'length:', [...afterUndoText].length);

    // Text should be restored to original
    expect(afterUndoText).toBe(originalText);
  });

  test('redo superscript mutation should reapply superscript', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type some content
    await textarea.click();
    await textarea.type('1 2');
    await page.waitForTimeout(100);

    const originalText = await textarea.inputValue();

    // Select all and apply superscript
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);
    await page.keyboard.press('Control+ArrowUp');
    await page.waitForTimeout(100);

    const superscriptText = await textarea.inputValue();

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Verify undone
    expect(await textarea.inputValue()).toBe(originalText);

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);

    // Verify redone
    const afterRedoText = await textarea.inputValue();
    expect(afterRedoText).toBe(superscriptText);
  });
});
