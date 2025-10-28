import { test, expect } from '@playwright/test';

test('ornament: Alt+O applies ornament to selection', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Move to end and select last 2 cells with Shift+Left
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  let selInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    return {
      selection: sel ? { start: sel.start, end: sel.end } : null,
      selectedText: app.editor.getSelectedText()
    };
  });

  console.log('\n=== BEFORE ALT+O ===');
  console.log('Selection:', selInfo.selection);
  console.log('Selected text:', selInfo.selectedText);
  expect(selInfo.selectedText).toBe('56');

  // Apply ornament with Alt+O
  console.log('\n=== APPLYING ORNAMENT WITH ALT+O ===');
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Check if ornament was applied
  const result = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    const cells = line.cells;

    console.log('Cells after applyOrnament:');
    cells.forEach((cell, i) => {
      console.log(`  [${i}] "${cell.char}" - ornaments:`, cell.ornaments);
    });

    return {
      cells: cells.map((c, i) => ({
        index: i,
        char: c.char,
        hasOrnaments: !!(c.ornaments && c.ornaments.length > 0)
      }))
    };
  });

  console.log('\n=== RESULT ===');
  result.cells.forEach(c => {
    console.log(`Cell ${c.index}: "${c.char}" - hasOrnaments: ${c.hasOrnaments}`);
  });

  // Cells 1 and 2 should have ornaments
  expect(result.cells[1].hasOrnaments).toBe(true);
  expect(result.cells[2].hasOrnaments).toBe(true);
});
