/**
 * E2E Test: Verify cursor positions correctly with gutter layout
 */

import { test, expect } from '@playwright/test';

test.describe('Gutter Layout - Cursor Positioning', () => {
  test('cursor should align with first cell position', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type a character
    await editor.click();
    await page.keyboard.type('1');

    // Wait for cell and cursor to render
    await expect(page.locator('.cell-container').first()).toBeVisible();
    await expect(page.locator('.cursor-indicator')).toBeVisible();

    // Get first cell position
    const firstCell = page.locator('.cell-container').first();
    const cellBox = await firstCell.boundingBox();

    // Get cursor position
    const cursor = page.locator('.cursor-indicator');
    const cursorBox = await cursor.boundingBox();

    expect(cellBox).not.toBeNull();
    expect(cursorBox).not.toBeNull();

    console.log('First cell X:', cellBox.x);
    console.log('Cursor X:', cursorBox.x);

    // Cursor should be positioned after the first cell (cursor appears at end of typed text)
    // Cell width is 16px, so cursor X should be approximately cellBox.x + 16
    const expectedCursorX = cellBox.x + 16;
    const tolerance = 5; // Allow 5px tolerance

    expect(Math.abs(cursorBox.x - expectedCursorX)).toBeLessThan(tolerance);
  });

  test('cursor should move correctly with arrow keys', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type multiple characters
    await editor.click();
    await page.keyboard.type('123');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get initial cursor position (should be after "3")
    const cursor = page.locator('.cursor-indicator');
    const initialBox = await cursor.boundingBox();
    console.log('Initial cursor X (after 3):', initialBox.x);

    // Press left arrow (move before "3")
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);

    const afterLeftBox = await cursor.boundingBox();
    console.log('Cursor X after left arrow (after 2):', afterLeftBox.x);

    // Cursor should have moved left
    expect(afterLeftBox.x).toBeLessThan(initialBox.x);

    // Press right arrow (move after "3" again)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    const afterRightBox = await cursor.boundingBox();
    console.log('Cursor X after right arrow (after 3 again):', afterRightBox.x);

    // Cursor should be back near initial position
    expect(Math.abs(afterRightBox.x - initialBox.x)).toBeLessThan(2);
  });

  test('cursor should position correctly on different lines', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type on first line
    await editor.click();
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');

    // Type on second line
    await page.keyboard.type('2');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Get second line cells
    const secondLineCells = page.locator('.notation-line').nth(1).locator('.cell-container');
    await expect(secondLineCells.first()).toBeVisible();

    const secondLineFirstCell = secondLineCells.first();
    const cellBox = await secondLineFirstCell.boundingBox();

    // Get cursor (should be on second line)
    const cursor = page.locator('.cursor-indicator');
    const cursorBox = await cursor.boundingBox();

    expect(cellBox).not.toBeNull();
    expect(cursorBox).not.toBeNull();

    console.log('Second line first cell X:', cellBox.x);
    console.log('Cursor X (on second line):', cursorBox.x);

    // Both should have the same gutter offset (aligned vertically)
    const tolerance = 2;
    expect(Math.abs(cellBox.x - cursorBox.x)).toBeLessThan(cellBox.width + tolerance);
  });
});
