import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check beat structure with ornaments', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type just "2 3 4 1" without ornament first
  await editor.click();
  await page.keyboard.type('2 3 4 1');
  await page.waitForTimeout(300);

  // Check display list (beat structure)
  await openTab(page, 'tab-displaylist');
  const displaylist = await readPaneText(page, 'pane-displaylist');
  console.log('Display list (beat structure):');
  console.log(displaylist.substring(0, 1000));

  // Now check docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');
  const lines = docmodel.split('\n').slice(0, 50);
  console.log('\nFirst 50 lines of docmodel:');
  console.log(lines.join('\n'));

  expect(displaylist.length).toBeGreaterThan(0);
});
