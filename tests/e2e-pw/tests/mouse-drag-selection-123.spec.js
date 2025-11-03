import { test, expect } from '@playwright/test';

test('mouse drag selection: select "123" by click-drag-release', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Click editor and type "123"
  await editor.click();
  await page.keyboard.type('123');
  await page.waitForTimeout(300);

  console.log('\n=== AFTER TYPING ===');
  const afterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const doc = app.editor.theDocument;
    return {
      cells: doc.lines[0].cells.map(c => c.char).join(''),
      cellCount: doc.lines[0].cells.length,
      cursor: doc.state.cursor
    };
  });
  console.log('Document:', afterTyping.cells);
  console.log('Cell count:', afterTyping.cellCount);
  console.log('Cursor:', afterTyping.cursor);

  // Get the position of the first and last cell
  const cellPositions = await page.evaluate(() => {
    const firstCell = document.querySelector('[data-cell-index="0"]');
    const lastCell = document.querySelector('[data-cell-index="2"]');

    if (!firstCell || !lastCell) {
      return null;
    }

    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();

    return {
      firstCell: {
        left: firstRect.left,
        top: firstRect.top,
        centerX: firstRect.left + firstRect.width / 2,
        centerY: firstRect.top + firstRect.height / 2,
        right: firstRect.right
      },
      lastCell: {
        left: lastRect.left,
        top: lastRect.top,
        centerX: lastRect.left + lastRect.width / 2,
        centerY: lastRect.top + lastRect.height / 2,
        right: lastRect.right
      }
    };
  });

  if (!cellPositions) {
    throw new Error('Could not find cells to select');
  }

  console.log('\n=== CELL POSITIONS ===');
  console.log('First cell (index 0):', cellPositions.firstCell);
  console.log('Last cell (index 2):', cellPositions.lastCell);

  // Get editor bounding box for coordinate conversion
  const editorBox = await editor.boundingBox();

  // Perform mouse drag selection:
  // 1. Mouse down at the start of first cell
  // 2. Mouse move to the end of last cell
  // 3. Mouse up

  const startX = cellPositions.firstCell.left - editorBox.x + 2; // Slight offset from left edge
  const startY = cellPositions.firstCell.centerY - editorBox.y;
  const endX = cellPositions.lastCell.right - editorBox.x - 2; // Slight offset from right edge
  const endY = cellPositions.lastCell.centerY - editorBox.y;

  console.log('\n=== MOUSE DRAG ===');
  console.log(`Start position: (${startX}, ${startY})`);
  console.log(`End position: (${endX}, ${endY})`);

  // Execute drag operation
  await editor.hover({ position: { x: startX, y: startY } });
  await page.mouse.down();
  await page.waitForTimeout(50);

  // Check selection after mouseDown
  const afterMouseDown = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.theDocument.state.selection;
  });
  console.log('After mouseDown:', JSON.stringify(afterMouseDown, null, 2));

  await editor.hover({ position: { x: endX, y: endY } });
  await page.waitForTimeout(50);

  // Check selection after mouseMove
  const afterMouseMove = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.theDocument.state.selection;
  });
  console.log('After mouseMove:', JSON.stringify(afterMouseMove, null, 2));

  await page.mouse.up();
  await page.waitForTimeout(200);

  console.log('\n=== AFTER MOUSE DRAG ===');

  // Check selection state
  const selectionState = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.theDocument.state.selection;
    return selection;
  });

  console.log('Selection state:', JSON.stringify(selectionState, null, 2));

  // Check visual selection
  const selectedCells = await page.locator('[data-cell-index].selected').count();
  console.log('Visually selected cells:', selectedCells);

  // Get which cells are visually selected
  const selectedIndices = await page.evaluate(() => {
    const selected = document.querySelectorAll('[data-cell-index].selected');
    return Array.from(selected).map(el => ({
      index: el.getAttribute('data-cell-index'),
      char: el.textContent
    }));
  });
  console.log('Selected cell indices:', selectedIndices);

  // Verify selection was created
  expect(selectionState).not.toBeNull();
  expect(selectionState.is_empty).toBe(false);
  expect(selectionState.active).toBe(true);

  // Verify all three cells are selected (indices 0, 1, 2)
  expect(selectedCells).toBe(3);
  expect(selectedIndices).toHaveLength(3);

  // Verify the selection covers "123"
  const selectedText = selectedIndices.map(c => c.char).join('');
  console.log('Selected text:', selectedText);
  expect(selectedText).toBe('123');

  console.log('\n✅ Test passed: "123" selected by mouse drag');
});
