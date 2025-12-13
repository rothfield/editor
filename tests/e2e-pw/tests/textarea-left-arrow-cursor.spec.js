import { test, expect } from '@playwright/test';

test.describe('Textarea left arrow cursor position', () => {
  test('cursor should be after "3" when typing 12, left arrow twice, then 3', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12"
    await page.keyboard.type('12');

    // Left arrow twice
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    // Type "3"
    await page.keyboard.type('3');

    // Get cursor position and value
    const state = await textarea.evaluate(el => ({
      value: el.value,
      cursorPos: el.selectionStart
    }));

    console.log('Value:', JSON.stringify(state.value));
    console.log('Cursor position:', state.cursorPos);
    console.log('Value length:', state.value.length);

    // Text should be "312" (3 glyphs, each is a surrogate pair = 6 code units)
    expect(state.value.length).toBe(6);

    // Cursor should be at position 2 (after the "3" glyph, which is one surrogate pair)
    // NOT at position 6 (end of line)
    expect(state.cursorPos).toBe(2);
  });
});
