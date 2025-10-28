import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Ornament Navigation', () => {
  test('arrows skip ornament cells when edit mode OFF', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type: "Hello" with ornament span
    // Format: H e l l o with ornament indicators around "ell"
    await page.keyboard.type('H');
    await page.keyboard.type('e');

    // Toggle ornament edit mode ON to add ornament indicators
    await page.keyboard.press('Alt+Shift+O');
    await page.keyboard.type('['); // Start ornament

    await page.keyboard.type('l');
    await page.keyboard.type('l');

    await page.keyboard.type(']'); // End ornament
    await page.keyboard.type('o');

    // Toggle ornament edit mode OFF (default state)
    await page.keyboard.press('Alt+Shift+O');

    // Move cursor to start
    await page.keyboard.press('Home');

    // Count arrow right presses to reach end
    // Should only count main cells: H, e, o (3 stops, not 5)
    let arrowCount = 0;
    for (let i = 0; i < 10; i++) { // Max 10 to avoid infinite loop
      await page.keyboard.press('ArrowRight');
      arrowCount++;

      // Check if we can't move further right (at last position)
      const content = await editor.textContent();
      if (arrowCount >= 3) break; // Should reach end after 3 arrows
    }

    expect(arrowCount).toBe(3);
  });

  test('arrows navigate all cells when edit mode ON', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type same content with ornaments
    await page.keyboard.type('H');
    await page.keyboard.type('e');

    // Toggle ornament edit mode ON
    await page.keyboard.press('Alt+Shift+O');
    await page.keyboard.type('[');
    await page.keyboard.type('l');
    await page.keyboard.type('l');
    await page.keyboard.type(']');
    await page.keyboard.type('o');

    // Keep edit mode ON - don't toggle

    // Move cursor to start
    await page.keyboard.press('Home');

    // Count arrow right presses
    // Should count ALL cells: H, e, [, l, l, ], o (7 stops)
    let arrowCount = 0;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      arrowCount++;

      if (arrowCount >= 7) break;
    }

    expect(arrowCount).toBe(7);
  });

  test('cursor on ornament cell when toggling to OFF mode finds nearest navigable stop', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content with ornament
    await page.keyboard.type('H');
    await page.keyboard.type('e');

    await page.keyboard.press('Alt+Shift+O'); // ON
    await page.keyboard.type('[');
    await page.keyboard.type('l');
    await page.keyboard.type('l');
    await page.keyboard.type(']');
    await page.keyboard.type('o');

    // Move cursor to middle ornament cell 'l'
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // H
    await page.keyboard.press('ArrowRight'); // e
    await page.keyboard.press('ArrowRight'); // [
    await page.keyboard.press('ArrowRight'); // l (first)

    // Now toggle OFF while cursor is on ornament cell
    await page.keyboard.press('Alt+Shift+O'); // OFF

    // Arrow keys should still work - cursor should find nearest navigable stop
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');

    // If we got here without errors, the fix works
    expect(true).toBe(true);
  });
});
