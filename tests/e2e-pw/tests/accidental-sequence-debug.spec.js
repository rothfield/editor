import { test, expect } from '@playwright/test';

test.describe('Debug: Sequential typing of sharps', () => {
  test('Type multiple sharps and inspect each', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1# 2# 3#" with spaces to separate them
    await page.keyboard.type('1# 2# 3#');

    // Get all pitch cells
    const pitchCells = page.locator('.char-cell.kind-pitched');
    const count = await pitchCells.count();
    console.log(`Total pitch cells: ${count}`);

    // Inspect each one
    for (let i = 0; i < count; i++) {
      const cell = pitchCells.nth(i);
      const visible = await cell.isVisible();
      const textContent = await cell.textContent();
      const codepoint = textContent.charCodeAt(0);

      const classes = await cell.evaluate(el => el.className);
      const continuation = await cell.evaluate(el => el.getAttribute('data-continuation'));

      console.log(`[${i}] Classes: ${classes}, Continuation: ${continuation}`);
      console.log(`    Text: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  });

  test('Type each sharp separately and clear', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    const pitches = ['1#', '2#', '3#', '4#', '5#'];

    for (const pitch of pitches) {
      // Clear
      await editor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type
      await page.keyboard.type(pitch);

      // Get cell
      const cell = page.locator('.char-cell.kind-pitched').first();
      await expect(cell).toBeVisible();

      const textContent = await cell.textContent();
      const codepoint = textContent.charCodeAt(0);

      const expectedBase = pitch.charCodeAt(0);
      const expectedCodepoint = 0xE1F0 + (expectedBase - '1'.charCodeAt(0));

      console.log(`${pitch}: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (expected U+${expectedCodepoint.toString(16).toUpperCase().padStart(4, '0')})`);

      expect(codepoint).toBe(expectedCodepoint);
    }
  });
});
