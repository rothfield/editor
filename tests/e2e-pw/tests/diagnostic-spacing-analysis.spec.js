import { test, expect } from '@playwright/test';

test('diagnostic: analyze spacing gaps', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some text
  await page.keyboard.type('Hello World');

  // Wait for rendering
  await page.waitForTimeout(300);

  // Check display list
  const analysis = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const displayList = app.editor.displayList;

    if (!displayList || !displayList.lines[0]) return null;

    const cells = displayList.lines[0].cells;
    return cells.map((c, idx) => {
      const prevX = idx > 0 ? cells[idx - 1].x : null;
      const gap = prevX !== null ? c.x - prevX : null;

      return {
        index: idx,
        char: c.char,
        x: c.x,
        w: c.w,
        gap: gap,
        charPositions: c.char_positions
      };
    });
  });

  console.log('\n=== SPACING ANALYSIS ===');
  analysis.forEach(cell => {
    const gapStr = cell.gap !== null ? `gap=${cell.gap.toFixed(1)}` : 'gap=N/A';
    console.log(`[${cell.index}] "${cell.char}" x=${cell.x.toFixed(1)} w=${cell.w.toFixed(1)} ${gapStr}`);
    console.log(`    char_positions: [${cell.charPositions.map(p => p.toFixed(1)).join(', ')}]`);
  });

  // Look for abnormally large gaps
  const largeGaps = analysis.filter(c => c.gap !== null && c.gap > 10);
  console.log('\n=== LARGE GAPS (> 10px) ===');
  largeGaps.forEach(c => {
    console.log(`  [${c.index}] "${c.char}" has gap of ${c.gap.toFixed(1)}px from previous cell`);
  });
});
