import { test, expect } from '@playwright/test';

test('diagnostic: mouse drag selection count - "456" select "56"', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

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
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right
      });
    });
    return positions;
  });

  console.log('\n=== CELL POSITIONS ===');
  cellPositions.forEach(p => {
    console.log(`[${p.index}] "${p.text}": x=${p.x.toFixed(2)}, left=${p.left.toFixed(2)}, right=${p.right.toFixed(2)}, w=${p.width.toFixed(2)}`);
  });

  // Cell 0 is "4", cell 1 is "5", cell 2 is "6"
  // We want to drag from the middle of cell 1 to the middle of cell 2 to select "56"
  const cell5 = cellPositions.find(p => p.index === 1);
  const cell6 = cellPositions.find(p => p.index === 2);

  const startX = cell5.left + cell5.width / 2;
  const startY = cell5.y + cell5.height / 2;
  const endX = cell6.right - 5;  // Near the end of cell 6
  const endY = cell6.y + cell6.height / 2;

  console.log(`\n=== DRAG SELECTION ===`);
  console.log(`From: (${startX.toFixed(2)}, ${startY.toFixed(2)}) - middle of cell 1 ("5")`);
  console.log(`To: (${endX.toFixed(2)}, ${endY.toFixed(2)}) - end of cell 2 ("6")`);

  // Perform mouse drag
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();

  await page.waitForTimeout(300);

  // Get selection info
  const selectionInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.getSelection();
    const selectedText = app.editor.getSelectedText();

    return {
      selection: selection,
      selectedText: selectedText,
      displayInfo: document.querySelector('#selection-info')?.textContent || 'N/A'
    };
  });

  console.log('\n=== SELECTION RESULT ===');
  console.log(`Selection object: ${JSON.stringify(selectionInfo.selection)}`);
  console.log(`Selected text: "${selectionInfo.selectedText}"`);
  console.log(`Display info: "${selectionInfo.displayInfo}"`);

  // Count cells
  const selectedCells = await page.locator('[data-cell-index].selected').count();
  console.log(`Visually selected cells: ${selectedCells}`);

  console.log('\n=== VERIFICATION ===');
  if (selectionInfo.selection) {
    const cellCount = selectionInfo.selection.end - selectionInfo.selection.start + 1;
    console.log(`Selection range: start=${selectionInfo.selection.start}, end=${selectionInfo.selection.end}`);
    console.log(`Calculated cell count: ${cellCount}`);
    console.log(`Expected: 2 cells (indices 1 and 2)`);
    console.log(`Actual selected text: "${selectionInfo.selectedText}" (expected: "56")`);
  }

  // The display should show "Selected: 2 cells"
  expect(selectionInfo.selectedText).toBe('56');
  expect(selectionInfo.selection.end - selectionInfo.selection.start + 1).toBe(2);
});
