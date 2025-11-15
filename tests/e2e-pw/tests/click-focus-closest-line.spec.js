import { test, expect } from '@playwright/test';

/**
 * Helper: Get the current focused line from cursor position display
 */
async function getCurrentFocusedLine(page) {
  const cursorText = await page.locator('#editor-cursor-position').innerText();
  const match = cursorText.match(/Line:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Helper: Click at a specific Y-offset within the editor
 * Coordinates should be in viewport space (absolute)
 */
async function clickInEditor(page, xPercent, yAbsolute) {
  const editor = page.getByTestId('editor-root');
  const editorBbox = await editor.boundingBox();

  // Convert absolute viewport Y to editor-relative position
  const relativeY = yAbsolute - editorBbox.y;
  const clickX = editorBbox.width * xPercent;

  await editor.click({
    position: {
      x: clickX,
      y: relativeY
    }
  });

  // Wait for the line focus to update
  await expect.poll(async () => {
    return await getCurrentFocusedLine(page);
  }, { timeout: 5000 }).not.toEqual(null);
}

test.describe('Click-to-focus closest line feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type some music to create multiple lines
    await editor.click();
    await page.keyboard.type('c d e |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('f g a');

    // Wait for lines to render
    await expect(page.locator('.notation-line')).toHaveCount(2);
  });

  test('should focus line 0 when clicking on it directly', async ({ page }) => {
    const line0 = page.locator('.notation-line').first();
    const bbox0 = await line0.boundingBox();

    // Click in the middle of line 0
    const clickY = bbox0.y + bbox0.height / 2;
    await clickInEditor(page, 0.5, clickY);

    // Verify cursor is on line 0
    const focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);
  });

  test('should focus line 1 when clicking on it directly', async ({ page }) => {
    const line1 = page.locator('.notation-line').nth(1);
    const bbox1 = await line1.boundingBox();

    // Click in the middle of line 1
    const clickY = bbox1.y + bbox1.height / 2;
    await clickInEditor(page, 0.5, clickY);

    // Verify cursor is on line 1
    const focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(1);
  });

  test('should focus closest line when clicking between lines (closer to line 0)', async ({ page }) => {
    const line0 = page.locator('.notation-line').first();
    const line1 = page.locator('.notation-line').nth(1);

    const bbox0 = await line0.boundingBox();
    const bbox1 = await line1.boundingBox();

    // Calculate position between lines, closer to line 0 (30% of gap)
    const gapStart = bbox0.y + bbox0.height;
    const gapEnd = bbox1.y;
    const clickY = gapStart + (gapEnd - gapStart) * 0.3;

    await clickInEditor(page, 0.5, clickY);

    // Should focus line 0 (closer)
    const focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);
  });


  test('should maintain line focus after typing', async ({ page }) => {
    const line0 = page.locator('.notation-line').first();
    const bbox0 = await line0.boundingBox();

    // Click on line 0
    const clickY = bbox0.y + bbox0.height / 2;
    await clickInEditor(page, 0.5, clickY);

    let focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);

    // Type some notes
    await page.keyboard.type('b c');

    // Wait a moment for typing to complete
    await page.waitForTimeout(200);

    // Verify still on line 0
    focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);
  });

  test('should switch line focus when clicking different line', async ({ page }) => {
    const line0 = page.locator('.notation-line').first();
    const line1 = page.locator('.notation-line').nth(1);

    const bbox0 = await line0.boundingBox();
    const bbox1 = await line1.boundingBox();

    // Click on line 0
    const clickY0 = bbox0.y + bbox0.height / 2;
    await clickInEditor(page, 0.5, clickY0);

    let focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);

    // Click on line 1
    const clickY1 = bbox1.y + bbox1.height / 2;
    await clickInEditor(page, 0.5, clickY1);

    focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(1);
  });

  test('should focus first line when clicking on editor-container', async ({ page }) => {
    const editorContainer = page.locator('#editor-container');

    // Click on the editor container itself (not on a specific line)
    await editorContainer.click({ position: { x: 50, y: 50 } });

    // Wait for focus to update
    await expect.poll(async () => {
      return await getCurrentFocusedLine(page);
    }, { timeout: 5000 }).not.toEqual(null);

    // Should focus first line by default
    const focusedLine = await getCurrentFocusedLine(page);
    expect(focusedLine).toBe(0);
  });
});
