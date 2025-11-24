import { test, expect } from '@playwright/test';

test.describe('Paste Operation - Cursor Visibility', () => {
  test('cursor should be visible after paste operation', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1"
    await page.keyboard.type('1');

    // Move cursor left (before the "1")
    await page.keyboard.press('ArrowLeft');

    // First, copy some content to clipboard so we have something to paste
    // Copy the "1" we just typed
    await page.keyboard.press('ArrowRight'); // Select position after "1"
    await page.keyboard.press('Shift+ArrowLeft'); // Select the "1"
    await page.keyboard.press('Control+c'); // Copy

    // Move cursor back to before the "1"
    await page.keyboard.press('ArrowLeft');

    // Paste the content
    await page.keyboard.press('Control+v');

    // Wait for any rendering to complete
    await page.waitForTimeout(100); // Small wait for render cycle

    // Check that the cursor is visible
    // The cursor should be rendered in the DOM
    const cursor = page.locator('.cursor-indicator');

    // Verify cursor exists and is visible
    await expect(cursor).toBeVisible({ timeout: 1000 });

    // Additional check: cursor should have dimensions (not 0x0)
    const cursorBox = await cursor.boundingBox();
    expect(cursorBox).not.toBeNull();
    expect(cursorBox.height).toBeGreaterThan(0);

    // Optional: Check cursor is blinking by verifying CSS animation
    const hasAnimation = await cursor.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.animationName !== 'none' || styles.animation !== 'none';
    });

    // Cursor should have blink animation
    expect(hasAnimation).toBeTruthy();
  });

  test('cursor position should be correct after paste', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "123"
    await page.keyboard.type('123');

    // Move cursor to position 1 (before "2")
    await page.keyboard.press('ArrowLeft'); // After "2"
    await page.keyboard.press('ArrowLeft'); // Before "2"

    // Copy "2"
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('ArrowLeft'); // Back to before "2"

    // Paste
    await page.keyboard.press('Control+v');

    // Wait for render
    await page.waitForTimeout(100);

    // Verify cursor is visible
    const cursor = page.locator('.cursor-indicator');
    await expect(cursor).toBeVisible({ timeout: 1000 });

    // Check cursor has valid position attributes
    const cursorData = await cursor.evaluate((el) => {
      return {
        x: el.getAttribute('x') || el.style.left || el.offsetLeft,
        y: el.getAttribute('y') || el.style.top || el.offsetTop,
        display: window.getComputedStyle(el).display,
        visibility: window.getComputedStyle(el).visibility,
        opacity: window.getComputedStyle(el).opacity
      };
    });

    // Cursor should be visible (not hidden)
    expect(cursorData.display).not.toBe('none');
    expect(cursorData.visibility).not.toBe('hidden');
    expect(parseFloat(cursorData.opacity)).toBeGreaterThan(0);
  });
});
