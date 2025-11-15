/**
 * E2E Test: Space Character Cursor Advancement
 *
 * Verifies that typing spaces advances the blinking cursor visually.
 * Space characters should take up horizontal width in the rendered output.
 */

import { test, expect } from '@playwright/test';

test.describe('Space Character Cursor Advancement', () => {
  test('typing spaces should advance cursor horizontally', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();

    // Click into editor to focus
    await editor.click();

    // Type a sequence with spaces
    await page.keyboard.type('1 2 3');

    // Wait for rendering to complete
    await page.waitForTimeout(100);

    // Get all cell elements
    const cells = await page.locator('.char-cell').all();

    // Should have 5 cells: '1', ' ', '2', ' ', '3'
    expect(cells.length).toBeGreaterThanOrEqual(5);

    // Get positions of cells
    const cell1Box = await cells[0].boundingBox();
    const spaceBox = await cells[1].boundingBox();
    const cell2Box = await cells[2].boundingBox();

    // Verify space cell exists and has width
    expect(spaceBox).not.toBeNull();
    expect(spaceBox.width).toBeGreaterThan(0);

    // Verify cells are positioned left-to-right
    expect(spaceBox.x).toBeGreaterThan(cell1Box.x);
    expect(cell2Box.x).toBeGreaterThan(spaceBox.x);

    // Verify the space cell contains regular space (preserved by CSS white-space: pre)
    const spaceContent = await cells[1].textContent();
    expect(spaceContent).toBe(' '); // Should be regular space, preserved by CSS
  });

  test('cursor should be visible after space in different positions', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type text with spaces
    await page.keyboard.type('1 ');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get cursor element
    const cursor = page.locator('.caret-cursor, .cursor, [data-testid="cursor"]');

    // Cursor should be visible
    await expect(cursor).toBeVisible({ timeout: 1000 });

    // Get cursor position
    const cursorBox = await cursor.boundingBox();

    // Get the space cell position
    const cells = await page.locator('.char-cell').all();
    const spaceCell = cells[1];
    const spaceBox = await spaceCell.boundingBox();

    // Cursor X should be to the right of the space cell
    // (cursor appears AFTER the space)
    expect(cursorBox.x).toBeGreaterThanOrEqual(spaceBox.x + spaceBox.width);
  });

  test('multiple consecutive spaces should each take up width', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type multiple spaces
    await page.keyboard.type('1   3'); // '1' + 3 spaces + '3'

    await page.waitForTimeout(100);

    const cells = await page.locator('.char-cell').all();

    // Should have 5 cells: '1', ' ', ' ', ' ', '3'
    expect(cells.length).toBeGreaterThanOrEqual(5);

    // Get positions
    const boxes = await Promise.all(cells.slice(0, 5).map(c => c.boundingBox()));

    // Each space should have width
    expect(boxes[1].width).toBeGreaterThan(0);
    expect(boxes[2].width).toBeGreaterThan(0);
    expect(boxes[3].width).toBeGreaterThan(0);

    // Verify progressive X positions (left to right)
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
    expect(boxes[3].x).toBeGreaterThan(boxes[2].x);
    expect(boxes[4].x).toBeGreaterThan(boxes[3].x);
  });

  test('space should use NotationFont like other glyphs', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type spaces
    await page.keyboard.type(' ');
    await page.waitForTimeout(100);

    const spaceCell = page.locator('.char-cell').first();

    // Verify it uses NotationFont (same as other characters)
    const fontFamily = await spaceCell.evaluate(el => window.getComputedStyle(el).fontFamily);

    // Should use NotationFont
    expect(fontFamily.toLowerCase()).toContain('notationfont');
  });
});
