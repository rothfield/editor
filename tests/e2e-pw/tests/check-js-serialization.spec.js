import { test } from '@playwright/test';

test('DEBUG: Check what JavaScript is actually sending to WASM', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  const analysis = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;

    return {
      docKeys: Object.keys(doc),
      linesCount: doc.lines?.length,
      firstLineKeys: Object.keys(doc.lines?.[0] || {}),
      firstLineHasCells: 'cells' in (doc.lines?.[0] || {}),
      firstLineCellsArray: Array.isArray(doc.lines?.[0]?.cells),
      firstLineCellsLength: doc.lines?.[0]?.cells?.length,
      firstLineCellsContent: doc.lines?.[0]?.cells?.map((c, i) => ({
        index: i,
        keys: Object.keys(c),
        char: c.char,
        kind: c.kind
      })).slice(0, 5)
    };
  });

  console.log('JavaScript document analysis:');
  console.log(JSON.stringify(analysis, null, 2));
});
