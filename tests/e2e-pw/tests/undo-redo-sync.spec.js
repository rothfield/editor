// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Tests for undo/redo synchronization
 *
 * Verifies that undo/redo operations maintain correct document state
 * and don't cause text corruption from spurious input events.
 */

test.describe('Undo/Redo Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    // Wait for WASM to load
    await expect(page.locator('[data-testid="notation-textarea-0"]')).toBeVisible({ timeout: 10000 });
  });

  test('redo should restore text correctly without corruption', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type some content
    await textarea.click();
    await textarea.type('1');

    // Wait for the input to be processed
    await page.waitForTimeout(100);

    // Get the text after typing (should be PUA character)
    const textAfterType = await textarea.inputValue();
    console.log('Text after typing 1:', textAfterType, 'length:', textAfterType.length);

    // Verify we have 1 character (could be ASCII or PUA)
    expect(textAfterType.length).toBe(1);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Text should be empty
    const textAfterUndo = await textarea.inputValue();
    console.log('Text after undo:', textAfterUndo, 'length:', textAfterUndo.length);
    expect(textAfterUndo.length).toBe(0);

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);

    // Text should be restored to 1 character
    const textAfterRedo = await textarea.inputValue();
    console.log('Text after redo:', textAfterRedo, 'length:', textAfterRedo.length);
    expect(textAfterRedo.length).toBe(1);

    // The restored text should match the original
    expect(textAfterRedo).toBe(textAfterType);
  });

  test('redo should not cause text duplication', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Type "1 2" (with a space)
    await textarea.click();
    await textarea.type('1 2');

    await page.waitForTimeout(100);

    const originalText = await textarea.inputValue();
    const originalLength = originalText.length;
    console.log('Original text:', originalText, 'length:', originalLength);

    // Should have 3 characters (pitch, space, pitch)
    expect(originalLength).toBe(3);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);

    const restoredText = await textarea.inputValue();
    console.log('Restored text:', restoredText, 'length:', restoredText.length);

    // Length should match original exactly - no duplication
    expect(restoredText.length).toBe(originalLength);
    expect(restoredText).toBe(originalText);
  });

  test('multiple undo/redo cycles should maintain correct state', async ({ page }) => {
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Helper to count Unicode characters (handles surrogate pairs)
    const charCount = (str) => [...str].length;

    // Type characters one at a time
    await textarea.click();
    await textarea.type('1');
    await page.waitForTimeout(50);
    await textarea.type('2');
    await page.waitForTimeout(50);
    await textarea.type('3');
    await page.waitForTimeout(50);

    const text3Chars = await textarea.inputValue();
    console.log('After 123:', charCount(text3Chars), 'chars (code units:', text3Chars.length, ')');
    expect(charCount(text3Chars)).toBe(3);

    // Undo once (back to "12")
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    const text2Chars = await textarea.inputValue();
    console.log('After undo 1:', charCount(text2Chars), 'chars');
    expect(charCount(text2Chars)).toBe(2);

    // Undo again (back to "1")
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    const text1Char = await textarea.inputValue();
    console.log('After undo 2:', charCount(text1Char), 'chars');
    expect(charCount(text1Char)).toBe(1);

    // Redo (back to "12")
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);
    const textRedo1 = await textarea.inputValue();
    console.log('After redo 1:', charCount(textRedo1), 'chars');
    expect(charCount(textRedo1)).toBe(2);
    expect(textRedo1).toBe(text2Chars);

    // Redo again (back to "123")
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);
    const textRedo2 = await textarea.inputValue();
    console.log('After redo 2:', charCount(textRedo2), 'chars');
    expect(charCount(textRedo2)).toBe(3);
    expect(textRedo2).toBe(text3Chars);
  });

  test('undo/redo should not trigger spurious setLineText calls', async ({ page }) => {
    // Collect console messages
    const consoleMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('setLineText') || text.includes('Skipping input handler')) {
        consoleMessages.push(text);
      }
    });

    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    await textarea.click();
    await textarea.type('1');
    await page.waitForTimeout(100);

    // Clear messages after initial setup
    consoleMessages.length = 0;

    // Perform undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // Perform redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);

    // Check if any setLineText was called during redo (there shouldn't be any)
    // If our guard works, we should see "Skipping input handler" messages instead
    const setLineTextCalls = consoleMessages.filter(m =>
      m.includes('[WASM] setLineText') && !m.includes('Skipping')
    );

    console.log('Console messages during undo/redo:', consoleMessages);
    console.log('setLineText calls during undo/redo:', setLineTextCalls.length);

    // There should be no setLineText calls during undo/redo
    // (setLineText should only be called during user input, not programmatic updates)
    expect(setLineTextCalls.length).toBe(0);
  });
});
