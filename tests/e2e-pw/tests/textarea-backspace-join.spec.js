import { test, expect } from '@playwright/test';

test.describe('Textarea backspace joins lines', () => {
  test('backspace at beginning of line should join with previous line', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12", Enter, "34"
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await page.keyboard.type('34');

    // Should have 2 lines
    let textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(2);

    // Move to start of second line
    await page.keyboard.press('Home');

    // Verify cursor is at start
    const line2 = textareas.nth(1);
    const cursorBefore = await line2.evaluate(el => el.selectionStart);
    expect(cursorBefore).toBe(0);

    // Press backspace - should join lines
    await page.keyboard.press('Backspace');

    // Should now have 1 line
    textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(1);

    // Content should be "1234" (joined)
    const joinedTextarea = textareas.first();
    const value = await joinedTextarea.evaluate(el => el.value);
    const chars = Array.from(value);
    console.log('Joined value length:', chars.length);
    expect(chars.length).toBe(4); // "1234"

    // Cursor should be after "12" (position 2, or 4 code units for surrogate pairs)
    const cursorPos = await joinedTextarea.evaluate(el => el.selectionStart);
    console.log('Cursor position after join:', cursorPos);
    expect(cursorPos).toBe(4); // After 2 surrogate pairs
  });

  test('backspace at beginning of first line should do nothing', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12"
    await page.keyboard.type('12');

    // Move to start
    await page.keyboard.press('Home');

    // Press backspace - should do nothing (first line)
    await page.keyboard.press('Backspace');

    // Should still have 1 line
    const textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(1);

    // Content should still be "12"
    const value = await textarea.evaluate(el => el.value);
    const chars = Array.from(value);
    expect(chars.length).toBe(2);
  });
});
