import { test, expect } from '@playwright/test';

test('diagnostic: inspect cursorPositions array', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Manually reconstruct what calculateCellPosition does
  const result = await page.evaluate(() => {
    const lineContainer = document.querySelector('.notation-line');
    const cellElements = Array.from(lineContainer.querySelectorAll('.char-cell'));
    const editorRect = document.querySelector('[data-testid="editor-root"]').getBoundingClientRect();

    console.log('\n=== CELL ELEMENTS AND RECTS ===');
    const cellRects = cellElements.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const relLeft = rect.left - editorRect.left;
      const relRight = rect.right - editorRect.left;
      console.log(`Cell ${i}: "${el.textContent}" - left=${relLeft.toFixed(2)}, right=${relRight.toFixed(2)}`);
      return { left: relLeft, right: relRight };
    });

    // Reconstruct cursorPositions array EXACTLY as calculateCellPosition does
    const cursorPositions = [];

    // Position 0: left edge of first cell
    const firstCell = cellElements[0];
    const firstRect = firstCell.getBoundingClientRect();
    const pos0 = firstRect.left - editorRect.left;
    cursorPositions.push(pos0);
    console.log(`\ncursorPositions[0] = ${pos0.toFixed(2)} (left edge of cell 0)`);

    // Positions 1..N: right edge of each cell
    for (let i = 0; i < cellElements.length; i++) {
      const cell = cellElements[i];
      const cellRect = cell.getBoundingClientRect();
      const rightPos = cellRect.right - editorRect.left;
      cursorPositions.push(rightPos);
      console.log(`cursorPositions[${i+1}] = ${rightPos.toFixed(2)} (right edge of cell ${i})`);
    }

    console.log(`\n=== TESTING CLICK POSITIONS ===`);

    // Test clicking at cell 1 center
    const cell1Rect = cellElements[1].getBoundingClientRect();
    const cell1CenterX = (cell1Rect.left + cell1Rect.right) / 2 - editorRect.left;
    console.log(`\nCell 1 center X: ${cell1CenterX.toFixed(2)}`);

    // Find closest cursor position
    let closestIndex = 0;
    let minDistance = Math.abs(cell1CenterX - cursorPositions[0]);
    console.log(`Distance to cursorPositions[0] (${cursorPositions[0].toFixed(2)}): ${minDistance.toFixed(2)}`);

    for (let i = 1; i < cursorPositions.length; i++) {
      const distance = Math.abs(cell1CenterX - cursorPositions[i]);
      console.log(`Distance to cursorPositions[${i}] (${cursorPositions[i].toFixed(2)}): ${distance.toFixed(2)}`);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    console.log(`\nClosest index: ${closestIndex}`);
    const cellIndex = Math.max(0, closestIndex - 1);
    console.log(`Cell index = Math.max(0, ${closestIndex} - 1) = ${cellIndex}`);

    // Do the same for cell 2
    const cell2Rect = cellElements[2].getBoundingClientRect();
    const cell2CenterX = (cell2Rect.left + cell2Rect.right) / 2 - editorRect.left;
    console.log(`\nCell 2 center X: ${cell2CenterX.toFixed(2)}`);

    let closestIndex2 = 0;
    let minDistance2 = Math.abs(cell2CenterX - cursorPositions[0]);

    for (let i = 1; i < cursorPositions.length; i++) {
      const distance = Math.abs(cell2CenterX - cursorPositions[i]);
      if (distance < minDistance2) {
        minDistance2 = distance;
        closestIndex2 = i;
      }
    }

    console.log(`Closest index: ${closestIndex2}`);
    const cellIndex2 = Math.max(0, closestIndex2 - 1);
    console.log(`Cell index = Math.max(0, ${closestIndex2} - 1) = ${cellIndex2}`);

    return {
      cursorPositions: cursorPositions.map(p => parseFloat(p.toFixed(2))),
      cell1CenterX: parseFloat(cell1CenterX.toFixed(2)),
      cell2CenterX: parseFloat(cell2CenterX.toFixed(2)),
      cell1Result: cellIndex,
      cell2Result: cellIndex2
    };
  });

  console.log('\n=== FINAL RESULT ===');
  console.log('Cursor positions:', result.cursorPositions);
  console.log('Cell 1 center X:', result.cell1CenterX);
  console.log('Cell 2 center X:', result.cell2CenterX);
  console.log('Cell 1 -> index:', result.cell1Result);
  console.log('Cell 2 -> index:', result.cell2Result);

  expect(result.cell1Result).toBe(1);
  expect(result.cell2Result).toBe(2);
});
