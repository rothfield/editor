import { test, expect } from '@playwright/test';
import { getWASMLayout } from '../helpers/inspectors.js';

test('verify "188" spacing - pitched vs unpitched', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('188');

  await page.waitForTimeout(500);

  // Get WASM Display List
  const displayListText = await getWASMLayout(page);
  const displayListData = JSON.parse(displayListText);

  if (displayListData && displayListData.lines && displayListData.lines[0]) {
    const cells = displayListData.lines[0].cells;

    console.log('\n=== Spacing Analysis for "188" ===');
    console.log(`Cell 0 ("1"): char="${cells[0].text}" width=${cells[0].w}px classes=${cells[0].classes.join(' ')}`);
    console.log(`Cell 1 ("8"): char="${cells[1].text}" width=${cells[1].w}px classes=${cells[1].classes.join(' ')}`);
    console.log(`Cell 2 ("8"): char="${cells[2].text}" width=${cells[2].w}px classes=${cells[2].classes.join(' ')}`);

    console.log(`\nWidth of "11" would be: ${cells[0].w * 2}px`);
    console.log(`Width of "88" is: ${cells[1].w + cells[2].w}px`);
    console.log(`Difference: ${Math.abs((cells[0].w * 2) - (cells[1].w + cells[2].w))}px`);
  }
});
