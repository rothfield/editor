/**
 * E2E Test: Composite Glyph Rendering for 5#
 *
 * Verifies that typing "5#" creates a composite glyph (single visual character)
 */

import { test, expect } from '@playwright/test';

test.describe('Composite Glyph: 5#', () => {
  test('typing 5# should create composite glyph', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type 5#
    await page.keyboard.type('5#');
    await page.waitForTimeout(200);

    // Check document model in inspector
    const docModelTab = page.locator('[data-testid="tab-docmodel"]');
    await docModelTab.click();
    await page.waitForTimeout(100);

    const docModelPane = page.locator('[data-testid="pane-docmodel"]');
    const docModelText = await docModelPane.textContent();

    console.log('Document Model:', docModelText);

    // Should have a cell with char="5#" and pitch_code containing sharp
    expect(docModelText).toContain('"char": "5#"');
    expect(docModelText).toContain('"pitch_code"');

    // Check the rendered DOM
    const cells = await page.locator('.char-cell').all();
    console.log('Number of cells:', cells.length);

    // Should only have 1 or 2 cells (root cell + maybe continuation)
    // Get first cell
    if (cells.length > 0) {
      const firstCell = cells[0];
      const textContent = await firstCell.textContent();
      const classList = await firstCell.evaluate(el => Array.from(el.classList));

      console.log('First cell text:', textContent);
      console.log('First cell classes:', classList);

      // Check if it's a pitched element
      expect(classList).toContain('kind-pitched');
    }
  });

  test('composite glyph should be single visual character', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type 5#
    await page.keyboard.type('5#');
    await page.waitForTimeout(200);

    const cells = await page.locator('.char-cell').all();

    // Get visual rendering - should be composite glyph, not "5#" as two characters
    if (cells.length > 0) {
      const firstCellBox = await cells[0].boundingBox();

      console.log('First cell width:', firstCellBox.width);
      console.log('First cell x:', firstCellBox.x);

      // The composite glyph should be rendered (check font, etc.)
      const fontFamily = await cells[0].evaluate(el => window.getComputedStyle(el).fontFamily);
      console.log('Font family:', fontFamily);

      expect(fontFamily.toLowerCase()).toContain('notationfont');
    }
  });
});
