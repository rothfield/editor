import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check beat structure AFTER applying ornament', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "2 3 4 1"
  await editor.click();
  await page.keyboard.type('2 3 4 1');
  await page.waitForTimeout(300);

  // Select first 3 and apply ornament
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  console.log('Applying Alt+0 ornament to first 3 cells...');
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Check docmodel AFTER ornament
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Find cells section and print all cells
  const cellsMatch = docmodel.match(/cells:\n([\s\S]*?)beats:/);
  if (cellsMatch) {
    console.log('All cells after ornament applied:');
    // Print first 200 lines or until we hit "beats:"
    const cellsSection = cellsMatch[1];
    const lines = cellsSection.split('\n').slice(0, 150);
    console.log(lines.join('\n'));
  }

  expect(docmodel.length).toBeGreaterThan(0);
});
