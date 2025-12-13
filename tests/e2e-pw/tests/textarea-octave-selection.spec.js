// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Tests for selection preservation after applying octave.
 * BUG FIX: After octave operation, refocus textarea to show native selection
 * instead of relying on custom overlay (which had surrogate pair issues).
 */
test.describe('Textarea Octave Selection', () => {

  test('selection restored after upper octave via Edit menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.waitForFunction(() => typeof window.musicEditor !== 'undefined');

    const textarea = page.locator('.notation-textarea').first();
    await textarea.click();
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('notation-textarea'),
      { timeout: 5000 }
    );

    // Type 1111 and select all
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1111');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Apply upper octave via Edit menu
    await page.click('#edit-menu-button');
    await page.waitForTimeout(50);
    await page.click('#menu-octave-upper');
    await page.waitForTimeout(200);

    // After fix: textarea should be refocused with native selection
    const result = await page.evaluate(() => {
      const textarea = document.querySelector('.notation-textarea');
      const text = textarea.value;
      const isFocused = document.activeElement === textarea;
      return {
        isFocused,
        charCount: Array.from(text).length,
        selStart: textarea.selectionStart,
        selEnd: textarea.selectionEnd,
        selectedCharCount: Array.from(text.substring(textarea.selectionStart, textarea.selectionEnd)).length
      };
    });

    console.log('After Edit menu octave:', result);

    // Textarea should be focused (fix: refocusLine called)
    expect(result.isFocused).toBe(true);
    // All 4 chars should be selected
    expect(result.charCount).toBe(4);
    expect(result.selectedCharCount).toBe(4);
  });

  test('selection restored after upper octave via keyboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.waitForFunction(() => typeof window.musicEditor !== 'undefined');

    const textarea = page.locator('.notation-textarea').first();
    await textarea.click();
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('notation-textarea'),
      { timeout: 5000 }
    );

    // Type 1234 and select all
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1234');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Apply upper octave via keyboard
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => {
      const textarea = document.querySelector('.notation-textarea');
      const text = textarea.value;
      return {
        isFocused: document.activeElement === textarea,
        charCount: Array.from(text).length,
        selectedCharCount: Array.from(text.substring(textarea.selectionStart, textarea.selectionEnd)).length
      };
    });

    console.log('After keyboard octave:', result);

    expect(result.isFocused).toBe(true);
    expect(result.charCount).toBe(4);
    expect(result.selectedCharCount).toBe(4);
  });
});
