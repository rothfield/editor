import { test, expect } from '@playwright/test';

test('Beat arcs align with cells on multiple lines', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('1-- 2-');
  await page.keyboard.press('Enter');
  await page.keyboard.type('3-- 4-');
  await page.waitForTimeout(500);

  const analysis = await page.evaluate(() => {
    // Debug: check DisplayList
    const dl = window.musicEditor.displayList;
    console.log('Lines in DisplayList:', dl.lines.length);
    dl.lines.forEach((line, i) => {
      console.log(`  Line ${i}: ${line.beat_loops?.length || 0} beat loops`);
    });

    const arcs = Array.from(document.querySelectorAll('.beat-loop-path'));
    console.log('Total arcs in DOM:', arcs.length);

    return arcs.map((arc, i) => {
      const arcRect = arc.getBoundingClientRect();

      // Find closest cell by checking which cell bottom is nearest to arc top
      const cells = Array.from(document.querySelectorAll('.cell-container'));
      let closestCell = null;
      let minDiff = Infinity;

      cells.forEach(cell => {
        const cellRect = cell.getBoundingClientRect();
        const diff = Math.abs(cellRect.bottom - arcRect.top);
        if (diff < minDiff) {
          minDiff = diff;
          closestCell = {
            text: cell.textContent,
            bottom: cellRect.bottom,
            diff
          };
        }
      });

      return {
        arcIndex: i,
        arcY: arcRect.top,
        closestCell
      };
    });
  });

  console.log('Arc alignment:');
  analysis.forEach(arc => {
    console.log(`Arc ${arc.arcIndex}: Y=${arc.arcY.toFixed(1)}, closest cell="${arc.closestCell.text}" bottom=${arc.closestCell.bottom.toFixed(1)}, diff=${arc.closestCell.diff.toFixed(1)}px`);
  });

  // All arcs should be within 2px of a cell bottom
  for (const arc of analysis) {
    expect(arc.closestCell.diff).toBeLessThan(2);
  }
});
