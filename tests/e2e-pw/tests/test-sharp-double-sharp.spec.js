import { test, expect } from '@playwright/test';

test('Compare 1# vs 1## glyphs', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing 1# vs 1## ===\n');

  // Test 1#
  await editor.click();
  await page.keyboard.type('1#');
  await page.waitForTimeout(300);

  const doc1 = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return {
      cells: doc.lines[0].cells.map(cell => ({
        char: cell.char,
        pitch_code: cell.pitch_code,
        codepoint: cell.char ? '0x' + cell.char.charCodeAt(0).toString(16).toUpperCase() : 'N/A'
      }))
    };
  });

  console.log('1# gives:', JSON.stringify(doc1, null, 2));

  // Clear and test 1##
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('1##');
  await page.waitForTimeout(300);

  const doc2 = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return {
      cells: doc.lines[0].cells.map(cell => ({
        char: cell.char,
        pitch_code: cell.pitch_code,
        codepoint: cell.char ? '0x' + cell.char.charCodeAt(0).toString(16).toUpperCase() : 'N/A'
      }))
    };
  });

  console.log('1## gives:', JSON.stringify(doc2, null, 2));
  
  console.log('\nExpected:');
  console.log('  1# should be N1s (sharp) at 0xE069');
  console.log('  1## should be N1ss (double-sharp) at 0xE06A or similar');
});
