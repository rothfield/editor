import { test, expect } from '@playwright/test';

test('diagnostic: verify character positions in display list for "abc"', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "abc"
  await page.keyboard.type('abc');
  await page.waitForTimeout(300);

  // Get the display list from renderer
  const displayList = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const renderer = app.editor.renderer;

    // Get the display list (WASM layout output)
    const line = app.editor.theDocument.lines[0];

    // Check if renderer has displayList
    if (renderer.displayList && renderer.displayList.lines && renderer.displayList.lines[0]) {
      return {
        source: 'renderer.displayList',
        cells: renderer.displayList.lines[0].cells.slice(0, 10).map(cell => ({
          char: cell.char,
          x: cell.x,
          y: cell.y,
          w: cell.w,
          cursor_left: cell.cursor_left,
          cursor_right: cell.cursor_right
        }))
      };
    }

    // Fallback to document line
    return {
      source: 'theDocument.lines',
      cells: line.cells.map(cell => ({
        char: cell.char,
        x: cell.x,
        y: cell.y,
        w: cell.w
      }))
    };
  });

  console.log('\n=== CHARACTER POSITIONS IN DISPLAY LIST ===');
  console.log(`Source: ${displayList.source}`);
  console.log('Expected: each character should have reasonable width, and x positions should be sequential');
  console.log('');

  let totalWidth = 0;
  displayList.cells.forEach((cell, idx) => {
    const expectedX = idx === 0 ? 60 : displayList.cells[idx - 1].cursor_right;
    const xMatch = Math.abs(cell.x - expectedX) < 0.01 ? '✓' : '✗';
    console.log(`[${idx}] "${cell.char}"`);
    console.log(`  x: ${cell.x} (expected: ${expectedX}) ${xMatch}`);
    console.log(`  w: ${cell.w}`);
    console.log(`  cursor_left: ${cell.cursor_left}, cursor_right: ${cell.cursor_right}`);
    console.log(`  calculated_width: ${cell.cursor_right - cell.cursor_left}`);
    totalWidth += (cell.cursor_right - cell.cursor_left);
  });

  console.log('');
  console.log(`Total width (sum of character widths): ${totalWidth}`);

  // Verify x positions are sequential
  console.log('\n=== VERIFICATION ===');
  let isValid = true;
  for (let i = 1; i < displayList.cells.length; i++) {
    const prev = displayList.cells[i - 1];
    const curr = displayList.cells[i];
    const prevEnd = prev.cursor_right;
    const currStart = curr.x;

    if (Math.abs(prevEnd - currStart) > 0.01) {
      console.log(`❌ Gap found between "${prev.char}" and "${curr.char}": ${prevEnd} -> ${currStart} (gap: ${currStart - prevEnd})`);
      isValid = false;
    } else {
      console.log(`✓ "${prev.char}" -> "${curr.char}": sequential`);
    }
  }

  if (isValid) {
    console.log('✓ All positions are correctly sequential');
  } else {
    console.log('❌ Some positions are not sequential - there may be a layout bug');
  }

  // Additional check: are all widths reasonable?
  console.log('\n=== WIDTH ANALYSIS ===');
  const widths = displayList.cells.map(c => c.cursor_right - c.cursor_left);
  const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);

  console.log(`Average character width: ${avgWidth.toFixed(2)}`);
  console.log(`Min width: ${minWidth.toFixed(2)}, Max width: ${maxWidth.toFixed(2)}`);
  console.log(`Width variance: ${(maxWidth - minWidth).toFixed(2)}`);

  if (maxWidth - minWidth > 5) {
    console.log('⚠️  Large variance in character widths detected');
  }

  expect(isValid).toBe(true);
});
