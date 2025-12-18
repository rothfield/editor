/**
 * E2E Test: Barline combining (|: should become repeat barline)
 */

import { test, expect } from '@playwright/test';

test.describe('Barline combining', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('typing |: should create RepeatLeftBarline', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type | then :
    await page.keyboard.type('|');
    await page.waitForTimeout(100);

    await page.keyboard.type(':');
    await page.waitForTimeout(100);

    // Check cells after typing :
    const cellsAfterColon = await page.evaluate(() => {
      const snapshot = window.editor.wasmModule.getDocumentSnapshot();
      return snapshot.lines[0].cells.map(c => ({
        char: c.char,
        kind: c.kind
      }));
    });

    // Should be ONE cell with RepeatLeftBarline kind (7)
    expect(cellsAfterColon.length).toBe(1);
    expect(cellsAfterColon[0].kind.value).toBe(7); // ElementKind::RepeatLeftBarline = 7
  });

  test('typing :| should create RepeatRightBarline', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type : then |
    await page.keyboard.type(':');
    await page.waitForTimeout(100);
    await page.keyboard.type('|');
    await page.waitForTimeout(100);

    // Check cells
    const cells = await page.evaluate(() => {
      const snapshot = window.editor.wasmModule.getDocumentSnapshot();
      return snapshot.lines[0].cells.map(c => ({
        char: c.char,
        kind: c.kind
      }));
    });

    // Should be ONE cell with RepeatRightBarline kind (8)
    expect(cells.length).toBe(1);
    expect(cells[0].kind.value).toBe(8); // ElementKind::RepeatRightBarline = 8
  });
});
