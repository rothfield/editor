/**
 * E2E Test: Notation Line Height Should Not Reserve Space for Decorations
 *
 * PROBLEM: Layout calculations currently reserve space for decorative elements
 * like slurs, beat group arcs, etc. This causes lines to have variable heights
 * when they shouldn't.
 *
 * CORRECT BEHAVIOR:
 * - Slurs and beat arcs should be CSS overlays that don't affect line height
 * - Only actual content (notes, lyrics) should affect line height
 * - Lines without lyrics should all have the same base height
 * - Decorative elements can overflow the line container
 */

import { test, expect } from '@playwright/test';

test.describe('Notation Line Height - No Space Reservation for Decorations', () => {
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

  test('Lines without lyrics should have identical base height (decorations should not reserve space)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Simple notes (no decorations)
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');

    // Line 2: Notes with a slur
    await page.keyboard.type('P d n');
    // Select the notes for slur
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S'); // Apply slur
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 3: Notes with lyrics (if lyrics create height differences)
    await page.keyboard.type('S- r- g- m-');
    await page.keyboard.press('Enter');

    // Line 4: Another simple line (no decorations)
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(300);

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Get all notation line elements
    const notationLines = await page.locator('.notation-line').all();
    expect(notationLines.length).toBeGreaterThanOrEqual(4);

    // Measure heights of all lines
    const heights = [];
    for (let i = 0; i < notationLines.length; i++) {
      const line = notationLines[i];
      const box = await line.boundingBox();
      if (box) {
        heights.push(box.height);
        console.log(`Line ${i}: height = ${box.height}px`);
      }
    }

    // All heights should be identical
    const firstHeight = heights[0];
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBe(firstHeight);
    }

    console.log('✅ All notation lines have consistent height:', firstHeight);
  });

  test('Lines with beat group arcs should have same height as lines without', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Simple notes
    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');

    // Line 2: Notes with beat grouping that might show arcs
    await page.keyboard.type('1 2 3 | 4 5 6');
    await page.keyboard.press('Enter');

    // Line 3: Another simple line
    await page.keyboard.type('m P d');
    await page.waitForTimeout(300);

    // Wait for rendering
    await page.waitForTimeout(500);

    // Get all notation line elements
    const notationLines = await page.locator('.notation-line').all();

    // Measure heights
    const heights = [];
    for (let i = 0; i < notationLines.length; i++) {
      const line = notationLines[i];
      const box = await line.boundingBox();
      if (box) {
        heights.push(box.height);
        console.log(`Line ${i}: height = ${box.height}px`);
      }
    }

    // All heights should be identical
    const firstHeight = heights[0];
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBe(firstHeight);
    }

    console.log('✅ All notation lines have consistent height:', firstHeight);
  });

  test('Check rendered height matches CSS height attribute', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create a few lines with different content
    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1 2 3');
    await page.keyboard.press('Enter');

    // Add slur to second line
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Get all notation line elements
    const notationLines = await page.locator('.notation-line').all();

    for (let i = 0; i < notationLines.length; i++) {
      const line = notationLines[i];

      // Get CSS height from style attribute
      const styleAttr = await line.getAttribute('style');
      const heightMatch = styleAttr?.match(/height:\s*(\d+(?:\.\d+)?)px/);
      const cssHeight = heightMatch ? parseFloat(heightMatch[1]) : null;

      // Get actual rendered bounding box height
      const box = await line.boundingBox();
      const renderedHeight = box?.height || null;

      console.log(`Line ${i}: CSS height = ${cssHeight}px, Rendered height = ${renderedHeight}px`);

      if (cssHeight && renderedHeight) {
        // Heights should match (allowing small rounding difference)
        expect(Math.abs(cssHeight - renderedHeight)).toBeLessThan(2);
      }
    }

    // All CSS heights should be identical (from WASM)
    const cssHeights = [];
    for (let i = 0; i < notationLines.length; i++) {
      const line = notationLines[i];
      const styleAttr = await line.getAttribute('style');
      const heightMatch = styleAttr?.match(/height:\s*(\d+(?:\.\d+)?)px/);
      if (heightMatch) {
        cssHeights.push(parseFloat(heightMatch[1]));
      }
    }

    const firstCssHeight = cssHeights[0];
    for (let i = 1; i < cssHeights.length; i++) {
      expect(cssHeights[i]).toBe(firstCssHeight);
    }

    console.log('✅ All CSS heights are consistent:', firstCssHeight);
  });
});
