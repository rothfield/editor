import { test, expect } from '@playwright/test';

test.describe('Click right half of character', () => {
  test('clicking right half of M should place cursor after M, not before', async ({ page }) => {
    // Capture console logs
    page.on('console', msg => {
      if (msg.text().includes('MouseHandler') || msg.text().includes('[WASM]') ||
          msg.text().includes('updateCursorFromWASM') || msg.text().includes('click handler') ||
          msg.text().includes('setCursorPosition')) {
        console.log('BROWSER:', msg.text());
      }
    });

    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type MM
    await editor.click();
    await page.keyboard.type('MM');

    // Wait for render
    await page.waitForTimeout(100);

    // Get the first M cell
    const firstM = page.locator('.char-cell').first();
    await expect(firstM).toBeVisible();

    // Get the bounding box of the first M
    const box = await firstM.boundingBox();
    if (!box) throw new Error('Could not get bounding box');

    // Click on the RIGHT half of the first M (75% across)
    const clickX = box.x + box.width * 0.75;
    const clickY = box.y + box.height / 2;

    console.log('Clicking at:', { x: clickX, y: clickY, boxWidth: box.width });

    await page.mouse.click(clickX, clickY);

    // Check cursor position IMMEDIATELY after click
    const immediateInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.theDocument;
      return {
        cursorLine: doc?.state?.cursor?.line,
        cursorCol: doc?.state?.cursor?.col
      };
    });
    console.log('Cursor info IMMEDIATELY after click:', immediateInfo);

    // Wait for cursor to update
    await page.waitForTimeout(100);

    // Check cursor position from document state
    const cursorInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.theDocument;
      return {
        cursorLine: doc?.state?.cursor?.line,
        cursorCol: doc?.state?.cursor?.col,
        cellsLength: doc?.lines?.[0]?.cells?.length,
        cells: doc?.lines?.[0]?.cells?.map(c => c.char).join('')
      };
    });

    console.log('Cursor info:', cursorInfo);

    // Cursor should be at position 1 (between the two M's), not position 0 (before first M)
    expect(cursorInfo.cursorCol).toBe(1);
    expect(cursorInfo.cursorCol).not.toBe(0);
  });

  test('clicking left half of second M should place cursor before second M', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type MM
    await editor.click();
    await page.keyboard.type('MM');

    // Wait for render
    await page.waitForTimeout(100);

    // Get the second M cell
    const secondM = page.locator('.char-cell').nth(1);
    await expect(secondM).toBeVisible();

    // Get the bounding box of the second M
    const box = await secondM.boundingBox();
    if (!box) throw new Error('Could not get bounding box');

    // Click on the LEFT half of the second M (25% across)
    const clickX = box.x + box.width * 0.25;
    const clickY = box.y + box.height / 2;

    console.log('Clicking at:', { x: clickX, y: clickY, boxWidth: box.width });

    await page.mouse.click(clickX, clickY);

    // Check cursor position IMMEDIATELY after click
    const immediateInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.theDocument;
      return {
        cursorLine: doc?.state?.cursor?.line,
        cursorCol: doc?.state?.cursor?.col
      };
    });
    console.log('Cursor info IMMEDIATELY after click:', immediateInfo);

    // Wait for cursor to update
    await page.waitForTimeout(100);

    // Check cursor position from document state
    const cursorInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.theDocument;
      return {
        cursorLine: doc?.state?.cursor?.line,
        cursorCol: doc?.state?.cursor?.col,
        cellsLength: doc?.lines?.[0]?.cells?.length,
        cells: doc?.lines?.[0]?.cells?.map(c => c.char).join('')
      };
    });

    console.log('Cursor info:', cursorInfo);

    // Cursor should be at position 1 (before second M, after first M)
    expect(cursorInfo.cursorCol).toBe(1);
  });
});
