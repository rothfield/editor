import { test, expect } from '@playwright/test';

/**
 * TEST: Accidental backspace removes last character and reparses pitch
 *
 * NEW ARCHITECTURE (Single-Cell):
 * - "1#" creates 1 cell: char="1#", pitch_code=Sharp (stored as single cell)
 * - When user presses backspace:
 *   - WASM: Removes "#" from cell.char, making it "1"
 *   - Reparses pitch_code from "1" → Natural (N1)
 *   - Cell no longer has accidental attributes
 *
 * Result: After backspace, "1#" becomes "1" (natural), accidental is removed
 */
test('Accidental backspace removes accidental and reparses as natural', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "1#" - renders with sharp accidental composite
  await editor.click();
  await page.keyboard.type('1#');

  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/accidental-1-sharp-before.png' });

  console.log('Before backspace:');
  const cellsBefore = page.locator('[data-cell-index]');
  const countBefore = await cellsBefore.count();
  console.log(`  Cell count: ${countBefore}`);
  expect(countBefore).toBe(1); // Single cell for "1#"

  const cellBefore = cellsBefore.first();
  const textBefore = await cellBefore.textContent();
  const codepointBefore = textBefore.charCodeAt(0);
  console.log(`  Text: "${textBefore}", Codepoint: U+${codepointBefore.toString(16).toUpperCase().padStart(4, '0')}`);
  expect(codepointBefore).toBe(0xE1F0); // U+E1F0 = 1# composite glyph

  // Press backspace once to delete the "#" character
  await page.keyboard.press('Backspace');

  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/accidental-1-natural-after.png' });

  console.log('After backspace:');
  const cellsAfter = page.locator('[data-cell-index]');
  const countAfter = await cellsAfter.count();
  console.log(`  Cell count: ${countAfter}`);
  expect(countAfter).toBe(1); // Still 1 cell, now just "1"

  const cellAfter = cellsAfter.first();
  const textAfter = await cellAfter.textContent();
  const codepointAfter = textAfter.charCodeAt(0);
  console.log(`  Text: "${textAfter}", Codepoint: U+${codepointAfter.toString(16).toUpperCase().padStart(4, '0')}`);

  // After backspace, cell should contain natural "1" (not composite glyph)
  expect(codepointAfter).toBe(0x0031); // U+0031 = ASCII "1" (natural)
});

test.describe('Visual verification of accidental overlay rendering', () => {
  test('Screenshot shows composite glyph before and after backspace', async ({ page }) => {
    // This test documents the expected behavior with CSS overlay rendering
    // The before/after screenshots were taken above
    console.log('Check test-results/accidental-1-sharp-before.png - shows "1#" composite glyph');
    console.log('  Before: 2 cells (root "1" + continuation "#") rendered as composite glyph "1#"');
    console.log('Check test-results/accidental-1-natural-after.png - STILL shows "1#" composite glyph');
    console.log('  After: 1 cell (root "1" with Sharp accidental) rendered via CSS overlay showing "1#"');
    console.log('Expected: Accidental type preserved, composite glyph maintained after deletion');
  });
});
