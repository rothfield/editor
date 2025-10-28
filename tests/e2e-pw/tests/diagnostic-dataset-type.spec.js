import { test, expect } from '@playwright/test';

test('diagnostic: check dataset type and contents', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "h"
  await page.keyboard.type('h');
  await page.waitForTimeout(300);

  // Check the dataset type and contents
  const datasetInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const displayList = app.editor.displayList;
    const firstCell = displayList.lines[0].cells[0];

    return {
      dataset: firstCell.dataset,
      datasetType: typeof firstCell.dataset,
      datasetConstructor: firstCell.dataset.constructor.name,
      isMap: firstCell.dataset instanceof Map,
      isObject: firstCell.dataset instanceof Object,
      keys: Object.keys(firstCell.dataset),
      hasGetMethod: typeof firstCell.dataset.get === 'function',
      // Try accessing cellIndex both ways
      viaDotNotation: firstCell.dataset.cellIndex,
      viaGetMethod: typeof firstCell.dataset.get === 'function' ? firstCell.dataset.get('cellIndex') : 'NO GET METHOD'
    };
  });

  console.log('=== DATASET DIAGNOSTIC ===');
  console.log('dataset:', JSON.stringify(datasetInfo.dataset, null, 2));
  console.log('Type:', datasetInfo.datasetType);
  console.log('Constructor:', datasetInfo.datasetConstructor);
  console.log('Is Map?:', datasetInfo.isMap);
  console.log('Is Object?:', datasetInfo.isObject);
  console.log('Keys:', datasetInfo.keys);
  console.log('Has .get() method?:', datasetInfo.hasGetMethod);
  console.log('Via dot notation (dataset.cellIndex):', datasetInfo.viaDotNotation);
  console.log('Via .get() method (dataset.get("cellIndex")):', datasetInfo.viaGetMethod);
});
