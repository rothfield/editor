import { test, expect } from '@playwright/test';

test.describe('Textarea backspace cursor position', () => {
  test('cursor should be after "3" when typing 12, backspace twice, then 3', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12"
    await page.keyboard.type('12');

    // Backspace twice
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');

    // Type "3"
    await page.keyboard.type('3');

    // Get cursor position and value
    const state = await textarea.evaluate(el => ({
      value: el.value,
      cursorPos: el.selectionStart
    }));

    console.log('Value:', JSON.stringify(state.value));
    console.log('Cursor position:', state.cursorPos);

    // Cursor should be at position 1 (after the "3")
    expect(state.value).toBe('3');
    expect(state.cursorPos).toBe(1);
  });
});
