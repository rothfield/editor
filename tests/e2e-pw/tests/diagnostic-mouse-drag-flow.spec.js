import { test, expect } from '@playwright/test';

test('diagnostic: trace mouse drag flow with logging', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Get baseline info
  const baselineInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();
    const line = app.editor.theDocument.lines[0];
    const cells = line.cells;

    console.log('\n=== BASELINE ===');
    console.log('Cells:', cells.map((c, i) => `[${i}] "${c.char}"`).join(', '));
    console.log('Stops:', stops.map(s => `Stop ${s.stopIndex} -> cell ${s.cellIndex}`).join(', '));

    return { cells: cells.map(c => c.char), stops };
  });

  // Now let's manually trace what happens when we drag from cell 1 to cell 2
  const result = await page.evaluate(async () => {
    const app = window.MusicNotationApp.app();
    const editor = app.editor;

    // Get cell positions from DOM
    const lineContainer = document.querySelector('.notation-line');
    const cellElements = Array.from(lineContainer.querySelectorAll('.char-cell'));
    const editorRect = document.querySelector('[data-testid="editor-root"]').getBoundingClientRect();

    console.log('\n=== CELL POSITIONS IN DOM ===');
    const cellRects = cellElements.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        index: i,
        char: el.textContent,
        left: rect.left - editorRect.left,
        right: rect.right - editorRect.left,
        centerX: (rect.left + rect.right) / 2 - editorRect.left
      };
    });

    cellRects.forEach(c => {
      console.log(`Cell ${c.index} "${c.char}": left=${c.left.toFixed(2)}, right=${c.right.toFixed(2)}, center=${c.centerX.toFixed(2)}`);
    });

    // Simulate clicking at the center of cell 1 (start drag)
    const cell1Center = cellRects[1].centerX;
    console.log(`\n=== DRAG START: clicking at cell 1 center (x=${cell1Center.toFixed(2)}) ===`);

    // Directly call calculateCellPosition to see what it returns
    const startCellPos = editor.calculateCellPosition(cell1Center, 100);
    console.log(`calculateCellPosition(${cell1Center.toFixed(2)}, 100) returned: ${startCellPos}`);

    // Simulate moving to center of cell 2 (end drag)
    const cell2Center = cellRects[2].centerX;
    console.log(`\n=== DRAG END: moving to cell 2 center (x=${cell2Center.toFixed(2)}) ===`);

    const endCellPos = editor.calculateCellPosition(cell2Center, 100);
    console.log(`calculateCellPosition(${cell2Center.toFixed(2)}, 100) returned: ${endCellPos}`);

    // Now simulate what initializeSelection does
    console.log(`\n=== CALLING initializeSelection(${startCellPos}, ${endCellPos}) ===`);

    // First, let's see what findStopFromCellIndex returns
    const stops = editor.getNavigableStops();
    const startStop = editor.findStopFromCellIndex(stops, Math.min(startCellPos, endCellPos));
    const endStop = editor.findStopFromCellIndex(stops, Math.max(startCellPos, endCellPos));

    console.log(`findStopFromCellIndex(${Math.min(startCellPos, endCellPos)}) = ${startStop ? `Stop ${startStop.stopIndex} -> cell ${startStop.cellIndex}` : 'null'}`);
    console.log(`findStopFromCellIndex(${Math.max(startCellPos, endCellPos)}) = ${endStop ? `Stop ${endStop.stopIndex} -> cell ${endStop.cellIndex}` : 'null'}`);

    // Now call the actual selection
    editor.initializeSelection(startCellPos, endCellPos);
    const selection = editor.getSelection();
    const selectedText = editor.getSelectedText();

    console.log(`\n=== RESULT ===`);
    console.log(`Selection: start=${selection.start}, end=${selection.end}`);
    console.log(`Selected text: "${selectedText}"`);
    console.log(`Cell count: ${selection.end - selection.start + 1}`);

    return {
      startCellPos,
      endCellPos,
      selection: { start: selection.start, end: selection.end },
      selectedText,
      cellCount: selection.end - selection.start + 1
    };
  });

  console.log('\n=== TEST RESULT ===');
  console.log('Start cell position:', result.startCellPos);
  console.log('End cell position:', result.endCellPos);
  console.log('Selection:', result.selection);
  console.log('Selected text:', result.selectedText);
  console.log('Cell count:', result.cellCount);

  expect(result.selectedText).toBe('56');
  expect(result.selection.start).toBe(1);
  expect(result.selection.end).toBe(2);
  expect(result.cellCount).toBe(2);
});
