import { test } from '@playwright/test';

test('DEBUG: List all keys in theDocument', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  const docKeys = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    if (!doc) return null;

    const keys = Object.keys(doc);
    return {
      totalKeys: keys.length,
      keys: keys.slice(0, 20),
      allKeys: keys,
      // Check some specific properties
      hasMeasures: 'measures' in doc,
      hasCells: 'cells' in doc,
      hasState: 'state' in doc,
      hasNotes: 'notes' in doc,
      hasInstruments: 'instruments' in doc,
      // Get a sample of the first property
      firstKey: keys[0],
      firstKeyValue: doc[keys[0]]
    };
  });

  console.log('Document keys:', JSON.stringify(docKeys, null, 2));
});
