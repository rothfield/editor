import { test, expect } from '@playwright/test';

test.describe('Textarea Return key splits line', () => {
  test('Return in middle of line should split into two lines', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "1234"
    await page.keyboard.type('1234');

    // Move cursor to middle (after "12")
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    // Press Return to split
    await page.keyboard.press('Enter');

    // Should now have two textareas
    const textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(2);

    // First line should have "12"
    const line1 = textareas.nth(0);
    const line1Value = await line1.evaluate(el => el.value);
    console.log('Line 1 value:', JSON.stringify(line1Value));

    // Second line should have "34" and be focused
    const line2 = textareas.nth(1);
    const line2Value = await line2.evaluate(el => el.value);
    console.log('Line 2 value:', JSON.stringify(line2Value));

    // Check content (using character count since PUA glyphs)
    const line1Chars = Array.from(line1Value);
    const line2Chars = Array.from(line2Value);
    expect(line1Chars.length).toBe(2); // "12"
    expect(line2Chars.length).toBe(2); // "34"

    // Cursor should be at start of second line
    const line2Focused = await line2.evaluate(el => document.activeElement === el);
    expect(line2Focused).toBe(true);

    const cursorPos = await line2.evaluate(el => el.selectionStart);
    expect(cursorPos).toBe(0);
  });

  test('Return at end of line should create empty new line', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12"
    await page.keyboard.type('12');

    // Press Return at end
    await page.keyboard.press('Enter');

    // Should now have two textareas
    const textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(2);

    // First line should have "12"
    const line1 = textareas.nth(0);
    const line1Value = await line1.evaluate(el => el.value);
    const line1Chars = Array.from(line1Value);
    expect(line1Chars.length).toBe(2);

    // Second line should be empty and focused
    const line2 = textareas.nth(1);
    const line2Value = await line2.evaluate(el => el.value);
    expect(line2Value).toBe('');

    const line2Focused = await line2.evaluate(el => document.activeElement === el);
    expect(line2Focused).toBe(true);
  });

  test('Return at start of line should create empty line before', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "12"
    await page.keyboard.type('12');

    // Move to start
    await page.keyboard.press('Home');

    // Press Return
    await page.keyboard.press('Enter');

    // Should now have two textareas
    const textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(2);

    // First line should be empty
    const line1 = textareas.nth(0);
    const line1Value = await line1.evaluate(el => el.value);
    expect(line1Value).toBe('');

    // Second line should have "12" and be focused at start
    const line2 = textareas.nth(1);
    const line2Value = await line2.evaluate(el => el.value);
    const line2Chars = Array.from(line2Value);
    expect(line2Chars.length).toBe(2);

    const line2Focused = await line2.evaluate(el => document.activeElement === el);
    expect(line2Focused).toBe(true);

    const cursorPos = await line2.evaluate(el => el.selectionStart);
    expect(cursorPos).toBe(0);
  });
});
