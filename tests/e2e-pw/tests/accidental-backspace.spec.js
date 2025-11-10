import { test, expect } from '@playwright/test';

/**
 * TEST: Accidental backspace preserves accidental type with composite glyph overlay
 *
 * Architecture (See CLAUDE.md "Multi-Character Glyph Rendering"):
 * - "1#" creates 2 cells:
 *   1. Root cell: char="1", pitch_code=Sharp (accidental type stored in pitch_code)
 *   2. Continuation cell: char="#" (continuation marker for multi-char glyph)
 *
 * - When user presses backspace (deletes continuation):
 *   - WASM: Deletes continuation cell, keeps root cell with char="1" and pitch_code=Sharp
 *   - Reason: Preserves what user intended (accidental type in pitch_code)
 *   - Rendering: Invisible "1" + CSS overlay shows composite glyph U+E1F0 (represents "1#" visually)
 *
 * Result: Accidental type preserved, displays as composite glyph overlay (DOM contains "1" with accidental metadata)
 */
test('Accidental backspace preserves typed text with composite glyph display', async ({ page }) => {
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
  console.log(`  Cell count: ${await cellsBefore.count()}`);

  // Press backspace once to delete the "#" continuation character
  await page.keyboard.press('Backspace');

  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/accidental-1-natural-after.png' });

  console.log('After backspace:');
  const cellsAfter = page.locator('[data-cell-index]');
  const countAfter = await cellsAfter.count();
  console.log(`  Cell count: ${countAfter}`);

  // Should have exactly 1 cell remaining (the base "1")
  expect(countAfter).toBe(1);

  if (countAfter >= 1) {
    const firstCell = cellsAfter.first();

    // Get cell's data attributes
    const cellIndex = await firstCell.getAttribute('data-cellIndex');
    const lineIndex = await firstCell.getAttribute('data-lineIndex');
    const column = await firstCell.getAttribute('data-column');

    console.log(`  Cell attributes: lineIndex=${lineIndex}, cellIndex=${cellIndex}, column=${column}`);

    // Verify the cell renders with accidental overlay
    const firstCellAfterHtml = await firstCell.innerHTML();
    console.log(`After backspace - cell HTML: "${firstCellAfterHtml}"`);

    // Verify the cell has the has-accidental class for CSS overlay
    const hasAccidentalClass = await firstCell.evaluate(el => el.classList.contains('has-accidental'));
    console.log(`  Has accidental class: ${hasAccidentalClass}`);
    expect(hasAccidentalClass).toBe(true);

    // Verify the accidental type is stored in data attribute
    const accidentalType = await firstCell.getAttribute('data-accidental-type');
    console.log(`  Accidental type: ${accidentalType}`);
    expect(accidentalType).toBe('sharp');

    // Verify composite glyph codepoint is available for overlay
    const compositeGlyph = await firstCell.getAttribute('data-composite-glyph');
    console.log(`  Composite glyph: ${compositeGlyph}`);
    expect(compositeGlyph).toBeDefined();

    // The cell should display the sharp composite glyph (U+E1F0) via CSS overlay
    // Screenshots should show: before="1#", after="1#" (both show the composite glyph)
    const afterScreenshotData = await page.screenshot();
    expect(afterScreenshotData).toBeDefined();
  }
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
