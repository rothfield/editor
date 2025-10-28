import { test, expect } from '@playwright/test';

test('diagnostic: cursor position vs stop index', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();

    const stops = app.editor.getNavigableStops();
    const line = app.editor.theDocument.lines[0];
    const cells = line.cells;

    console.log('\n=== CELLS AND STOPS ===');
    stops.forEach(stop => {
      const cell = cells[stop.cellIndex];
      console.log(`Stop ${stop.stopIndex} → cellIndex ${stop.cellIndex} "${cell.char}"`);
    });

    // Get cell rendered positions
    const cellElements = document.querySelectorAll('[data-cell-index]');
    console.log('\n=== RENDERED CELL POSITIONS ===');
    const positions = [];
    cellElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const idx = parseInt(el.getAttribute('data-cell-index'));
      positions.push({
        cellIndex: idx,
        char: el.textContent,
        left: rect.left,
        right: rect.right
      });
      console.log(`Cell ${idx} "${el.textContent}": left=${rect.left.toFixed(2)}, right=${rect.right.toFixed(2)}`);
    });

    // Simulate clicking at each position
    const editorRect = document.querySelector('[data-testid="editor-root"]').getBoundingClientRect();
    console.log('\n=== WHAT calculateCellPosition RETURNS ===');

    const testX = [
      { x: positions[0].left - editorRect.left + 1, label: 'Inside cell 0' },
      { x: positions[0].right - editorRect.left - 1, label: 'Near right edge of cell 0' },
      { x: positions[1].left - editorRect.left + 1, label: 'Inside cell 1' },
      { x: positions[1].right - editorRect.left - 1, label: 'Near right edge of cell 1' },
      { x: positions[2].left - editorRect.left + 1, label: 'Inside cell 2' },
      { x: positions[2].right - editorRect.left - 1, label: 'Near right edge of cell 2' }
    ];

    testX.forEach(test => {
      const result = app.editor.calculateCellPosition(test.x, 100);
      console.log(`x=${test.x.toFixed(2)} (${test.label}): calculateCellPosition returns ${result}`);
    });

    return { stops, cells: cells.map(c => c.char) };
  });

  console.log('\n=== ANALYSIS ===');
  console.log('Stops:', info.stops);
  console.log('Cells:', info.cells);
  expect(info).toBeDefined();
});
