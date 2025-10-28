import { test, expect } from '@playwright/test';

test('diagnostic: check cell.kind type and value', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "abc"
  await page.keyboard.type('abc');
  await page.waitForTimeout(300);

  const cellData = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const doc = app.editor.theDocument;

    return {
      cells: doc.lines[0].cells.map(cell => ({
        char: cell.char,
        kind: cell.kind,
        kind_type: typeof cell.kind,
        kind_string: String(cell.kind),
        kind_keys: cell.kind ? Object.keys(cell.kind) : null,
        kind_values: cell.kind ? Object.values(cell.kind) : null,
        continuation: cell.continuation,
        // Check the actual comparison
        kind_not_text: cell.kind !== 'text',
        kind_equals_text: cell.kind === 'text',
        condition_result: cell.continuation && cell.kind !== 'text'
      }))
    };
  });

  console.log('\n=== CELL KIND ANALYSIS ===');
  cellData.cells.forEach((cell, idx) => {
    console.log(`[${idx}] "${cell.char}"`);
    console.log(`  kind: ${cell.kind}`);
    console.log(`  kind (type): ${cell.kind_type}`);
    console.log(`  kind_string: "${cell.kind_string}"`);
    if (cell.kind_keys) {
      console.log(`  kind (keys): [${cell.kind_keys.join(', ')}]`);
      console.log(`  kind (values): [${cell.kind_values.join(', ')}]`);
    }
    console.log(`  continuation: ${cell.continuation}`);
    console.log(`  kind !== 'text': ${cell.kind_not_text}`);
    console.log(`  kind === 'text': ${cell.kind_equals_text}`);
    console.log(`  CONDITION (continuation && kind !== 'text'): ${cell.condition_result}`);
    console.log('');
  });

  expect(cellData.cells.length).toBe(3);
});
