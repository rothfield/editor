import { test, expect } from '@playwright/test';

test('diagnostic: test calculateCellPosition directly', async ({ page }) => {
  // Capture console logs
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

  // Test calculateCellPosition directly
  const result = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const editor = app.editor;

    // Get cell positions from DOM
    const lineContainer = document.querySelector('.notation-line');
    const cellElements = Array.from(lineContainer.querySelectorAll('.char-cell'));
    const editorRect = document.querySelector('[data-testid="editor-root"]').getBoundingClientRect();

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

    console.log('\n=== CELL POSITIONS ===');
    cellRects.forEach(c => {
      console.log(`Cell ${c.index}: centerX=${c.centerX.toFixed(2)}, char="${c.char}"`);
    });

    console.log('\n=== TESTING calculateCellPosition ===');

    // Test with cell 1 center
    const cell1Center = cellRects[1].centerX;
    const pos1 = editor.calculateCellPosition(cell1Center, 100);
    console.log(`calculateCellPosition(${cell1Center.toFixed(2)}, 100) = ${pos1}`);

    // Test with cell 2 center
    const cell2Center = cellRects[2].centerX;
    const pos2 = editor.calculateCellPosition(cell2Center, 100);
    console.log(`calculateCellPosition(${cell2Center.toFixed(2)}, 100) = ${pos2}`);

    return { pos1, pos2, cell1Center: cell1Center.toFixed(2), cell2Center: cell2Center.toFixed(2) };
  });

  console.log('Test results:', result);
  console.log('Console logs:', consoleLogs);

  // Verify the results
  expect(result.pos1).toBe(1);
  expect(result.pos2).toBe(2);
});
