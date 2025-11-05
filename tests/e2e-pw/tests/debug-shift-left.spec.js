import { test, expect } from '@playwright/test';

test('Debug Shift+Left selection behavior with ":|"', async ({ page }) => {
  // Capture all console messages
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type ":|"
  await editor.click();
  await page.keyboard.type(':|');
  await page.waitForTimeout(200);

  console.log('\n=== PRESSING SHIFT+LEFT FIRST TIME ===');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  console.log('\n=== PRESSING SHIFT+LEFT SECOND TIME ===');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  // Check selection state
  const selectionInfo = await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    if (!editor) return null;
    return {
      hasSelection: editor.hasSelection?.(),
      selection: editor.getSelection?.()
    };
  });
  console.log('\n=== FINAL SELECTION STATE ===');
  console.log('hasSelection:', selectionInfo.hasSelection);
  console.log('selection:', JSON.stringify(selectionInfo.selection, null, 2));

  console.log('\n=== PRESSING BACKSPACE ===');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Check cells after backspace
  const cellsAfter = await page.evaluate(() => {
    const doc = window.MusicNotationApp?.app()?.editor?.theDocument;
    if (!doc || !doc.lines || !doc.lines[0]) return null;
    return doc.lines[0].cells.map(c => ({ char: c.char, col: c.col }));
  });
  console.log('\n=== CELLS AFTER BACKSPACE ===');
  console.log(JSON.stringify(cellsAfter, null, 2));
});
