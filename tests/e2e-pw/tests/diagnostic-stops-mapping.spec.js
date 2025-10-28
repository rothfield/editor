import { test, expect } from '@playwright/test';

test('diagnostic: stops and cells mapping', async ({ page }) => {
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

    console.log('\n=== CELLS ===');
    cells.forEach((cell, idx) => {
      console.log(`[${idx}] "${cell.char}"`);
    });

    console.log('\n=== STOPS ===');
    stops.forEach(stop => {
      console.log(`Stop ${stop.stopIndex} → cellIndex ${stop.cellIndex}`);
    });

    console.log('\n=== SELECTION RANGES ===');
    // Test different selection ranges
    const ranges = [
      { start: 0, end: 0, label: 'Just cell 0' },
      { start: 1, end: 1, label: 'Just cell 1' },
      { start: 2, end: 2, label: 'Just cell 2' },
      { start: 0, end: 1, label: 'Cells 0-1' },
      { start: 1, end: 2, label: 'Cells 1-2' },
      { start: 0, end: 2, label: 'Cells 0-2' }
    ];

    const results = [];
    for (const range of ranges) {
      app.editor.initializeSelection(range.start, range.end);
      const selection = app.editor.getSelection();
      const text = app.editor.getSelectedText();
      results.push({
        range,
        selection,
        text
      });
      console.log(`initializeSelection(${range.start}, ${range.end}) → selection: start=${selection.start}, end=${selection.end}, text="${text}"`);
    }

    return { results };
  });

  console.log('\n=== SUMMARY ===');
  info.results.forEach(r => {
    console.log(`Range (${r.range.start}, ${r.range.end}): "${r.text}"`);
    if (r.selection.start !== r.range.start || r.selection.end !== r.range.end) {
      console.log(`  ⚠️  Selection CHANGED: (${r.selection.start}, ${r.selection.end})`);
    }
  });

  expect(info.results).toBeDefined();
});
