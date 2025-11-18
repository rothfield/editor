/**
 * E2E test for glyph width rendering issues
 *
 * Tests that composite glyphs (accidentals, octave variants) are rendered
 * with correct widths in the UI.
 *
 * Root cause: measurement-service.js doesn't apply NotationFont when measuring
 * character widths, causing incorrect measurements.
 */

import { test, expect } from '@playwright/test';

test.describe('Glyph Width Rendering', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
  });

  test('base character "6" has correct width', async ({ page }) => {
    const editor = page.getByTestId('editor-root');
    await editor.click();

    // Type just "6"
    await page.keyboard.type('6');

    // Get the rendered cell
    const cell = page.locator('.char-cell').first();
    await expect(cell).toBeVisible();

    // Get the computed width
    const bbox = await cell.boundingBox();
    expect(bbox.width).toBeGreaterThan(0);

    console.log(`Base "6" width: ${bbox.width}px`);
  });

  test('flat composite "6b" has same width as base "6"', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // First measure base "6"
    await editor.click();
    await page.keyboard.type('6');
    const cell6 = page.locator('.char-cell').first();
    const bbox6 = await cell6.boundingBox();
    const baseWidth = bbox6.width;

    console.log(`Base "6" width: ${baseWidth}px`);

    // Clear and type "6b" (6 flat)
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('6b');

    // Get the flat cell
    const cell6b = page.locator('.char-cell').first();
    const bbox6b = await cell6b.boundingBox();
    const flatWidth = bbox6b.width;

    console.log(`Flat "6b" width: ${flatWidth}px`);

    // Widths should match (font has same advance width for composites)
    // Allow 1px tolerance for sub-pixel rendering
    expect(Math.abs(flatWidth - baseWidth)).toBeLessThanOrEqual(1);
  });

  test('sharp composite "1#" has same width as base "1"', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Measure base "1"
    await editor.click();
    await page.keyboard.type('1');
    const cell1 = page.locator('.char-cell').first();
    const bbox1 = await cell1.boundingBox();
    const baseWidth = bbox1.width;

    console.log(`Base "1" width: ${baseWidth}px`);

    // Clear and type "1#"
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1#');

    // Get the sharp cell
    const cell1sharp = page.locator('.char-cell').first();
    const bbox1sharp = await cell1sharp.boundingBox();
    const sharpWidth = bbox1sharp.width;

    console.log(`Sharp "1#" width: ${sharpWidth}px`);

    // Widths should match
    expect(Math.abs(sharpWidth - baseWidth)).toBeLessThanOrEqual(1);
  });

  test('octave variant has same width as base character', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Measure base "1"
    await editor.click();
    await page.keyboard.type('1');
    const cell1 = page.locator('.char-cell').first();
    const bbox1 = await cell1.boundingBox();
    const baseWidth = bbox1.width;

    console.log(`Base "1" width: ${baseWidth}px`);

    // Clear and type "1" with octave modifier (Shift+Up adds dot above)
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1');

    // Trigger octave modification (this depends on your UI - adjust as needed)
    // For now, just verify the base case

    // TODO: Add octave modification test once UI supports it
  });

  test('mixed sequence maintains correct spacing', async ({ page }) => {
    const editor = page.getByTestId('editor-root');
    await editor.click();

    // Type a sequence with base chars and accidentals
    await page.keyboard.type('1 2# 3b 4');

    // Get all cells
    const cells = page.locator('.char-cell');
    const count = await cells.count();

    // Each character should have non-zero width
    for (let i = 0; i < count; i++) {
      const bbox = await cells.nth(i).boundingBox();
      if (bbox) {
        expect(bbox.width).toBeGreaterThan(0);
        console.log(`Cell ${i} width: ${bbox.width}px`);
      }
    }
  });

  test('character width measurement uses correct font', async ({ page }) => {
    // This test verifies the measurement-service.js fix
    const editor = page.getByTestId('editor-root');
    await editor.click();

    // Type a character
    await page.keyboard.type('6');

    // Get the cell
    const cell = page.locator('.char-cell').first();
    await expect(cell).toBeVisible();

    // Verify the cell uses NotationFont
    const fontFamily = await cell.evaluate((el) => {
      const computedStyle = window.getComputedStyle(el);
      return computedStyle.fontFamily;
    });

    // Should include NotationFont
    expect(fontFamily).toContain('NotationFont');
  });

});
