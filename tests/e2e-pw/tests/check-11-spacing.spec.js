import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getWASMLayout } from '../helpers/inspectors.js';

test('verify "11" spacing is correct', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);

  // Type "11"
  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('11');

  // Wait for render
  await page.waitForTimeout(500);

  // Get WASM Display List
  const displayListText = await getWASMLayout(page);
  console.log('\n=== WASM Display List ===');
  console.log(displayListText);

  // Parse the display list to extract cell widths
  const displayListData = JSON.parse(displayListText);

  if (displayListData && displayListData.lines && displayListData.lines[0]) {
    const cells = displayListData.lines[0].cells;
    const totalWidth = cells.reduce((sum, cell) => sum + cell.w, 0);

    console.log(`\n=== Spacing Analysis ===`);
    console.log(`Cell 1: char="${cells[0].text}" width=${cells[0].w}px`);
    console.log(`Cell 2: char="${cells[1].text}" width=${cells[1].w}px`);
    console.log(`Total width: ${totalWidth}px`);
    console.log(`Expected: ~18px (9px per "1")`);
    console.log(`Actual/Expected ratio: ${(totalWidth / 18).toFixed(2)}x`);

    // Assert reasonable width (within 20% of expected)
    expect(totalWidth).toBeGreaterThan(14); // 18 * 0.8
    expect(totalWidth).toBeLessThan(22);    // 18 * 1.2
  }

  // Check debug logs
  const debugLogs = logs.filter(log => log.includes('[DEBUG]'));
  console.log('\n=== Debug Logs ===');
  debugLogs.forEach(log => console.log(log));
});
