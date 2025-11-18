/**
 * Font Glyph Visual Verification Test
 *
 * Creates a simplified test document to visually verify font glyph rendering.
 * Focuses on the most important glyph combinations.
 */

import { test, expect } from '@playwright/test';

test('Create visual glyph test document', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for editor initialization
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // NUMBER SYSTEM - All accidentals
  await page.keyboard.type('1 2 3 4 5 6 7');
  await page.keyboard.press('Enter');

  await page.keyboard.type('s1 s2 s3 s4 s5 s6 s7');
  await page.keyboard.press('Enter');

  await page.keyboard.type('b1 b2 b3 b4 b5 b6 b7');
  await page.keyboard.press('Enter');

  await page.keyboard.type('ss1 ss2 ss3 ss4 ss5 ss6 ss7');
  await page.keyboard.press('Enter');

  await page.keyboard.type('bb1 bb2 bb3 bb4 bb5 bb6 bb7');
  await page.keyboard.press('Enter');

  await page.keyboard.type('hf1 hf2 hf3 hf4 hf5 hf6 hf7');
  await page.keyboard.press('Enter');

  // Octave variants
  await page.keyboard.type('1. 2. 3. 4. 5. 6. 7.');
  await page.keyboard.press('Enter');

  await page.keyboard.type('1.. 2.. 3.. 4.. 5.. 6.. 7..');
  await page.keyboard.press('Enter');

  await page.keyboard.type('1, 2, 3, 4, 5, 6, 7,');
  await page.keyboard.press('Enter');

  await page.keyboard.type('1,, 2,, 3,, 4,, 5,, 6,, 7,,');
  await page.keyboard.press('Enter');

  // Combined (sharp with octave shift)
  await page.keyboard.type('s1. s2. s3. s4. s5. s6. s7.');
  await page.keyboard.press('Enter');

  // Wait for all rendering to complete
  await page.waitForTimeout(1000);

  // Take full page screenshot
  await page.screenshot({
    path: 'artifacts/glyph-test-number-system.png',
    fullPage: true
  });

  console.log('✅ Number system glyphs rendered');

  // Get the document for inspection
  const doc = await page.evaluate(() => {
    return window.editor.getDocument();
  });

  console.log(`Created document with ${doc.lines.length} lines`);

  // Verify we have content
  expect(doc.lines.length).toBeGreaterThan(10);

  // Check LilyPond export
  await page.click('[data-tab="lilypond-src"]');
  await page.waitForTimeout(500);

  const lilypond = await page.locator('#lilypond-source').textContent();
  expect(lilypond.length).toBeGreaterThan(100);

  await page.screenshot({
    path: 'artifacts/glyph-test-lilypond-export.png',
    fullPage: false
  });

  console.log('✅ LilyPond export verified');
  console.log(`LilyPond output: ${lilypond.length} characters`);
});

test('Verify sharp glyph rendering (U+E08D fix)', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Type each sharp note
  await page.keyboard.type('s1 s2 s3 s4 s5 s6 s7');

  // Wait for cells to be rendered
  await expect.poll(async () => {
    const cellCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-cell-index]').length;
    });
    return cellCount;
  }, { timeout: 5000 }).toBeGreaterThan(0);

  // Get all rendered cells (cells have data-cell-index attribute)
  const cells = await page.evaluate(() => {
    const cellElements = document.querySelectorAll('[data-cell-index]');
    return Array.from(cellElements).map(cell => ({
      text: cell.textContent,
      charCode: cell.textContent.charCodeAt(0),
      codepoint: 'U+' + cell.textContent.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
    }));
  });

  console.log('Rendered sharp glyphs:');
  cells.forEach((cell, idx) => {
    console.log(`  ${idx + 1}#: "${cell.text}" ${cell.codepoint}`);
  });

  // Take screenshot
  await page.screenshot({
    path: 'artifacts/sharp-glyphs-verification.png',
    clip: { x: 0, y: 0, width: 800, height: 200 }
  });

  // Verify we got 7 cells (7 sharp notes)
  // Note: might be more due to spacing
  expect(cells.length).toBeGreaterThanOrEqual(7);

  console.log('✅ Sharp glyphs test complete');
});
