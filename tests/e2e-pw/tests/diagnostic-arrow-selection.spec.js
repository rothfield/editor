import { test, expect } from '@playwright/test';

test('diagnostic: Shift+Left arrow selection with simple input "123"', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "123"
  await page.keyboard.type('123');
  await page.waitForTimeout(300);

  // Get state before selection
  const beforeSelection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();

    return {
      charPos: app.editor.charPos,
      currentStopIndex: app.editor.currentStopIndex,
      selection: app.editor.getSelection(),
      stops: stops.map(s => ({
        stopIndex: s.stopIndex,
        cellIndex: s.cellIndex,
        x: s.x,
        kind: s.kind,
        id: s.id
      }))
    };
  });

  console.log('\n=== BEFORE Shift+Left ===');
  console.log(`Cursor at charPos: ${beforeSelection.charPos}`);
  console.log(`Current stopIndex: ${beforeSelection.currentStopIndex}`);
  console.log(`Selection: ${JSON.stringify(beforeSelection.selection)}`);
  console.log('Navigable stops:');
  beforeSelection.stops.forEach(s => {
    console.log(`  [${s.stopIndex}] cellIndex=${s.cellIndex}, x=${s.x}, id=${s.id}`);
  });

  // Press Shift+Left to select the "3"
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  // Get state after selection with detailed cell mapping
  const afterSelection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();

    const cursorPos = app.editor.getCursorPosition();
    const { cellIndex: cellAtCursor, charOffsetInCell } = app.editor.charPosToCellIndex(cursorPos);
    const currentStop = app.editor.getCurrentStop();

    // Get cell boundaries
    const line = app.editor.theDocument.lines[0];
    const cellBoundaries = [];
    let pos = 0;
    line.cells.forEach((cell, idx) => {
      cellBoundaries.push({
        cellIndex: idx,
        char: cell.char,
        startPos: pos,
        endPos: pos + cell.char.length
      });
      pos += cell.char.length;
    });

    return {
      charPos: cursorPos,
      cellAtCursor: cellAtCursor,
      charOffsetInCell: charOffsetInCell,
      currentStop: currentStop ? { stopIndex: currentStop.stopIndex, cellIndex: currentStop.cellIndex } : null,
      selection: app.editor.getSelection(),
      cellBoundaries: cellBoundaries,
      stops: stops.map(s => ({
        stopIndex: s.stopIndex,
        cellIndex: s.cellIndex,
        x: s.x
      }))
    };
  });

  console.log('\n=== AFTER Shift+Left ===');
  console.log(`Cursor at charPos: ${afterSelection.charPos}`);
  console.log(`charPosToCellIndex result: cellIndex=${afterSelection.cellAtCursor}, charOffsetInCell=${afterSelection.charOffsetInCell}`);
  console.log(`getCurrentStop result: ${afterSelection.currentStop ? `stopIndex=${afterSelection.currentStop.stopIndex}, cellIndex=${afterSelection.currentStop.cellIndex}` : 'null'}`);
  console.log(`Selection: ${JSON.stringify(afterSelection.selection)}`);
  console.log('Cell boundaries:');
  afterSelection.cellBoundaries.forEach(b => {
    const marker = afterSelection.charPos >= b.startPos && afterSelection.charPos <= b.endPos ? ' <-- CURSOR HERE' : '';
    console.log(`  [${b.cellIndex}] "${b.char}" charPos ${b.startPos}-${b.endPos}${marker}`);
  });

  // Verify the selection includes cell at index 2 (the "3")
  console.log('\n=== VERIFICATION ===');
  if (afterSelection.selection) {
    console.log(`Selection range: startStopIndex=${afterSelection.selection.startStopIndex}, endStopIndex=${afterSelection.selection.endStopIndex}`);
    console.log(`Selection start/end (cell-based): start=${afterSelection.selection.start}, end=${afterSelection.selection.end}`);
    const expectedCellIndex = 2; // The "3" is in cell index 2
    console.log(`Expected to select cell at index ${expectedCellIndex}`);
  } else {
    console.log('❌ NO SELECTION CREATED!');
  }

  // Check visual selection
  const selectedCells = await page.locator('[data-cell-index].selected').count();
  console.log(`\nVisually selected cells: ${selectedCells}`);

  expect(afterSelection.selection).not.toBeNull();
  expect(afterSelection.selection).toBeDefined();
  expect(selectedCells).toBeGreaterThan(0);
});
