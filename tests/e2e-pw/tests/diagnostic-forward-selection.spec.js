/**
 * Diagnostic test: Forward selection tracking
 * Purpose: Understand why forward selection includes cell 0 when it shouldn't
 */

import { test, expect } from '@playwright/test';

test('Diagnostic: Trace forward selection for ornament application', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456 1"
  await page.keyboard.type('456 1');
  await page.waitForTimeout(200);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  Diagnostic: Forward Selection Tracing                ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Step 1: Home
  await page.keyboard.press('Home');
  let state = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const cursor = app.editor.getCursorPosition();
    return { cursor, selection };
  });
  console.log('\nStep 1: Home');
  console.log('  Cursor position:', state.cursor);
  console.log('  Selection:', state.selection);

  // Step 2: ArrowRight (move cursor to position 1, between "4" and "5")
  await page.keyboard.press('ArrowRight');
  state = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const cursor = app.editor.getCursorPosition();
    return { cursor, selection };
  });
  console.log('\nStep 2: ArrowRight (cursor should be at position 1)');
  console.log('  Cursor position:', state.cursor);
  console.log('  Selection:', state.selection);

  // Step 3: First Shift+ArrowRight (select "5")
  await page.keyboard.press('Shift+ArrowRight');
  state = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const cursor = app.editor.getCursorPosition();
    const line = app.editor.theDocument.lines[0];
    const selectedCells = line.cells.filter((c, i) =>
      selection && i >= selection.start && i <= selection.end
    );
    return {
      cursor,
      selection,
      selectedCells: selectedCells.map(c => ({ char: c.char, index: line.cells.indexOf(c) }))
    };
  });
  console.log('\nStep 3: First Shift+ArrowRight (should select cell 1: "5")');
  console.log('  Cursor position:', state.cursor);
  console.log('  Selection:', state.selection);
  console.log('  Selected cells:', state.selectedCells);

  // Step 4: Second Shift+ArrowRight (select "56")
  await page.keyboard.press('Shift+ArrowRight');
  state = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const cursor = app.editor.getCursorPosition();
    const line = app.editor.theDocument.lines[0];
    const selectedCells = line.cells.filter((c, i) =>
      selection && i >= selection.start && i <= selection.end
    );
    return {
      cursor,
      selection,
      selectedCells: selectedCells.map(c => ({ char: c.char, index: line.cells.indexOf(c) }))
    };
  });
  console.log('\nStep 4: Second Shift+ArrowRight (should select cells 1-2: "56")');
  console.log('  Cursor position:', state.cursor);
  console.log('  Selection:', state.selection);
  console.log('  Selected cells:', state.selectedCells);

  // Now apply ornament and check which cells get marked
  await page.keyboard.press('Alt+o');
  await page.waitForTimeout(500);

  const ornamentState = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    return line.cells.map((c, i) => ({
      index: i,
      char: c.char,
      isOrnament: c.ornament_indicator && c.ornament_indicator.name !== 'none'
    }));
  });

  console.log('\nAfter Alt+O (apply ornament):');
  console.log('  Cells with ornament indicators:', ornamentState);

  // Expected: only cells 1-2 should have ornaments
  // Actual: cells 0-2 have ornaments (BUG!)
  const ornamentedCells = ornamentState.filter(c => c.isOrnament).map(c => c.index);
  console.log('\n  Ornamented cell indices:', ornamentedCells);
  console.log(`  Expected: [1, 2]`);
  console.log(`  Actual: [${ornamentedCells.join(', ')}]`);

  if (ornamentedCells.length === 2 && ornamentedCells[0] === 1 && ornamentedCells[1] === 2) {
    console.log('  ✅ PASS: Correct cells marked as ornaments');
  } else {
    console.log('  ❌ FAIL: Wrong cells marked as ornaments (OFF-BY-ONE ERROR!)');
  }

  // Don't assert yet - just log so we can see the diagnostic output
});
