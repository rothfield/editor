import { test, expect } from '@playwright/test';

test('diagnostic: mouse event coordinates during drag', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  //Install a spy on initializeSelection to log calls
  await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const origInitialize = app.editor.initializeSelection.bind(app.editor);
    window.initializeSelectionCalls = [];

    app.editor.initializeSelection = function(start, end) {
      console.log(`[INTERCEPT] initializeSelection(${start}, ${end})`);
      window.initializeSelectionCalls.push({ start, end });
      return origInitialize(start, end);
    };

    // Also spy on calculateCellPosition
    const origCalcCellPos = app.editor.calculateCellPosition.bind(app.editor);
    window.calculateCellPositionCalls = [];

    app.editor.calculateCellPosition = function(x, y) {
      const result = origCalcCellPos(x, y);
      console.log(`[INTERCEPT] calculateCellPosition(${x.toFixed(2)}, ${y.toFixed(2)}) = ${result}`);
      window.calculateCellPositionCalls.push({ x, y, result });
      return result;
    };
  });

  // Get cell positions
  const cellPositions = await page.evaluate(() => {
    const cells = document.querySelectorAll('[data-cell-index]');
    const positions = [];
    cells.forEach(cell => {
      const rect = cell.getBoundingClientRect();
      const index = cell.getAttribute('data-cell-index');
      const text = cell.textContent;
      positions.push({
        index: parseInt(index),
        text: text,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      });
    });
    return positions;
  });

  console.log('\n=== CELL POSITIONS ===');
  cellPositions.forEach(p => {
    console.log(`[${p.index}] "${p.text}": x=${p.left.toFixed(2)}-${p.right.toFixed(2)}, y=${p.top.toFixed(2)}-${p.bottom.toFixed(2)}`);
  });

  // Perform drag
  const cell1 = cellPositions.find(p => p.index === 1);
  const cell2 = cellPositions.find(p => p.index === 2);

  const startX = cell1.left + (cell1.right - cell1.left) / 2;
  const startY = (cell1.top + cell1.bottom) / 2;
  const endX = cell2.right - 5;
  const endY = (cell2.top + cell2.bottom) / 2;

  console.log(`\n=== PERFORMING DRAG ===`);
  console.log(`Start: (${startX.toFixed(2)}, ${startY.toFixed(2)})`);
  console.log(`End: (${endX.toFixed(2)}, ${endY.toFixed(2)})`);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();

  await page.waitForTimeout(300);

  // Check what was intercepted
  const calls = await page.evaluate(() => {
    return {
      initializeSelectionCalls: window.initializeSelectionCalls,
      calculateCellPositionCalls: window.calculateCellPositionCalls
    };
  });

  console.log(`\n=== INTERCEPTED CALLS ===`);
  console.log('initializeSelection calls:');
  calls.initializeSelectionCalls.forEach(call => {
    console.log(`  (${call.start}, ${call.end})`);
  });

  console.log('calculateCellPosition calls:');
  calls.calculateCellPositionCalls.forEach(call => {
    console.log(`  (${call.x.toFixed(2)}, ${call.y.toFixed(2)}) → ${call.result}`);
  });

  // Get final selection
  const selection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.getSelection();
  });

  console.log(`\n=== FINAL SELECTION ===`);
  console.log(`Selection: ${JSON.stringify(selection)}`);
  console.log(`Expected: start=1, end=2`);

  expect(selection.start).toBe(1);
  expect(selection.end).toBe(2);
});
