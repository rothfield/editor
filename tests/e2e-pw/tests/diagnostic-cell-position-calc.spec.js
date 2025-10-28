import { test, expect } from '@playwright/test';

test('diagnostic: calculateCellPosition internals', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  const debugInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const editorElement = app.editor.element;
    const editorRect = editorElement.getBoundingClientRect();

    const y = 114.5;  // Middle of the editor vertically

    // Simulate what calculateCellPosition does
    const lineIndex = app.editor.calculateLineFromY(y);
    console.log(`calculateLineFromY(${y}) = ${lineIndex}`);

    const lineContainers = editorElement.querySelectorAll('.notation-line');
    console.log(`Found ${lineContainers.length} notation-line elements`);

    if (lineIndex >= lineContainers.length) {
      console.log(`ERROR: lineIndex ${lineIndex} >= lineContainers.length ${lineContainers.length}`);
      return { error: 'lineIndex out of bounds' };
    }

    const lineContainer = lineContainers[lineIndex];
    const cellElements = lineContainer.querySelectorAll('.char-cell');
    console.log(`Line ${lineIndex} has ${cellElements.length} cells`);

    // Build cursor positions like calculateCellPosition does
    const cursorPositions = [];

    const firstCell = cellElements[0];
    const firstRect = firstCell.getBoundingClientRect();
    cursorPositions.push(firstRect.left - editorRect.left);

    for (const cell of cellElements) {
      const cellRect = cell.getBoundingClientRect();
      cursorPositions.push(cellRect.right - editorRect.left);
    }

    console.log(`Cursor positions: [${cursorPositions.map(p => p.toFixed(2)).join(', ')}]`);

    // Test specific x values
    const testX1 = 102.70;
    const testX2 = 124.39;

    let closest1 = 0;
    let minDist1 = Math.abs(testX1 - cursorPositions[0]);
    for (let i = 1; i < cursorPositions.length; i++) {
      const dist = Math.abs(testX1 - cursorPositions[i]);
      if (dist < minDist1) {
        minDist1 = dist;
        closest1 = i;
      }
    }

    let closest2 = 0;
    let minDist2 = Math.abs(testX2 - cursorPositions[0]);
    for (let i = 1; i < cursorPositions.length; i++) {
      const dist = Math.abs(testX2 - cursorPositions[i]);
      if (dist < minDist2) {
        minDist2 = dist;
        closest2 = i;
      }
    }

    console.log(`For x=${testX1}: closest position = ${closest1} (distance ${minDist1.toFixed(2)})`);
    console.log(`For x=${testX2}: closest position = ${closest2} (distance ${minDist2.toFixed(2)})`);

    // Now calculate what the actual function returns
    const result1 = app.editor.calculateCellPosition(testX1, y);
    const result2 = app.editor.calculateCellPosition(testX2, y);

    console.log(`calculateCellPosition(${testX1}, ${y}) = ${result1}`);
    console.log(`calculateCellPosition(${testX2}, ${y}) = ${result2}`);

    return {
      lineIndex,
      cursorPositions,
      closest1,
      closest2,
      result1,
      result2
    };
  });

  console.log('\n=== DEBUG INFO ===');
  console.log(JSON.stringify(debugInfo, null, 2));

  expect(debugInfo).toBeDefined();
});
