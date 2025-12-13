/**
 * Test: Cursor positioning with sharp accidentals
 *
 * When typing "1#2", the display has 2 glyphs. Some glyphs may require
 * surrogate pairs (2 code units), so cursor positions are measured in
 * characters (glyphs) not code units.
 */

import { test, expect } from '@playwright/test';
import { typeInEditor } from '../utils/editor.helpers.js';

/**
 * Helper: Get cursor position as character index (not code units)
 * Handles surrogate pairs correctly
 */
async function getCursorCharIndex(textarea) {
  return await textarea.evaluate(el => {
    const text = el.value;
    const codeUnitPos = el.selectionStart;
    // Convert code unit position to character index
    let cu = 0;
    let ci = 0;
    for (const char of text) {
      if (cu >= codeUnitPos) return ci;
      cu += char.length; // 1 for BMP, 2 for surrogate
      ci++;
    }
    return ci;
  });
}

/**
 * Helper: Get character count (not code unit count)
 */
async function getCharCount(textarea) {
  return await textarea.evaluate(el => Array.from(el.value).length);
}

test.describe('Textarea sharp glyph cursor positioning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="notation-textarea-0"]');
  });

  test('cursor position after typing 1#2 should be at end (position 2)', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type "1#2" - becomes 2 glyphs (possibly with line variants)
    await typeInEditor(page, '1#2');

    // Get cursor position as character index
    const charCount = await getCharCount(textarea);
    const cursorCharIdx = await getCursorCharIndex(textarea);

    console.log('Char count:', charCount, 'Cursor char idx:', cursorCharIdx);

    // Text is 2 glyphs, cursor should be at position 2 (end)
    expect(charCount).toBe(2);
    expect(cursorCharIdx).toBe(2);
  });

  test('left arrow from end of 1#2 should move cursor to position 1', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    await typeInEditor(page, '1#2');

    // Press left arrow once
    await page.keyboard.press('ArrowLeft');

    const cursorCharIdx = await getCursorCharIndex(textarea);
    console.log('After ArrowLeft, cursor char idx:', cursorCharIdx);

    // Should be between the two glyphs (position 1)
    expect(cursorCharIdx).toBe(1);
  });

  test('two left arrows from end of 1#2 should move cursor to position 0', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    await typeInEditor(page, '1#2');

    // Press left arrow twice
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    const cursorCharIdx = await getCursorCharIndex(textarea);
    console.log('After 2 ArrowLefts, cursor char idx:', cursorCharIdx);

    // Should be at start (position 0)
    expect(cursorCharIdx).toBe(0);
  });

  test('inserting after 1# should place char after first glyph', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type "1#" first - single glyph
    await typeInEditor(page, '1#');

    // Cursor should be at position 1 (after the single glyph)
    let cursorCharIdx = await getCursorCharIndex(textarea);
    expect(cursorCharIdx).toBe(1);

    // Type "3"
    await page.keyboard.type('3');

    // Should now have 2 glyphs: 1# and 3
    const charCount = await getCharCount(textarea);
    expect(charCount).toBe(2);

    // Cursor should be at position 2
    cursorCharIdx = await getCursorCharIndex(textarea);
    expect(cursorCharIdx).toBe(2);
  });

  test('backspace after 1#2 should delete the 2, leaving 1#', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    await typeInEditor(page, '1#2');

    // Press backspace
    await page.keyboard.press('Backspace');

    const textContent = await textarea.inputValue();
    const chars = Array.from(textContent);

    // Should have 1 glyph (the 1# composite - may have line variant codepoint)
    expect(chars.length).toBe(1);
    // First char should be a PUA glyph
    expect(chars[0].codePointAt(0)).toBeGreaterThanOrEqual(0xE000);
  });
});
