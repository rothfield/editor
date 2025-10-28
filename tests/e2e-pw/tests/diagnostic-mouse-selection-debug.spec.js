import { test, expect } from '@playwright/test';

test('diagnostic: mouse drag selection - debug version with logging', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Get navigable stops BEFORE selection
  const stopsBefore = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();
    return stops.map(s => ({
      stopIndex: s.stopIndex,
      cellIndex: s.cellIndex
    }));
  });

  console.log('\n=== NAVIGABLE STOPS ===');
  stopsBefore.forEach(s => {
    console.log(`[${s.stopIndex}] → cellIndex=${s.cellIndex}`);
  });

  // Get the rendered cells
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
        right: rect.right
      });
    });
    return positions;
  });

  // Select cells 1 and 2 ("56")
  const cell5 = cellPositions.find(p => p.index === 1);
  const cell6 = cellPositions.find(p => p.index === 2);

  const startX = cell5.left + (cell5.right - cell5.left) / 2;  // middle of cell 1
  const endX = cell6.right - 5;  // near end of cell 2

  console.log('\n=== DRAG PARAMETERS ===');
  console.log(`Cell 1 ("5"): left=${cell5.left.toFixed(2)}, right=${cell5.right.toFixed(2)}`);
  console.log(`Cell 2 ("6"): left=${cell6.left.toFixed(2)}, right=${cell6.right.toFixed(2)}`);
  console.log(`Start X: ${startX.toFixed(2)} (middle of cell 1)`);
  console.log(`End X: ${endX.toFixed(2)} (near end of cell 2)`);

  // Manually test calculateCellPosition to see what it returns
  const cellIndicesFromCalc = await page.evaluate((x1, x2) => {
    const app = window.MusicNotationApp.app();

    // Get lineIndex
    const lineIndex = app.editor.calculateLineFromY(100);
    console.log(`calculateLineFromY(100) = ${lineIndex}`);

    // Calculate cell positions
    const pos1 = app.editor.calculateCellPosition(x1, 100);
    const pos2 = app.editor.calculateCellPosition(x2, 100);

    return { pos1, pos2 };
  }, [startX, endX]);

  console.log('\n=== calculateCellPosition RESULTS ===');
  console.log(`calculateCellPosition(${startX.toFixed(2)}, 100) = ${cellIndicesFromCalc.pos1}`);
  console.log(`calculateCellPosition(${endX.toFixed(2)}, 100) = ${cellIndicesFromCalc.pos2}`);
  console.log(`Expected: pos1=1 (cell 1), pos2=2 (cell 2)`);

  // Now do the actual drag
  await page.mouse.move(startX, 114.5);
  await page.mouse.down();
  await page.mouse.move(endX, 114.5, { steps: 10 });
  await page.mouse.up();

  await page.waitForTimeout(300);

  // Get final selection
  const selectionInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const selectedText = app.editor.getSelectedText();

    return {
      selection: selection,
      selectedText: selectedText
    };
  });

  console.log('\n=== FINAL SELECTION ===');
  console.log(`Selection: ${JSON.stringify(selectionInfo.selection)}`);
  console.log(`Selected text: "${selectionInfo.selectedText}"`);
  console.log(`Expected: start=1, end=2, text="56"`);
  console.log(`Actual:   start=${selectionInfo.selection.start}, end=${selectionInfo.selection.end}, text="${selectionInfo.selectedText}"`);

  expect(selectionInfo.selectedText).toBe('56');
  expect(selectionInfo.selection.start).toBe(1);
  expect(selectionInfo.selection.end).toBe(2);
});
